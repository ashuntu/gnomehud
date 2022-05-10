"use strict";

const { Adw, Gdk, Gio, GLib, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Util = Me.imports.util;

const Monitor = Me.imports.monitors.monitor;
const Battery = Me.imports.monitors.battery;
const Memory = Me.imports.monitors.memory;
const Processor = Me.imports.monitors.processor;
const Network = Me.imports.monitors.network;
const Disk = Me.imports.monitors.disk;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

let settings;
let monitorGroups = [];

class IndexedExpander extends Adw.ExpanderRow
{
    static { GObject.registerClass(this); }

    constructor(args)
    {
        super(args);

        this.children = [];
        this.footer = null;
    }

    push(child)
    {
        if (this.footer) this.remove(this.footer);

        this.add_row(child);
        this.children.push(child);
        
        if (this.footer) this.add_row(this.footer);
    }

    pop()
    {
        let child = this.children.pop();
        if (child) this.remove(child);
        return child;
    }

    setFooter(footer)
    {
        this.footer = footer;
        this.add_row(footer);
    }
}

class MonitorGroup extends Adw.PreferencesGroup
{
    static { GObject.registerClass(this); }

    constructor(monitor)
    {
        super();

        this.monitor = monitor;
        this.index = monitorGroups.length;
    }

    /**
     * Add UI elements that appear before `Monitor`-specific elements.
     */
    addPrefix()
    {
        const defaults = new monitorTypes[this.monitor.config.type]();

        this.expander = new Adw.ExpanderRow();
        this.add(this.expander);
        this.expander.set_title(this.monitor.constructor.name);
        this.expander.set_icon_name(`${this.monitor.config.icon}-symbolic`);

        // Place
        const placeRow = new Adw.ActionRow({ title: _("Place") });
        placeRow.set_tooltip_text(_("The area where this monitor will be shown."));
        this.expander.add_row(placeRow);

        const overlayCheck = Gtk.CheckButton.new_with_label("Overlay");
        overlayCheck.set_active(this.monitor.config.place.includes(Monitor.places.OVERLAY));
        placeRow.set_activatable_widget(overlayCheck);
        placeRow.add_suffix(overlayCheck);
        overlayCheck.connect("toggled", () => this.toggledPlace(overlayCheck, Monitor.places.OVERLAY));

        const indicatorCheck = Gtk.CheckButton.new_with_label("Indicator");
        indicatorCheck.set_active(this.monitor.config.place.includes(Monitor.places.INDICATOR));
        placeRow.add_suffix(indicatorCheck);
        indicatorCheck.connect("toggled", () => this.toggledPlace(indicatorCheck, Monitor.places.INDICATOR));

        const panelCheck = Gtk.CheckButton.new_with_label("Top Panel");
        panelCheck.set_active(this.monitor.config.place.includes(Monitor.places.PANEL));
        placeRow.add_suffix(panelCheck);
        panelCheck.connect("toggled", () => this.toggledPlace(panelCheck, Monitor.places.PANEL));

        // Label
        const labelRow = new Adw.ActionRow({ title: _("Label") });
        labelRow.set_tooltip_text(_("The label that may prefix this monitor."));
        this.expander.add_row(labelRow);

        const labelEntry = new Gtk.Entry({ text: this.monitor.config.label });
        labelEntry.set_placeholder_text(defaults.config.label);
        labelRow.add_suffix(labelEntry);
        labelRow.set_activatable_widget(labelEntry);

        this.monitor.bind("config.label", labelEntry, "text", () => saveMonitors());

        // Icon
        const iconRow = new Adw.ActionRow({ title: _("Icon") });
        iconRow.set_tooltip_text(_("The icon that may prefix this monitor."));
        this.expander.add_row(iconRow);

        const iconEntry = new Gtk.Entry({ text: this.monitor.config.icon });
        iconEntry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, `${this.monitor.config.icon}-symbolic`);
        iconEntry.set_placeholder_text(defaults.config.icon);
        iconRow.add_suffix(iconEntry);
        iconRow.set_activatable_widget(iconEntry);

        this.monitor.bind("config.icon", iconEntry, "text", () =>
        {
            saveMonitors()
            iconEntry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, `${iconEntry.get_text()}-symbolic`);
        });

        // Color
        const colorRow = new Adw.ActionRow({ title: _("Color") });
        colorRow.set_tooltip_text(_("The color of the text for this monitor."));
        this.expander.add_row(colorRow);

        const colorButton = Gtk.ColorButton.new();
        colorButton.set_use_alpha(false);
        colorButton.set_rgba(Util.stringToColor(this.monitor.config.color));
        colorRow.add_suffix(colorButton);
        colorRow.set_activatable_widget(colorButton);

        colorButton.connect("color-set", () =>
        {
            this.monitor.config.color = Util.colorToString(colorButton.get_rgba());
            saveMonitors();
        });

        // Precision
        const precisionRow = new Adw.ActionRow({ title: _("Number Precision") });
        precisionRow.set_tooltip_text(_("The number of decimal places to show (0-10)."));
        this.expander.add_row(precisionRow);

        const precisionSpin = Gtk.SpinButton.new_with_range(0, 10, 1);
        precisionSpin.set_value(this.monitor.config.precision);
        precisionRow.add_suffix(precisionSpin)
        precisionRow.set_activatable_widget(precisionSpin);

        this.monitor.bind("config.precision", precisionSpin, "value", () => saveMonitors());

        // Formats
        const formatExpander = new IndexedExpander({ title: _("Display Formats") });
        formatExpander.set_tooltip_text(_("The display formats/data types to show."));
        this.expander.add_row(formatExpander);

        this.monitor.config.format.forEach((x) => this.addFormatDropdown(formatExpander, x));

        const opRow = new Adw.ActionRow({ subtitle: _("Formats are displayed left-to-right or top-to-bottom when applicable") });
        opRow.set_activatable_widget(formatExpander);
        formatExpander.setFooter(opRow);
        
        const addButton = Gtk.Button.new_from_icon_name("list-add-symbolic");
        opRow.add_suffix(addButton);
        addButton.connect("clicked", () =>
        {
            this.addFormatDropdown(formatExpander);
        });

        const removeButton = Gtk.Button.new_from_icon_name("list-remove-symbolic");
        opRow.add_suffix(removeButton);
        removeButton.connect("clicked", () =>
        {
            this.removeFormatDropdown(formatExpander);
        });
    }

    /**
     * Add UI elements that appear after `Monitor`-specific elements.
     */
    addSuffix()
    {
        const actionRow = new Adw.ActionRow();
        this.add(actionRow);
        actionRow.set_activatable_widget(this.expander);

        // Down
        const downButton = Gtk.Button.new_from_icon_name("go-down-symbolic");
        actionRow.add_prefix(downButton);
        downButton.set_tooltip_text(_("Move monitor down."));
        downButton.connect("clicked", () => moveMonitorGroup(this, 1));

        // Count
        this.indexLabel = Gtk.Label.new(`${this.index + 1}`);
        actionRow.add_prefix(this.indexLabel);

        // Up
        const upButton = Gtk.Button.new_from_icon_name("go-up-symbolic");
        actionRow.add_prefix(upButton);
        upButton.set_tooltip_text(_("Move monitor up."));
        upButton.connect("clicked", () => moveMonitorGroup(this, -1));

        // Delete
        const deleteButton = Gtk.Button.new_from_icon_name("user-trash-symbolic");
        actionRow.add_suffix(deleteButton);
        deleteButton.connect("clicked", () => removeMonitorGroup(this));
    }

    /**
     * @param {IndexedExpander} expander the expander to append to
     * @param {string} selected the selected format
     */
    addFormatDropdown(expander, selected = null)
    {
        const formats = Object.values(this.monitor.formats);
        const formatRow = new Adw.ActionRow();
        expander.push(formatRow);

        const formatDropdown = Gtk.DropDown.new_from_strings(formats);
        formatDropdown.index = expander.children.length - 1;
        formatDropdown.set_hexpand(true);
        formatRow.set_activatable_widget(formatDropdown);
        formatRow.add_suffix(formatDropdown);

        if (selected)
        {
            for (let i = 0; i < formats.length; i++)
            {
                if (formatDropdown.get_model().get_string(i) === selected)
                {
                    formatDropdown.set_selected(i);
                    break;
                }
            }
        }
        else
        {
            this.monitor.config.format.push(Object.values(this.monitor.formats)[0]);
            saveMonitors();
        }

        formatDropdown.connect("notify::selected", () =>
        {
            let i = formatDropdown.index;
            this.monitor.config.format[i] = formatDropdown.get_selected_item().get_string();
            saveMonitors();
        });
    }

    /**
     * @param {IndexedExpander} expander 
     */
    removeFormatDropdown(expander)
    {
        expander.pop();
        this.monitor.config.format.pop();
        saveMonitors();
    }

    /**
     * Resets this `MonitorGroup`'s index label.
     */
    redrawNumberLabel()
    {
        this.indexLabel.set_text(`${this.index + 1}`);
    }

    /**
     * @param {Gtk.CheckButton} check 
     * @param {string} place 
     */
    toggledPlace(check, place)
    {
        if (check.get_active())
        {
            if (this.monitor.config.place.indexOf(place) < 0)
                this.monitor.config.place.push(place);
        }
        else
        {
            let i = this.monitor.config.place.indexOf(place);
            if (i >= 0) this.monitor.config.place.splice(i, 1);
        }

        saveMonitors();
    }

    toString()
    {
        return this.monitor.toConfigString();
    }
}

class ProcessorMonitorGroup extends MonitorGroup
{
    static { GObject.registerClass(this); }

    constructor(processor = null)
    {
        super(processor = processor ?? new Processor.processor());
        
        this.processor = processor;
        this.addPrefix();
        this.populate();
        this.addSuffix();
    }

    /**
     * Add widgets to this group.
     */
    populate()
    {
        const fileRow = new Adw.ActionRow({ title: _("Stat File") });
        fileRow.set_tooltip_text(_("File path cooresponding to the /proc/stat processor information."));
        this.expander.add_row(fileRow);

        const fileEntry = new Gtk.Entry({ text: this.processor.config.file });
        fileEntry.set_placeholder_text("/proc/stat");
        fileRow.set_activatable_widget(fileEntry);
        fileRow.add_suffix(fileEntry);
        
        this.processor.bind("config.file", fileEntry, "text", () => saveMonitors());
    }
}

class MemoryMonitorGroup extends MonitorGroup
{
    static { GObject.registerClass(this); }

    constructor(memory = null)
    {
        super(memory = memory ?? new Memory.memory());
        
        this.memory = memory;
        this.addPrefix();
        this.populate();
        this.addSuffix();
    }

    /**
     * Add widgets to this group.
     */
    populate()
    {
        const fileRow = new Adw.ActionRow({ title: _("Memory File") });
        this.expander.add_row(fileRow);
        const fileEntry = new Gtk.Entry({ text: this.memory.config.file });
        fileRow.add_suffix(fileEntry);

        this.memory.bind("config.file", fileEntry, "text", () => saveMonitors());
    }
}

class BatteryMonitorGroup extends MonitorGroup
{
    static { GObject.registerClass(this); }

    constructor(battery = null)
    {
        super(battery = battery ?? new Battery.battery());
        
        this.battery = battery;
        this.addPrefix();
        this.populate();
        this.addSuffix();
    }

    /**
     * Add widgets to this group.
     */
    populate()
    {
        const fileRow = new Adw.ActionRow({ title: _("Battery File") });
        this.expander.add_row(fileRow);
        const fileEntry = new Gtk.Entry({ text: this.battery.config.file });
        fileRow.add_suffix(fileEntry);

        this.battery.bind("config.file", fileEntry, "text", () => saveMonitors());
    }
}

class NetworkMonitorGroup extends MonitorGroup
{
    static { GObject.registerClass(this); }

    constructor(network = null)
    {
        super(network = network ?? new Network.network());
        
        this.network = network;
        this.addPrefix();
        this.populate();
        this.addSuffix();
    }

    /**
     * Add widgets to this group.
     */
    populate()
    {
        const deviceRow = new Adw.ActionRow({ title: _("Network Device")});
        this.expander.add_row(deviceRow);
        
        this.network.listDevices()
            .then((devices) =>
            {
                const deviceDropdown = Gtk.DropDown.new_from_strings(devices);
                deviceRow.add_suffix(deviceDropdown);
                deviceRow.set_activatable_widget(deviceDropdown);

                for (let i = 0; i < devices.length; i++)
                {
                    if (devices[i] === this.network.config.device)
                    {
                        deviceDropdown.set_selected(i);
                    }
                }

                deviceDropdown.connect("notify::selected", () =>
                {
                    this.network.config.device = devices[deviceDropdown.get_selected()];
                    saveMonitors();
                });
            })
            .catch(logError);

        const fileRow = new Adw.ActionRow({ title: _("/proc File") });
        this.expander.add_row(fileRow);
        const fileEntry = new Gtk.Entry({ text: this.network.config.file });
        fileRow.add_suffix(fileEntry);

        this.network.bind("config.file", fileEntry, "text", () => saveMonitors());

        const devicesRow = new Adw.ActionRow({ title: _("/sys Directory") });
        this.expander.add_row(devicesRow);
        const devicesEntry = new Gtk.Entry({ text: this.network.config.deviceDir });
        devicesRow.add_suffix(devicesEntry);

        this.network.bind("config.deviceDir", devicesEntry, "text", () => saveMonitors());
    }
}

class DiskMonitorGroup extends MonitorGroup
{
    static { GObject.registerClass(this); }

    constructor(disk = null)
    {
        super(disk = disk ?? new Disk.disk());
        
        this.disk = disk;
        this.addPrefix();
        this.populate();
        this.addSuffix();
    }

    /**
     * Add widgets to this group.
     */
    populate()
    {
        const deviceRow = new Adw.ActionRow({ title: _("Disk")});
        this.expander.add_row(deviceRow);

        this.disk.listDevices()
            .then((devices) =>
            {
                const deviceDropdown = Gtk.DropDown.new_from_strings(devices);
                deviceRow.add_suffix(deviceDropdown);
                deviceRow.set_activatable_widget(deviceDropdown);

                for (let i = 0; i < devices.length; i++)
                {
                    if (devices[i] === this.disk.config.device)
                    {
                        deviceDropdown.set_selected(i);
                    }
                }

                deviceDropdown.connect("notify::selected", () =>
                {
                    this.disk.config.device = devices[deviceDropdown.get_selected()];
                    saveMonitors();
                });
            })
            .catch(logError);

        const fileRow = new Adw.ActionRow({ title: _("/proc File") });
        this.expander.add_row(fileRow);
        const fileEntry = new Gtk.Entry({ text: this.disk.config.file });
        fileRow.add_suffix(fileEntry);
        fileRow.set_activatable_widget(fileEntry);
    }
}

const monitorTypes = {
    Processor: Processor.processor,
    Memory: Memory.memory,
    Battery: Battery.battery,
    Network: Network.network,
    Disk: Disk.disk,
};

const groupTypes = {
    Processor: ProcessorMonitorGroup,
    Memory: MemoryMonitorGroup,
    Battery: BatteryMonitorGroup,
    Network: NetworkMonitorGroup,
    Disk: DiskMonitorGroup,
};

/**
 * Intialize objects needed for the preferences page.
 */
function init()
{
    settings = ExtensionUtils.getSettings();
}

/**
 * Create the preferences window.
 * 
 * @param {Adw.PreferencesWindow} window 
 */
function fillPreferencesWindow(window)
{
    window.set_search_enabled(true);
    window.set_title(Me.metadata.name);
    window.set_icon_name(`${settings.get_string("icon")}-symbolic`);

    window.add(newGeneralPage());
    window.add(newStylesPage());
    window.add(newMonitorsPage());
}

/**
 * @returns {Adw.PreferencesPage} new General page
 */
function newGeneralPage()
{
    const page = new Adw.PreferencesPage({
        icon_name: `preferences-system-symbolic`,
        title: _("General")
    });

    const group = new Adw.PreferencesGroup();
    page.add(group);

    // show-indicator
    const indicatorRow = new Adw.ActionRow({
        title: _("Show Extension Indicator"),
        subtitle: _(`Use 'gnome-extensions prefs ${Me.metadata.uuid}' to access this window manually.`)
    });
    group.add(indicatorRow);

    const indicatorToggle = newSwitch("show-indicator");

    indicatorRow.add_suffix(Gtk.Image.new_from_icon_name(`${settings.get_string("icon")}-symbolic`));
    indicatorRow.add_suffix(indicatorToggle);
    indicatorRow.activatable_widget = indicatorToggle;
    addResetButton(indicatorRow, "show-indicator");

    // show-overlay
    const overlayRow = new Adw.ActionRow({ title: _("Show Overlay") });
    group.add(overlayRow);

    const overlayToggle = newSwitch("show-overlay");

    overlayRow.add_suffix(overlayToggle);
    overlayRow.activatable_widget = overlayToggle;
    addResetButton(overlayRow, "show-overlay");

    // show-osd
    const osdRow = new Adw.ActionRow({ title: _("Show Toggle Alerts") });
    group.add(osdRow);

    const osdToggle = newSwitch("show-osd");

    osdRow.add_suffix(osdToggle);
    osdRow.activatable_widget = osdToggle;
    addResetButton(osdRow, "show-osd");

    // update-delay
    const delayRow = new Adw.ActionRow({ title: _("Update Interval (ms)") });
    group.add(delayRow);

    const delayRange = Gtk.SpinButton.new_with_range(
        100, 5000, 100
    );

    settings.bind(
        "update-delay",
        delayRange,
        "value",
        Gio.SettingsBindFlags.DEFAULT
    );

    delayRow.add_suffix(delayRange);
    delayRow.activatable_widget = delayRange;
    addResetButton(delayRow, "update-delay");

    // keybinds
    const keybindGroup = new Adw.PreferencesGroup({ title: _("Keybinds") });
    page.add(keybindGroup);

    const toggleKeybindRow = new Adw.ActionRow({ title: _("Toggle Overlay") });
    keybindGroup.add(toggleKeybindRow);

    const toggleKeybindText = new Gtk.Text()

    let keybind = settings.get_strv("kb-toggle-overlay")[0];
    toggleKeybindText.set_text(keybind);
    toggleKeybindText.set_truncate_multiline(true);
    toggleKeybindText.connect("changed", () => keybindUpdate(toggleKeybindText));

    toggleKeybindRow.add_suffix(toggleKeybindText);
    toggleKeybindRow.activatable_widget = toggleKeybindText;
    addResetButton(toggleKeybindRow, "kb-toggle-overlay");

    // danger zone!
    const dangerGroup = new Adw.PreferencesGroup({ title: _("Danger Zone!") });
    page.add(dangerGroup);

    // reset
    const resetButton = Gtk.Button.new_with_label(_("Reset Settings"));
    resetButton.connect("clicked", () => resetButtonActivate());
    resetButton.set_margin_bottom(10);
    dangerGroup.add(resetButton);

    // disable
    const disableButton = Gtk.Button.new_with_label(_("Disable Extension"));
    disableButton.connect("clicked", () => disableButtonActivate());
    disableButton.set_margin_bottom(10);
    dangerGroup.add(disableButton);

    // disable
    const uninstallBUtton = Gtk.Button.new_with_label(_("Uninstall Extension"));
    uninstallBUtton.connect("clicked", () => uninstallButtonActivate());
    uninstallBUtton.set_margin_bottom(50);
    dangerGroup.add(uninstallBUtton);

    // info
    const infoLabel = Gtk.Label.new(_(`Source: ${Me.metadata.url}`));
    infoLabel.selectable = true;
    dangerGroup.add(infoLabel);

    return page;
}

/**
 * @returns {Adw.PreferencesPage} new Styles page
 */
function newStylesPage()
{
    const page = new Adw.PreferencesPage({
        icon_name: `applications-graphics-symbolic`,
        title: _("Styles")
    });

    const group = new Adw.PreferencesGroup();
    page.add(group);

    // icon
    const iconRow = new Adw.ActionRow({ title: _("Icon") });
    iconRow.set_tooltip_text(_("Icon to display in the top panel"));
    group.add(iconRow);

    const iconEntry = newIconEntry("icon", settings.get_string("icon"));
    iconRow.add_suffix(iconEntry);
    iconRow.set_activatable_widget(iconEntry);
    addResetButton(iconRow, "icon");

    // anchor-corner
    const anchorRow = new Adw.ActionRow({ title: _("Anchor Corner" )});
    group.add(anchorRow);

    const anchorSelector = Gtk.DropDown.new_from_strings([
        _("Top-Left"),
        _("Top-Right"),
        _("Bottom-Left"),
        _("Bottom-Right")
    ]);

    settings.bind(
        "anchor-corner",
        anchorSelector,
        "selected",
        Gio.SettingsBindFlags.DEFAULT
    );

    anchorRow.add_suffix(anchorSelector);
    anchorRow.activatable_widget = anchorSelector;
    addResetButton(anchorRow, "anchor-corner");

    // default-monitor
    const monitorRow = new Adw.ActionRow({ title: _("Default Display")} );
    group.add(monitorRow);

    const monitorSelector = Gtk.DropDown.new_from_strings([
        _("Primary"), "1", "2", "3", "4"
    ]);

    settings.bind(
        "default-monitor",
        monitorSelector,
        "selected",
        Gio.SettingsBindFlags.DEFAULT
    );

    monitorRow.add_suffix(monitorSelector);
    monitorRow.activatable_widget = monitorSelector;
    addResetButton(monitorRow, "default-monitor");

    // margin
    const marginRow = new Adw.ActionRow({ title: _("Margin") });
    marginRow.set_tooltip_text(_("Margin (in pixels) between the screen edge and the overlay"));
    group.add(marginRow);

    marginRow.add_suffix(Gtk.Image.new_from_icon_name("object-flip-horizontal-symbolic"));

    const marginHSpin = newSpinButton("margin-h", 0, 10000, 10);
    marginRow.add_suffix(marginHSpin);
    marginRow.set_activatable_widget(marginHSpin);

    marginRow.add_suffix(Gtk.Image.new_from_icon_name("object-flip-vertical-symbolic"));

    const marginVSpin = newSpinButton("margin-v", 0, 10000, 10);
    marginRow.add_suffix(marginVSpin);

    addResetButton(marginRow, ["margin-h", "margin-v"]);

    // size
    const sizeRow = new Adw.ActionRow({ title: _("Size") });
    sizeRow.set_tooltip_text(_("Overlay width and height (in pixels)"));
    group.add(sizeRow);

    sizeRow.add_suffix(Gtk.Image.new_from_icon_name("object-flip-horizontal-symbolic"));

    const width = newSpinButton("overlay-w", 0, 10000, 10);
    sizeRow.add_suffix(width);
    sizeRow.set_activatable_widget(width);

    sizeRow.add_suffix(Gtk.Image.new_from_icon_name("object-flip-vertical-symbolic"));

    const height = newSpinButton("overlay-h", 0, 10000, 10);
    sizeRow.add_suffix(height);
    sizeRow.set_activatable_widget(height);

    addResetButton(sizeRow, ["overlay-w", "overlay-h"]);

    // background-color
    const backgroundRow = new Adw.ActionRow({ title: _("Background Color") });
    group.add(backgroundRow);

    const backgroundOpacityScale = Gtk.Scale.new_with_range(
        Gtk.Orientation.HORIZONTAL,
        0, 1.0, 0.05
    );
    backgroundOpacityScale.set_hexpand(true);
    backgroundOpacityScale.set_draw_value(true);
    backgroundOpacityScale.set_digits(2);

    settings.bind(
        "background-opacity",
        backgroundOpacityScale.get_adjustment(),
        "value",
        Gio.SettingsBindFlags.DEFAULT
    );

    let rgbaB = new Gdk.RGBA();
    rgbaB.parse(settings.get_string("background-color"))
    const backgroundButton = Gtk.ColorButton.new();
    backgroundButton.set_use_alpha(false);
    backgroundButton.set_rgba(rgbaB);
    backgroundButton.connect(
        "color-set", 
        () => colorUpdated("background-color", backgroundButton)
    );

    backgroundRow.add_suffix(backgroundOpacityScale);
    backgroundRow.add_suffix(backgroundButton);
    backgroundRow.activatable_widget = backgroundButton;
    addResetButton(backgroundRow, ["background-color", "background-opacity"], 
        function()
        {
            let rgba = new Gdk.RGBA();
            rgba.parse(settings.get_string("background-color"));
            backgroundButton.set_rgba(rgba);
        }
    );

    // foreground-color
    const foregroundRow = new Adw.ActionRow({ title: _("Foreground Color") });
    group.add(foregroundRow);

    const foregroundOpacityScale = Gtk.Scale.new_with_range(
        Gtk.Orientation.HORIZONTAL,
        0,
        1.0,
        0.05
    );
    foregroundOpacityScale.set_hexpand(true);
    foregroundOpacityScale.set_draw_value(true);
    foregroundOpacityScale.set_digits(2);

    settings.bind(
        "foreground-opacity",
        foregroundOpacityScale.get_adjustment(),
        "value",
        Gio.SettingsBindFlags.DEFAULT,
    );

    let rgbaF = new Gdk.RGBA();
    rgbaF.parse(settings.get_string("foreground-color"))
    const foregroundButton = Gtk.ColorButton.new();
    foregroundButton.set_use_alpha(false);
    foregroundButton.set_rgba(rgbaF);
    foregroundButton.connect(
        "color-set", 
        () => colorUpdated("foreground-color", foregroundButton)
    );

    foregroundRow.add_suffix(foregroundOpacityScale);
    foregroundRow.add_suffix(foregroundButton);
    foregroundRow.activatable_widget = foregroundButton;
    addResetButton(foregroundRow, ["foreground-color", "foreground-opacity"], 
        function()
        {
            let rgba = new Gdk.RGBA();
            rgba.parse(settings.get_string("foreground-color"));
            foregroundButton.set_rgba(rgba);
        }
    );

    // border-radius
    const borderRow = new Adw.ActionRow({
        title: _("Border Radius"),
        subtitle: _("See: https://developer.mozilla.org/en-US/docs/Web/CSS/border-radius")
    });
    borderRow.set_tooltip_text(_("Overlay border radius (corner radius)."));
    group.add(borderRow);

    const borderEntry = newEntry("border-radius");

    borderRow.add_suffix(borderEntry);
    borderRow.set_activatable_widget(borderEntry);
    addResetButton(borderRow, "border-radius");

    // font
    const fontRow = new Adw.ActionRow({
        title: _("Font"),
        subtitle: _("Monospace fonts are highly recommended")
    });
    fontRow.set_tooltip_text(_("The font to use for all overlay text."));
    group.add(fontRow);

    const fontButton = Gtk.FontButton.new();
    fontButton.set_level(2);

    settings.bind(
        "font",
        fontButton,
        "font",
        Gio.SettingsBindFlags.DEFAULT
    );

    fontRow.add_suffix(fontButton);
    fontRow.set_activatable_widget(fontButton);
    addResetButton(fontRow, "font");

    return page;
}

/**
 * @returns {Adw.PreferencesPage} new Monitors page
 */
function newMonitorsPage()
{
    const page = new Adw.PreferencesPage({
        icon_name: `${settings.get_string("icon")}-symbolic`,
        title: _("Monitors")
    });

    const group = new Adw.PreferencesGroup({
        description: "Add New Monitor"
    });
    page.add(group);
    const addMonitorDropdown = Gtk.DropDown.new_from_strings([
        _("Select"),
        ...Object.values(monitorTypes).map(x => x.name),
    ]);
    group.add(addMonitorDropdown);
    addMonitorDropdown.connect("notify::selected", () => addMonitor(addMonitorDropdown, page));

    createMonitorGroups(page);

    return page;
}

/**
 * @param {Gtk.DropDown} dropdown
 * @param {Adw.PreferencesPage} page 
 * @returns
 */
function addMonitor(dropdown, page)
{
    const selected = dropdown.get_selected();
    if (selected == 0) return;

    const groups = [
        null,
        ...Object.values(groupTypes),
    ];

    const group = new groups[selected]();
    page.add(group);
    monitorGroups.push(group);
    saveMonitors();

    dropdown.set_selected(0);
}

/**
 * @returns {Monitor[]} array of `Monitor` objects
 */
function loadMonitors()
{
    const arr = [];
    const m = settings.get_strv("monitors");
    m.forEach((x) =>
    {
        const obj = JSON.parse(x);
        arr.push(monitorTypes[obj.type].newFromConfig(obj));
    });

    return arr;
}

/**
 * @param {Adw.PreferencesPage} page
 */
function createMonitorGroups(page)
{
    monitorGroups = [];
    const m = loadMonitors();
    m.forEach((x) =>
    {
        const group = new groupTypes[x.config.type](x);
        monitorGroups.push(group);
        page.add(group);
    });
}

/**
 * 
 * @param {Adw.PreferencesGroup} group group to move
 * @param {number} delta direction to move, positive moves "down", negative moves "up"
 */
function moveMonitorGroup(group, delta)
{
    if (delta === 0) return;

    const page = group.get_parent();

    const direction = delta / Math.abs(delta); // +/-1
    const swap = monitorGroups[group.index + direction];

    if (direction > 0)
    {
        if (group.index >= monitorGroups.length - 1) return;
        page.reorder_child_after(group, swap);
        monitorGroups[group.index++] = swap;
        monitorGroups[swap.index--] = group;
    }
    else if (direction < 0)
    {
        if (group.index <= 0) return;
        page.reorder_child_after(swap, group);
        monitorGroups[group.index--] = swap;
        monitorGroups[swap.index++] = group;
    }

    swap.redrawNumberLabel();
    group.redrawNumberLabel();
    saveMonitors();
}

/**
 * @param {MonitorGroup} group
 */
function removeMonitorGroup(group)
{
    const page = group.get_parent();
    page.remove(group);

    monitorGroups.splice(group.index, 1);

    for (let i = group.index; i < monitorGroups.length; i++)
    {
        monitorGroups[i].index--;
        monitorGroups[i].redrawNumberLabel();
    }

    saveMonitors();
}

/**
 * Save `Monitor`s to settings.
 */
function saveMonitors()
{
    const m = monitorGroups.map(x => x.toString());
    settings.set_strv("monitors", m);
}

/**
 * @param {string} key settings key
 * @returns {Gtk.Switch} a basic switch
 */
function newSwitch(key)
{
    const gtkSwitch = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER
    });

    settings.bind(
        key,
        gtkSwitch,
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );

    return gtkSwitch;
}

/**
 * @param {string} key settings key
 * @returns {Gtk.Entry} a basic Gtk.Entry
 */
function newEntry(key)
{
    const entry = Gtk.Entry.new();
    entry.set_placeholder_text(settings.get_default_value(key).get_string()[0]);

    settings.bind(
        key,
        entry,
        "text",
        Gio.SettingsBindFlags.DEFAULT
    );

    return entry;
}

/**
 * @param {string} key settings key
 * @param {string} icon icon name
 * @returns {Gtk.Entry} a new Gtk.Entry with given icon bound to input
 */
function newIconEntry(key, icon)
{
    const entry = newEntry(key);
    entry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, `${icon}-symbolic`);
    entry.connect("changed", () => entry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, `${entry.get_text()}-symbolic`));

    return entry;
}

/**
 * @param {string} key 
 * @param {Number} min 
 * @param {Number} max 
 * @param {Number} step 
 * @returns {Gtk.SpinButton}
 */
function newSpinButton(key, min = 0, max = 100, step = 10)
{
    const spin = Gtk.SpinButton.new_with_range(min, max, step);

    settings.bind(
        key,
        spin,
        "value",
        Gio.SettingsBindFlags.DEFAULT
    );

    return spin;
}

/**
 * Called when the kb-toggle-overlay field is changed. Updates the actual extension
 * setting.
 * 
 * @param {Gtk.Text} text
 */
function keybindUpdate(text)
{
    settings.set_strv("kb-toggle-overlay", [text.get_text()]);
}

/**
 * 
 * @param {string} key 
 * @param {Gtk.ColorButton} button 
 */
function colorUpdated(key, button)
{
    settings.set_string(key, button.get_rgba().to_string());
}

/**
 * Called when the reset button is pressed. Resets all extension settings.
 */
function resetButtonActivate()
{
    settings.set_boolean("show-overlay", false);
    settings.settings_schema.list_keys().forEach(x => settings.reset(x));
}

/**
 * Called when the disable button is pressed. Disables the extension manually.
 */
function disableButtonActivate()
{
    log(_(`${Me.metadata.uuid}: User disabling extension`));
    GLib.spawn_command_line_async(`gnome-extensions disable ${Me.metadata.uuid}`);
}

/**
 * Called when the uninstall button is pressed. Uninstalls (removes) the extension.
 */
function uninstallButtonActivate()
{
    log(_(`${Me.metadata.uuid}: User uninstalling extension`));
    GLib.spawn_command_line_async(`gnome-extensions uninstall ${Me.metadata.uuid}`);
}

/**
 * Adds a new Gtk.Button to the given row for resetting the given key.
 * 
 * @param {Adw.ActionRow} row the Adw.ActionRow to append to
 * @param {string|string[]} key the settings key to reset when pressed
 * @param {function} callback
 * @returns {Gtk.Button} the Gtk.Button created
 */
function addResetButton(row, key, callback = null)
{
    if (!Array.isArray(key)) key = [key];

    const button = Gtk.Button.new_from_icon_name("edit-undo-symbolic");
    row.add_suffix(button);

    key.forEach(x => button.connect("clicked", () => settings.reset(x)));
    key.forEach(x => settings.connect(`changed::${x}`, () => updateResetButton(button, x)));
    updateResetButton(button, key);
    if (callback) button.connect("clicked", () => callback());

    return button;
}

/**
 * Update the sensitivty of the given button based if the given key's value
 * is different from its default value.
 * 
 * @param {Gtk.Button} button the Gtk.Button to update
 * @param {string|string[]} key the settings key to check against
 */
function updateResetButton(button, key)
{
    if (!Array.isArray(key)) key = [key];

    button.set_sensitive(
        key.some((x) => !settings.get_default_value(x).equal(settings.get_value(x)))
    );
}