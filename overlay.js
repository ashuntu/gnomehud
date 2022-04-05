"use strict";

const { Clutter, St, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;

const Main = imports.ui.main;

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

    constructor(extension)
    {
        super();

        this._extension = extension;

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

    create()
    {
        Main.wm.addKeybinding(
            "kb-toggle-overlay",
            this._extension.settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            this.toggle.bind(this),
        );
    }

    toggle()
    {
        log(_(`${Me.metadata.uuid}: Overlay toggled`));

        this._extension.settings.set_boolean(
            "show-overlay", 
            !this._extension.settings.get_boolean("show-overlay"),
        );
        
        let icon = new Gio.ThemedIcon({ name: "face-laugh-symbolic" });
        Main.osdWindowManager.show(0, icon , _("Overlay toggled\n\nUse Super+Alt+G to toggle"), null);

        // Hide the overlay
        if (!this._extension.settings.get_boolean("show-overlay"))
        {
            if (this.overlay) this.overlay.destroy();

            if (this._eventLoop)
            {
                Mainloop.source_remove(this._eventLoop);
                this._eventLoop = null;
            }
        }
        // Show the overlay
        else
        {
            this.overlay = new St.Widget();
            let monitor = Main.layoutManager.monitors[0];

            this.ramLabel = new St.Label();
            this.ramLabel.set_text(_("RAM 0.00%"));
            this.overlay.add_child(this.ramLabel);

            this.cpuLabel = new St.Label();
            this.cpuLabel.set_text(_("CPU 0.00%"));
            this.cpuLabel.set_position(0, 50);
            this.overlay.add_child(this.cpuLabel);

            this.overlay.add_style_class_name("test");
            
            this.overlay.set_position(monitor.width - 250, 100);
            this.overlay.set_size(200, 200);
            Main.layoutManager.addChrome(this.overlay, null);

            if (!this._eventLoop)
            {
                this._eventLoop = Mainloop.timeout_add(1000, this.update.bind(this));
            }
        }
    }

    update()
    {
        // RAM
        let stdoutRAM = String(GLib.spawn_command_line_sync("free")[1]);
        let dataRAM = stdoutRAM.match(/^\d+|\d+\b|\d+(?=\w)/g); // array of numbers in stdout

        this.ram.total = dataRAM[0];
        this.ram.used = dataRAM[1];

        this.ramLabel.set_text(_(`RAM ${((this.ram.used / this.ram.total) * 100).toFixed(2)}%`));

        // CPU
        let stdoutCPU = String(GLib.spawn_command_line_sync("head -n1 /proc/stat")[1]);
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

        this.cpuLabel.set_text(_(`CPU ${((cpuUsed / cpuDelta) * 100).toFixed(2)}%`));

        return true;
    }

    destroy()
    {
        Main.wm.removeKeybinding("kb-toggle-overlay");

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}