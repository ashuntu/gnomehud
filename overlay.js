"use strict";

const { St, Gdk, GObject, Gio, GLib, Shell, Meta } = imports.gi;

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
            "changed::margin-h": this.geometryChanged,
            "changed::margin-v": this.geometryChanged,
            "changed::overlay-w": this.geometryChanged,
            "changed::overlay-h": this.geometryChanged,
            "changed::background-opacity": this.updateBackground,
            "changed::foreground-opacity": this.updateForeground,
            "changed::background-color": this.updateBackground,
            "changed::foreground-color": this.updateForeground,
            "changed::border-radius": this.updateBackground,
            "changed::font": this.updateForeground,
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
                newMonitor.box.set_style("margin-left: 10px; margin-top: 10px;");

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

        this.updateGeometry();
        this.updateForeground();

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
            this.overlay.set_vertical(true);

            this.updateMonitors();

            const geo = this.updateGeometry();
            this.overlay.set_position(geo.x, geo.y);
            this.overlay.set_size(geo.width, geo.height);
            this.overlay.add_style_class_name("overlay");

            this.updateBackground();
            this.updateForeground();

            Main.uiGroup.add_actor(this.overlay);

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
            //this._cancellable.cancel();

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
     * Get the anchor coordinates and dimensions for the overlay.
     * 
     * @returns {Object} x, y, width, height object
     */
    updateGeometry()
    {
        const mI = this._settings.get_int("default-monitor") - 1;
        this.monitor = Main.layoutManager.primaryMonitor;
        if (mI >= 0) this.monitor = Main.layoutManager.monitors[mI] ?? Main.layoutManager.primaryMonitor;

        const anchor = this._settings.get_int("anchor-corner");
        let x = this.monitor.x;
        let y = this.monitor.y;
        let width = this._settings.get_int("overlay-w");
        let height = this._settings.get_int("overlay-h");

        let h = 0;
        this._monitors.forEach((m) =>
        {
            h += m.box.get_children()[0].get_height();

            let w = 0;
            m.box.get_children().forEach((c) =>
            {
                w += c.get_width();
            });

            width = Math.max(width, w);
        });

        height = Math.max(height, h);

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

        return { 
            x: x,
            y: y,
            width: width,
            height: height,
        };
    }

    /**
     * Called when a geometry setting like location or size is changed. Updates
     * the overlay position.
     */
    geometryChanged()
    {
        const geo = this.updateGeometry();

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
            const rgba = Util.stringToColor(this._settings.get_string("background-color"));
            const str = Util.getCSSColor(rgba, this._settings.get_double("background-opacity"));
            this.overlay.set_style(
                `background-color: ${str}` +
                `border-radius: ${this._settings.get_string("border-radius")}`
            );
        }
    }

    /**
     * Called when foreground color is changed. Updates the foreground color and
     * opacity.
     */
    updateForeground()
    {
        this._monitors.forEach((m) =>
        {
            const rgba = Util.stringToColor(m.config.color);
            const str = Util.getCSSColor(rgba, this._settings.get_double("foreground-opacity"));
            const font = Util.fontToCSS(this._settings.get_string("font"));

            m.box.set_height(Number(this._settings.get_string("font").match(/\d+/g)[0]) * 2);

            m.box.get_children().forEach((label) =>
            {
                label.set_style(
                    `color: ${str}` +
                    `font: ${font}`
                );
            });
        });
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

        Mainloop.source_remove(this._eventLoop);
        this._eventLoop = null;

        this._cancellable.cancel();

        this._monitors.forEach((m) =>
        {
            m.destroy();
        });
        this._monitors = null;

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}