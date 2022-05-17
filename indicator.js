"use strict";

const { Clutter, St, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
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

const monitorTypes = {
    Processor: Processor.processor,
    Memory: Memory.memory,
    Battery: Battery.battery,
    Network: Network.network,
    Disk: Disk.disk,
};

var indicator = class Indicator extends GObject.Object
{
    static { GObject.registerClass(this); }

    /**
     * Construct a new Indicator. `create()` must be called once other GObjects
     * are constructed.
     * 
     * @param {Object} extension 
     */
    constructor(extension)
    {
        super();

        this._extension = extension;
        this._settings = extension.settings;
        this._cancellable = extension.cancellable;
        this._connections = [];
        this._monitors = [];
    }

    /**
     * Create necessary bindings/objects for the Indicator to function.
     */
    create()
    {
        // Bind settings
        const settingsConnections = {
            "changed::icon": this.iconChanged,
            "changed::monitors": this.updatePanel,
        };

        for (let event in settingsConnections)
        {
            this._connections.push(
                this._settings.connect(event, settingsConnections[event].bind(this))
            );
        }

        this.updatePanel();
    }

    updatePanel()
    {
        if (this._button)
        {
            this._button.destroy();
            this._button = null;
        }

        if (this._eventLoop)
        {
            Mainloop.source_remove(this._eventLoop);
            this._eventLoop = null;
        }

        // Toolbar button
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        this._icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: `${this._settings.get_string("icon")}-symbolic` }),
            style_class: "system-status-icon"
        });

        this._box = new St.BoxLayout();
        this._box.set_vertical(false);
        this._box.add_child(this._icon);
        this._button.add_child(this._box);

        this._settings.bind(
            "show-indicator",
            this._button,
            "visible",
            Gio.SettingsBindFlags.DEFAULT
        );

        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);

        // Title
        const titleItem = new PopupMenu.PopupMenuItem(Me.metadata.name);
        titleItem.sensitive = false;
        this._button.menu.addMenuItem(titleItem);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Monitors
        this.updateMonitors();

        // Overlay switch
        const switchItem = new PopupMenu.PopupSwitchMenuItem(
            _("Overlay"), 
            this._settings.get_boolean("show-overlay"),
        );
        switchItem.connect("toggled", () => this.toggleOverlay());
        this._button.menu.addMenuItem(switchItem);

        this._settings.bind(
            "show-overlay",
            switchItem._switch,
            "state",
            Gio.SettingsBindFlags.DEFAULT
        );

        // Monitor button
        const systemMonitorButton = new PopupMenu.PopupMenuItem(_("Open System Monitor"));
        const app = Shell.AppSystem.get_default().lookup_app("gnome-system-monitor.desktop");
        systemMonitorButton.connect("activate", () => app.activate());
        this._button.menu.addMenuItem(systemMonitorButton);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings button
        const settingsItem = new PopupMenu.PopupMenuItem(_("Settings"));
        settingsItem.connect("activate", () => this.settingsButtonActivate());
        this._button.menu.addMenuItem(settingsItem);

        // Quit button
        const disableItem = new PopupMenu.PopupMenuItem(_("Disable Extension"));
        disableItem.connect("activate", () => this.disableButtonActivate());
        this._button.menu.addMenuItem(disableItem);

        if (!this._eventLoop)
        {
            this._eventLoop = Mainloop.timeout_add(
                this._settings.get_int("update-delay"),
                () => this.update().catch(logError)
            );
        }
    }

    updateMonitors()
    {
        // destroy old monitors
        for (let monitor of this._monitors)
        {
            monitor.destroy();
        }

        let popupNeeded = false;
        const m = this._settings.get_strv("monitors");
        this._monitors = [];

        for (let monitorString of m)
        {
            const mObj = JSON.parse(monitorString);
            const newMonitor = monitorTypes[mObj.type].newFromConfig(mObj);

            if (newMonitor.config.place.includes(Monitor.places.POPUP) ||
                newMonitor.config.place.includes(Monitor.places.INDICATOR))
            {
                if (newMonitor.config.place.includes(Monitor.places.POPUP))
                {
                    newMonitor.menuItem = new PopupMenu.PopupMenuItem(newMonitor.config.label);
                    newMonitor.menuItem.sensitive = false;
                    this._button.menu.addMenuItem(newMonitor.menuItem);

                    popupNeeded = true;
                }
                
                if (newMonitor.config.place.includes(Monitor.places.INDICATOR))
                {
                    newMonitor.icon = new St.Icon({
                        gicon: new Gio.ThemedIcon({ name: `${newMonitor.config.icon}-symbolic` }),
                        style_class: "system-status-icon"
                    });
                    newMonitor.label = new St.Label();
                    newMonitor.label.set_y_align(Clutter.ActorAlign.CENTER);
                    this._box.add_child(newMonitor.icon);
                    this._box.add_child(newMonitor.label);

                    if (this._icon)
                    {
                        this._icon.destroy();
                        this._icon = null;
                    }
                }

                this._monitors.push(newMonitor);
            }
            
        }

        if (popupNeeded)
        {
            this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }

    async update()
    {
        const updateStart = GLib.get_monotonic_time();

        const results = await Promise.all(
            this._monitors.map(m => m.query(this._cancellable))
        );

        results.forEach((stats, i) =>
        {
            const monitor = this._monitors[i];
            let monitorString = "";

            for (let format of monitor.config.format)
            {
                const val = stats[format.toLowerCase()];

                if (typeof val === "number")
                {
                    monitorString += `${val.toFixed(monitor.config.precision)}\t`;
                }
                else
                {
                    monitorString += `${val}\t`;
                }
            }
            
            if (monitor.menuItem)
            {
                monitor.menuItem.label.set_text(`${monitor.config.label}\t${monitorString}`);
            }

            if (monitor.label)
            {
                monitor.label.set_text(monitorString);
            }
        });;
    }

    /**
     * Called when the indicator switch is flipped. Toggles the show-overlay setting.
     */
    toggleOverlay()
    {
        this._settings.set_boolean("show-overlay", this._settings.get_boolean("show-overlay"));
    }

    /**
     * Called when the setting button is pressed. Opens the extension preferences 
     * window.
     */
    settingsButtonActivate()
    {
        log(_(`${Me.metadata.uuid}: Opening settings dialog`));
        ExtensionManager.openExtensionPrefs(Me.metadata.uuid, "", null);
    }

    /**
     * Called when the disable button is pressed. Disables the extension manually.
     */
    disableButtonActivate()
    {
        log(_(`${Me.metadata.uuid}: User disabling extension`));
        ExtensionManager.disableExtension(Me.metadata.uuid)
    }

    iconChanged()
    {
        this._icon.set_icon_name(`${this._settings.get_string("icon")}-symbolic`);
    }

    /**
     * Destroy this object and objects it created.
     */
    destroy()
    {
        // disconnect settings
        for (let event in this._connections)
        {
            this._settings.disconnect(event);
        }
        this._connections = [];

        for (let monitor of this._monitors)
        {
            monitor.destroy();
        }
        this._monitors = [];

        // destroy button
        if (this._button) this._button.destroy();
        this._button = null;
    }
}