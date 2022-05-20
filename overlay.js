"use strict";

const { Clutter, St, Gdk, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;
const ByteArray = imports.byteArray;

const Main = imports.ui.main;
const ExtensionManager = Main.extensionManager;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Util = Me.imports.util;
const MonitorManager = Me.imports.monitors.monitorManager;
const Monitor = Me.imports.monitors.monitor;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

var Overlay = class Overlay extends GObject.Object
{
    static { GObject.registerClass(this); }

    /**
     * Construct a new HUD Overlay. `create()` must be called once other GObjects
     * are constructed.
     * 
     * @param {Object} extension 
     */
    constructor()
    {
        super();

        this._settings = ExtensionUtils.getSettings();
        this._connections = [];
        this._update = this.update.bind(this);

        this.overlay = null;

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
    }

    /**
     * Creates or updates system monitors.
     */
    updateMonitors()
    {
        // pause updates for the overlay
        MonitorManager.removeCallback(this._update);

        for (let monitor of MonitorManager.monitors)
        {
            if (monitor.config.place.includes(Monitor.places.OVERLAY))
            {
                monitor.box = new St.BoxLayout();
                monitor.box.set_vertical(false);

                // monitor label
                const label = new St.Label({ text: monitor.config.label });
                label.set_width(100);
                monitor.box.add_child(label);

                // add format labels
                for (let format of monitor.config.format)
                {
                    const formatLabel = new St.Label({ text: format.toLowerCase() });
                    formatLabel.set_width(200);
                    monitor.box.add_child(formatLabel);
                }

                if (this.overlay) this.overlay.add_child(monitor.box);
            }
        }

        this.geometryChanged();

        // start updates for the overlay
        MonitorManager.addCallback(this._update);
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
            this.overlay.set_track_hover(true);
            this.overlay.set_reactive(true);
            this.overlay.connect("notify::hover", () => this.updateStyles());
            Main.uiGroup.add_actor(this.overlay);

            this.updateMonitors();
            this.geometryChanged();
        }
        // Hide the overlay
        else
        {
            MonitorManager.removeCallback(this._update);

            if (this.overlay) this.overlay.destroy();
            this.overlay = null;
        }
    }

    /**
     * Query the hardware for updates and update overlay labels.
     */
    update(results)
    {
        results.forEach((stats, i) =>
        {
            const monitor = MonitorManager.monitors[i];
            monitor.box.get_children().forEach((child, j) =>
            {
                if (j > 0) // ignore monitor label
                {
                    const val = stats[monitor.config.format[j - 1].toLowerCase()];
                    if (typeof val === "number")
                    {
                        child.set_text(`${val.toFixed(monitor.config.precision)}`);
                    }
                    else
                    {
                        child.set_text(`${val}`);
                    }
                }
            });
        });
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
        for (let i = 0; i < MonitorManager.monitors.length; i++)
        {
            const monitor = MonitorManager.monitors[i];

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
                else if (i === MonitorManager.monitors.length - 1)
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
                else if (i === MonitorManager.monitors.length - 1)
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
        if (!this.overlay)
        {
            return;
        }

        const hoverMultiplier = this._settings.get_double("hover-multiplier");
        const hover = this.overlay.get_hover();

        // Update parent box
        let backgroundOpacity = this._settings.get_double("background-opacity");
        if (hoverMultiplier && hover)
        {
            backgroundOpacity *= hoverMultiplier + 1;
        }

        const backgroundRGBA = Util.stringToColor(this._settings.get_string("background-color"));
        const backgroundColor = Util.getCSSColor(backgroundRGBA, backgroundOpacity);

        this.overlay.set_style(
            `background-color: ${backgroundColor}` +
            `border-radius: ${this._settings.get_string("border-radius")}`
        );

        // Update monitor labels
        for (let monitor of MonitorManager.monitors)
        {
            let foregroundOpacity = this._settings.get_double("foreground-opacity");
            if (hoverMultiplier && hover)
            {
                foregroundOpacity *= hoverMultiplier + 1;
            }

            const rgba = Util.stringToColor(monitor.config.color);
            const color = Util.getCSSColor(rgba, foregroundOpacity);
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

    /**
     * Destroy this object and objects it created.
     */
    destroy()
    {
        Main.wm.removeKeybinding("kb-toggle-overlay");

        MonitorManager.removeCallback(this._update);

        this._connections.forEach((c) => this._settings.disconnect(c));
        this._connections = [];

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}