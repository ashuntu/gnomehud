"use strict";

const { Clutter, St, Gdk, GObject, Gio, GLib, Gtk, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;
const ByteArray = imports.byteArray;

const Main = imports.ui.main;
const BackgroundMenu = imports.ui.backgroundMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
const Me = ExtensionUtils.getCurrentExtension();

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

        this.overlay = null;
        this.ramLabel = null;
        this.cpuLabel = null;

        this.ram = {
            total: 0,
            used: 0,
            free: 0,
        };

        this.cpu = {
            total: 0,
            used: 0,
            free: 0,
            oldTotal: 0,
            oldUsed: 0,
            oldFree: 0,
        };
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
            () => this.toggleOverlay(),
        );

        this._settings.connect("changed::show-overlay", () => this.toggle());
        this._settings.connect("changed::update-delay", () => this.delayChanged());
        this._settings.connect("changed::anchor-corner", () => this.geometryChanged());
        this._settings.connect("changed::default-monitor", () => this.geometryChanged());
        this._settings.connect("changed::margin-h", () => this.geometryChanged());
        this._settings.connect("changed::margin-v", () => this.geometryChanged());
        this._settings.connect("changed::overlay-w", () => this.geometryChanged());
        this._settings.connect("changed::overlay-h", () => this.geometryChanged());
        this._settings.connect("changed::background-opacity", () => this.updateBackground());
        this._settings.connect("changed::foreground-opacity", () => this.updateForeground());
        this._settings.connect("changed::background-color", () => this.updateBackground());
        this._settings.connect("changed::foreground-color", () => this.updateForeground());
        Main.layoutManager.connect("monitors-changed", () => this.geometryChanged());
    }

    /**
     * Called when the kb-toggle-overlay keybind is pressed. Toggles the show-overlay setting.
     */
    toggleOverlay()
    {
        this._settings.set_boolean("show-overlay", !this._settings.get_boolean("show-overlay"));
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
                null,
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

            // RAM label
            this.ramLabel = new St.Label();
            this.ramLabel.set_text(_("RAM 0.00%"));
            this.ramLabel.set_position(25, 25);
            this.overlay.add_child(this.ramLabel);

            // CPU label
            this.cpuLabel = new St.Label();
            this.cpuLabel.set_text(_("CPU 0.00%"));
            this.cpuLabel.set_position(25, 75);
            this.overlay.add_child(this.cpuLabel);

            this.updateBackground();
            this.updateForeground();

            Main.uiGroup.add_actor(this.overlay);

            if (!this._eventLoop)
            {
                this._eventLoop = Mainloop.timeout_add(
                    this._settings.get_int("update-delay"), 
                    () => this.update(),
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
    update()
    {
        // RAM
        let stdoutRAM = ByteArray.toString(GLib.spawn_command_line_sync("free")[1]);
        let dataRAM = stdoutRAM.match(/^\d+|\d+\b|\d+(?=\w)/g); // array of numbers in stdout

        this.ram.total = dataRAM[0];
        this.ram.used = dataRAM[1];
        let ramPerc = (this.ram.used / this.ram.total) * 100;

        this.ramLabel.set_text(_(`RAM ${ramPerc.toFixed(2)}%`));

        // CPU
        let stdoutCPU = ByteArray.toString(GLib.spawn_command_line_sync("head -n1 /proc/stat")[1]);
        let dataCPU = (stdoutCPU.split(" ")).filter((x) => { return x != "" && !isNaN(x) })
        
        this.cpu.oldTotal = this.cpu.total;
        this.cpu.oldUsed = this.cpu.used;
        this.cpu.oldFree = this.cpu.free;

        this.cpu.total = 0;
        dataCPU.forEach((x) => { this.cpu.total += parseInt(x); });
        this.cpu.free = parseInt(dataCPU[3]);
        this.cpu.used = this.cpu.total - this.cpu.free;

        let cpuDelta = this.cpu.total - this.cpu.oldTotal;
        let cpuUsed = this.cpu.used - this.cpu.oldUsed;
        let cpuPerc = (cpuUsed / cpuDelta) * 100;

        this.cpuLabel.set_text(_(`CPU ${cpuPerc.toFixed(2)}%`));

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
            () => this.update(),
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
        let width = Math.ceil(this.monitor.height * this._settings.get_double("overlay-w"));
        let height = Math.ceil(this.monitor.height * this._settings.get_double("overlay-h"));

        // Left corners
        if (anchor % 2 == 0)
        {
            x += Math.ceil(this.monitor.height * this._settings.get_double("margin-h"));
        }
        // Right corners
        else
        {
            x += this.monitor.width - width - Math.ceil(this.monitor.height * this._settings.get_double("margin-h"));
        }
        // Top corners
        if (anchor <= 1)
        {
            y += Math.ceil(this.monitor.height * this._settings.get_double("margin-v"));
        }
        // Bottom corners
        else
        {
            y += this.monitor.height - height - Math.ceil(this.monitor.height * this._settings.get_double("margin-v"));
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

        if (this.ramLabel)
        {
            this.ramLabel.set_style(`color: ${str}`);
        }
        
        if (this.cpuLabel)
        {
            this.cpuLabel.set_style(`color: ${str}`);
        }
    }

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

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}