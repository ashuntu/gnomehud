"use strict";

const { Clutter, St, Gdk, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;
const ByteArray = imports.byteArray;

const Main = imports.ui.main;
const ExtensionManager = Main.extensionManager;

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

const monitorTypes = {
    Processor: Processor.processor,
    Memory: Memory.memory,
    Battery: Battery.battery,
    Network: Network.network,
    Disk: Disk.disk,
};

var overlay = class Overlay extends GObject.Object
{
    static { GObject.registerClass(this); }

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
        this._cancellable = extension.cancellable;
        this._connections = [];
        this._monitors = [];

        this.overlay = null;
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

        const settingsConnections = {
            "changed::show-overlay": this.toggle,
            "changed::update-delay": this.delayChanged,
            "changed::anchor-corner": this.geometryChanged,
            "changed::default-monitor": this.geometryChanged,
            "changed::vertical": this.geometryChanged,
            "changed::margin-h": this.geometryChanged,
            "changed::margin-v": this.geometryChanged,
            "changed::padding-h": this.geometryChanged,
            "changed::padding-v": this.geometryChanged,
            "changed::background-opacity": this.updateStyles,
            "changed::foreground-opacity": this.updateStyles,
            "changed::background-color": this.updateStyles,
            "changed::foreground-color": this.updateStyles,
            "changed::border-radius": this.updateStyles,
            "changed::font": this.geometryChanged,
            "changed::monitors": this.updateMonitors,
        };

        for (let event in settingsConnections)
        {
            this._connections.push(
                this._settings.connect(event, settingsConnections[event].bind(this))
            );
        }

        if (this._settings.get_boolean("show-overlay"))
        {
            this.toggle();
        }

        this.time = 0;
        this.n = 0;
    }

    /**
     * Creates or updates system monitors.
     */
    updateMonitors()
    {
        // TODO pause update loop

        // destroy old monitors
        if (this._monitors)
        {
            this._monitors.forEach((m) =>
            {
                m.destroy();
            });
        }

        // Load monitors from settings
        const m = this._settings.get_strv("monitors");
        this._monitors = [];

        // parse monitors from settings anew
        m.forEach((mon) =>
        {
            const mObj = JSON.parse(mon);
            const newMonitor = monitorTypes[mObj.type].newFromConfig(mObj);
            
            // We can ignore any monitors not being displayed on the overlay
            if (newMonitor.config.place.includes(Monitor.places.OVERLAY))
            {
                this._monitors.push(newMonitor);

                // create the box for the monitor
                newMonitor.box = new St.BoxLayout();
                newMonitor.box.set_vertical(false);

                // create label
                const label = new St.Label({ text: newMonitor.config.label });
                newMonitor.box.add_child(label);
                label.set_width(100);

                // create format labels
                newMonitor.config.format.forEach((f) =>
                {
                    const formatLabel = new St.Label();
                    newMonitor.box.add_child(formatLabel);
                    formatLabel.set_width(200);
                });
                
                // add the box to the parent box
                if (this.overlay) this.overlay.add_child(newMonitor.box);
            }
        });

        this.geometryChanged();

        // TODO start update loop
    }

    /**
     * Called when the kb-toggle-overlay keybind is pressed. Toggles the show-overlay setting.
     */
    toggleOverlay()
    {
        const toggled = !this._settings.get_boolean("show-overlay");
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
            const icon = new Gio.ThemedIcon({ name: "utilities-system-monitor-symbolic" });
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
            // Overlay container
            this.overlay = new St.BoxLayout();
            Main.uiGroup.add_actor(this.overlay);

            this.updateMonitors();
            this.geometryChanged();

            this.update().catch(logError);

            if (!this._eventLoop)
            {
                this._eventLoop = Mainloop.timeout_add(
                    this._settings.get_int("update-delay"), 
                    () => this.update().catch(logError)
                );
            }
        }
        // Hide the overlay
        else
        {
            this._monitors.forEach((m) => m.destroy());
            this._monitors = [];

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
        const updateStart = GLib.get_monotonic_time();

        const results = await Promise.all(
            this._monitors.map(m => m.query(this._cancellable))
        );

        results.forEach((stats, i) =>
        {
            const m = this._monitors[i];
            m.box.get_children().forEach((child, i) =>
            {
                if (i > 0)
                {
                    const val = stats[m.config.format[i - 1].toLowerCase()];
                    if (typeof val === "number")
                    {
                        child.set_text(`${val.toFixed(m.config.precision)}`);
                    }
                    else
                    {
                        child.set_text(`${val}`);
                    }
                }
            });
        });

        const updateEnd = GLib.get_monotonic_time();
        this.time += updateEnd - updateStart;
        // log(this.time / ++this.n);

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
     * Called when a geometry setting like location or size is changed. Updates
     * the overlay position.
     */
     geometryChanged()
     {
         this.updateStyles();
         this.updateGeometry();
     }

    /**
     * Update geometry-changing styles, locations, and sizes of overlay and monitors.
     */
    updateGeometry()
    {
        const anchor = this._settings.get_int("anchor-corner");
        const mI = this._settings.get_int("default-monitor") - 1;
        this.monitor = Main.layoutManager.primaryMonitor;
        if (mI >= 0) this.monitor = Main.layoutManager.monitors[mI] ?? Main.layoutManager.primaryMonitor;

        if (!this.overlay)
        {
            return;
        }

        // Monitor margins and padding
        for (let i = 0; i < this._monitors.length; i++)
        {
            const monitor = this._monitors[i];

            monitor.box.set_height(Number(this._settings.get_string("font").match(/\d+/g)[0]) * 2 + 10);

            const paddingV = this._settings.get_int("padding-v");
            const paddingH = this._settings.get_int("padding-h");

            monitor.box.set_style("");

            if (this._settings.get_boolean("vertical"))
            {
                Util.appendStyle(monitor.box, 
                    `margin-left: ${paddingH}px;` +
                    `margin-right: ${paddingH}px;`
                );

                if (i === 0)
                {
                    Util.appendStyle(monitor.box, `margin-top: ${paddingV}px;`);
                }
                else if (i === this._monitors.length - 1)
                {
                    Util.appendStyle(monitor.box, `margin-bottom: ${paddingV}px;`);
                }
            }
            else
            {
                Util.appendStyle(monitor.box, 
                    `margin-top: ${paddingV}px;` +
                    `margin-bottom: ${paddingV}px;`
                );

                if (i === 0)
                {
                    Util.appendStyle(monitor.box, `margin-left: ${paddingH}px;`);
                }
                else if (i === this._monitors.length - 1)
                {
                    Util.appendStyle(monitor.box, `margin-right: ${paddingH}px;`);
                }
            }

            monitor.box.ensure_style();
        }

        // Overlay dimensions and location
        this.overlay.set_vertical(this._settings.get_boolean("vertical"));
        let x = this.monitor.x;
        let y = this.monitor.y;
        const height = this.overlay.get_height();
        const width = this.overlay.get_width();

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

        this.overlay.set_position(x, y);
        //this.overlay.set_size(width, height);
    }

    /**
     * Update non-geometry-changing styles like colors and fonts.
     */
    updateStyles()
    {
        if (this.overlay)
        {
            // Update parent box
            const backgroundRGBA = Util.stringToColor(this._settings.get_string("background-color"));
            const backgroundColor = Util.getCSSColor(backgroundRGBA, this._settings.get_double("background-opacity"));

            this.overlay.set_style(
                `background-color: ${backgroundColor}` +
                `border-radius: ${this._settings.get_string("border-radius")}`
            );

            // Update monitor labels
            for (let monitor of this._monitors)
            {
                const rgba = Util.stringToColor(monitor.config.color);
                const color = Util.getCSSColor(rgba, this._settings.get_double("foreground-opacity"));
                const font = Util.fontToCSS(this._settings.get_string("font"));

                for (let label of monitor.box.get_children())
                {
                    label.set_style(
                        `color: ${color}` +
                        `font: ${font}`
                    );
                }
            }
        }
    }

    /**
     * Destroy this object and objects it created.
     */
    destroy()
    {
        Main.wm.removeKeybinding("kb-toggle-overlay");

        this._connections.forEach((c) => this._settings.disconnect(c));

        Mainloop.source_remove(this._eventLoop);
        this._eventLoop = null;

        this._cancellable.cancel();

        this._monitors.forEach((m) => m.destroy());
        this._monitors = null;

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}