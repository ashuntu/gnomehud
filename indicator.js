"use strict";

const { St, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
const Me = ExtensionUtils.getCurrentExtension();

var indicator = class Indicator extends GObject.Object
{
    static
    {
        GObject.registerClass(this);
    }

    constructor(extension)
    {
        super();

        this._extension = extension;
    }

    create()
    {
        // Toolbar button
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: "face-laugh-symbolic" }),
            style_class: "system-status-icon",
        });
        this._button.add_child(icon);

        this._extension.settings.bind(
            "show-indicator",
            this._button,
            "visible",
            Gio.SettingsBindFlags.DEFAULT,
        );

        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);

        // Title
        let titleItem = new PopupMenu.PopupMenuItem("GNOME HUD");
        titleItem.sensitive = false;
        this._button.menu.addMenuItem(titleItem);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Overlay switch
        let switchItem = new PopupMenu.PopupSwitchMenuItem("Overlay", true);
        switchItem.connect("toggled", this._extension.overlay.toggle.bind(this._extension.overlay));
        this._button.menu.addMenuItem(switchItem);

        // Dev note: is there a better way to do this other than referencing _switch?
        this._extension.settings.bind(
            "show-overlay",
            switchItem._switch,
            "state",
            Gio.SettingsBindFlags.DEFAULT,
        );

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings button
        let settingsItem = new PopupMenu.PopupMenuItem("Settings");
        settingsItem.connect("activate", this.settingsButtonActivate.bind(this));
        this._button.menu.addMenuItem(settingsItem);

        // Quit button
        let disableItem = new PopupMenu.PopupMenuItem("Disable");
        disableItem.connect("activate", this.disableButtonActivate.bind(this));
        this._button.menu.addMenuItem(disableItem);
    }

    settingsButtonActivate()
    {
        log(`${Me.metadata.uuid}: Opening settings dialog`);
        ExtensionManager.openExtensionPrefs(Me.metadata.uuid, "", null);
    }

    disableButtonActivate()
    {
        log(`${Me.metadata.uuid}: User disabling extension`);
        ExtensionManager.disableExtension(Me.metadata.uuid)
    }

    destroy()
    {
        if (this._button) this._button.destroy();
        this._button = null;
    }
}