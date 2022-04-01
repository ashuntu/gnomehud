"use strict";

const { St, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
const Me = ExtensionUtils.getCurrentExtension();

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
        this.toggled = false;
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
        log(`${Me.metadata.uuid}: Overlay toggled`);

        let icon = new Gio.ThemedIcon({ name: "face-laugh-symbolic" });
        Main.osdWindowManager.show(0, icon , "Overlay toggled\n\nUse Super+Alt+G to toggle", null);

        // Hide the overlay
        if (this.toggled)
        {
            this.overlay.destroy();

            this.toggled = false;
        }
        // Show the overlay
        else
        {
            this.overlay = new St.BoxLayout({name: "GNOME HUD"});
            let monitor = Main.layoutManager.monitors[0];
            let label = new St.Label();
            label.set_text("Hello");
            let icon = new St.Icon({
                gicon: new Gio.ThemedIcon({name: "face-laugh-symbolic"})
            });
            icon.sensitive = false;
            this.overlay.add_style_class_name("test");
            this.overlay.add_child(label);
            this.overlay.add_child(icon);
            this.overlay.set_position(monitor.width - 250, 100);
            this.overlay.set_size(200, 200);
            this.overlay.sensitive = false;
            Main.layoutManager.addChrome(this.overlay, null);

            this.toggled = true;
        }
    }

    destroy()
    {
        Main.wm.removeKeybinding("kb-toggle-overlay");

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}