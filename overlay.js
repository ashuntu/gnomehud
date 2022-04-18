"use strict";

const { St, Gdk, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;
const ByteArray = imports.byteArray;

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
const Me = ExtensionUtils.getCurrentExtension();

const Battery = Me.imports.battery;
const Memory = Me.imports.memory;
const Processor = Me.imports.processor;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

var overlay = class Overlay extends GObject.Object
{
    static
    {
        GObject.registerClass(this);
    }

    /**
     * Construct a new HUD Overlay. `create()` must be called once other GObjects
     * are constructed.
     * 
     * @param {Object} extension 
     */
    constructor(extension)
    {
        super();

        this._extension = extension;
        this._settings = extension.settings;
        this._connections = [];

        this.times = 0;
        this.n = 0;

        this.overlay = null;
        this.ramLabel = null;
        this.cpuLabel = null;
        this.batteryLabel = null;
    }

    /**
     * Create necessary bindings/objects for the Overlay to function.
     */
    create()
    {
        Main.wm.addKeybinding(
            "kb-toggle-overlay",
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this.toggleOverlay()
        );

        Main.layoutManager.connect("monitors-changed", () => this.geometryChanged());

        let settingsConnections = {
            "changed::show-overlay": this.toggle,
            "changed::update-delay": this.delayChanged,
            "changed::anchor-corner": this.geometryChanged,
            "changed::default-monitor": this.geometryChanged,
            "changed::margin-h": this.geometryChanged,
            "changed::margin-v": this.geometryChanged,
            "changed::overlay-w": this.geometryChanged,
            "changed::overlay-h": this.geometryChanged,
            "changed::background-opacity": this.updateBackground,
            "changed::foreground-opacity": this.updateForeground,
            "changed::background-color": this.updateBackground,
            "changed::foreground-color": this.updateForeground
        };

        for (let event in settingsConnections)
        {
            this._connections.push(
                this._settings.connect(event, settingsConnections[event].bind(this))
            );
        }
    }

    /**
     * Called when the kb-toggle-overlay keybind is pressed. Toggles the show-overlay setting.
     */
    toggleOverlay()
    {
        let toggled = !this._settings.get_boolean("show-overlay");
        this._settings.set_boolean("show-overlay", toggled);
    }

    /**
     * Toggle the Overlay on and off. Toggling off will destroy any created objects.
     */
    toggle()
    {
        log(_(`${Me.metadata.uuid}: Overlay toggled`));

        if (this._settings.get_boolean("show-osd"))
        {
            let icon = new Gio.ThemedIcon({ name: "utilities-system-monitor-symbolic" });
            Main.osdWindowManager.show(
                0, 
                icon, 
                _(`Overlay toggled\n\nUse ${this._settings.get_strv("kb-toggle-overlay")[0]} to toggle`), 
                null
            );
        }

        // Show the overlay
        if (this._settings.get_boolean("show-overlay"))
        {
            let geo = this.updateGeometry();

            // Overlay container
            this.overlay = new St.Widget();
            this.overlay.set_position(geo.x, geo.y);
            this.overlay.set_size(geo.width, geo.height);
            this.overlay.add_style_class_name("overlay");
            this.overlay.set_style(`font-size: ${this._settings.get_int("font-size")}px`);

            let x = 25;
            let y = 25;

            // RAM label
            if (this._settings.get_boolean("memory-enabled"))
            {
                this.ramLabel = new St.Label();
                this.ramLabel.set_text(_("RAM 0.00%"));
                this.ramLabel.set_position(x, y);
                this.overlay.add_child(this.ramLabel);
                y += 50;
            }

            // CPU label
            if (this._settings.get_boolean("processor-enabled"))
            {
                this.cpuLabel = new St.Label();
                this.cpuLabel.set_text(_("CPU 0.00%"));
                this.cpuLabel.set_position(x, y);
                this.overlay.add_child(this.cpuLabel);
                y += 50;
            }

            // Battery label
            if (this._settings.get_boolean("battery-enabled"))
            {
                this.batteryLabel = new St.Label();
                this.batteryLabel.set_text(_("BAT 0%"));
                this.batteryLabel.set_position(x, y);
                this.overlay.add_child(this.batteryLabel);
                y += 50;
            }

            this.updateBackground();
            this.updateForeground();

            Main.uiGroup.add_actor(this.overlay);

            this.update();

            if (!this._eventLoop)
            {
                this._eventLoop = Mainloop.timeout_add(
                    this._settings.get_int("update-delay"), 
                    () => this.update()
                );
            }
        }
        // Hide the overlay
        else
        {
            if (this.overlay) this.overlay.destroy();
            this.overlay = null;

            if (this._eventLoop)
            {
                Mainloop.source_remove(this._eventLoop);
                this._eventLoop = null;
            }
        }
    }

    /**
     * Query the hardware for updates and update overlay labels.
     * 
     * @returns {boolean} true
     */
    async update()
    {
        let updateStart = new GLib.DateTime();

        // RAM
        let ram = Memory.getRAM();
        let ramPerc = (ram.used / ram.total) * 100;

        this.ramLabel.set_text(_(`RAM ${ramPerc.toFixed(2)}%`));

        // CPU
        let cpu = await Processor.getCPU();

        let cpuD = cpu.total - cpu.oldTotal;
        let cpuUsedD = cpu.used - cpu.oldUsed;
        let cpuPerc = (cpuUsedD / cpuD) * 100;

        this.cpuLabel.set_text(_(`CPU ${cpuPerc.toFixed(2)}%`));

        // Battery
        let battery = Battery.getBattery();
        this.batteryLabel.set_text(_(`BAT ${battery.capacity}%`));

        // let updateEnd = new GLib.DateTime();
        // let time = updateEnd.difference(updateStart);
        // this.times += time;
        // this.n++;
        // log(this.times / this.n);

        return true;
    }

    /**
     * Called when the update-delay setting is changed and live updates the event
     * loop delay to reflect the change.
     */
    delayChanged()
    {
        if (this._eventLoop && this._settings.get_boolean("show-overlay"))
        {
            Mainloop.source_remove(this._eventLoop);
            this._eventLoop = null;
        }

        this._eventLoop = Mainloop.timeout_add(
            this._settings.get_int("update-delay"), 
            () => this.update()
        );
    }

    /**
     * Get the anchor coordinates and dimensions for the overlay.
     * 
     * @returns {Object} x, y, width, height object
     */
    updateGeometry()
    {
        let mI = this._settings.get_int("default-monitor") - 1;
        this.monitor = Main.layoutManager.primaryMonitor;
        if (mI >= 0) this.monitor = Main.layoutManager.monitors[mI] ?? Main.layoutManager.primaryMonitor;

        let anchor = this._settings.get_int("anchor-corner");
        let x = this.monitor.x;
        let y = this.monitor.y;
        let width = this._settings.get_int("overlay-w");
        let height = this._settings.get_int("overlay-h");

        // Left corners
        if (anchor % 2 == 0)
        {
            x += this._settings.get_int("margin-h");
        }
        // Right corners
        else
        {
            x += this.monitor.width - width - this._settings.get_int("margin-h");
        }
        // Top corners
        if (anchor <= 1)
        {
            y += this._settings.get_int("margin-v");
        }
        // Bottom corners
        else
        {
            y += this.monitor.height - height - this._settings.get_int("margin-v");
        }

        return { x: x, y: y, width: width, height: height };
    }

    /**
     * Called when a geometry setting like location or size is changed. Updates
     * the overlay position.
     */
    geometryChanged()
    {
        let geo = this.updateGeometry();

        if (this.overlay)
        {
            this.overlay.set_position(geo.x, geo.y);
            this.overlay.set_size(geo.width, geo.height);
        }
    }

    /**
     * Called when background color is changed. Updates the background color and
     * opacity.
     */
    updateBackground()
    {
        if (this.overlay)
        {
            let rgba = new Gdk.RGBA();
            rgba.parse(this._settings.get_string("background-color"));
            let str = this.getRGBAString(rgba, this._settings.get_double("background-opacity"));
            this.overlay.set_style(`background-color: ${str}`);
        }
    }

    /**
     * Called when foreground color is changed. Updates the foreground color and
     * opacity.
     */
    updateForeground()
    {
        let rgba = new Gdk.RGBA();
        rgba.parse(this._settings.get_string("foreground-color"));
        let str = this.getRGBAString(rgba, this._settings.get_double("foreground-opacity"));

        this.overlay.get_children().forEach((x) =>
            x.set_style(`color: ${str}`)
        );
    }

    /**
     * Gets the CSS RGBA string from a given Gdk.RGBA and opacity value.
     * 
     * @param {Gdk.RGBA} rgba 
     * @param {double} opacity 
     * @returns {string}
     */
    getRGBAString(rgba, opacity)
    {
        return `rgba(${rgba.red * 255}, ${rgba.green * 255}, ${rgba.blue * 255}, ${opacity});`;
    }

    /**
     * Destroy this object and objects it created.
     */
    destroy()
    {
        Main.wm.removeKeybinding("kb-toggle-overlay");

        for (let event in this._connections)
        {
            this._settings.disconnect(event);
        }

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}