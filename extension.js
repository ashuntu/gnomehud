"use strict";

const { St, GObject, Gio, Shell, Meta } = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
const Me = ExtensionUtils.getCurrentExtension();

let settings = null;

function exec()
{
    let proc = new Gio.Subprocess({
        argv: ["free"],
        flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE
    });
    proc.init(null);
    let result = proc.communicate_utf8(null, null);
    log(`RESULT: ${result}`);
}

class ExtensionPanel extends GObject.Object
{
    static
    {
        GObject.registerClass(this);
    }

    constructor()
    {
        super();

        // Main.wm.addKeybinding(
        //     "toggle-overlay",
        //     settings,
        //     Meta.KeyBindingFlags.NONE,
        //     Shell.ActionMode.ALL,
        //     this.overlayToggled.bind(this),
        // );
        
        // Toolbar button
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            style_class: 'system-status-icon'
        });
        this._button.add_child(icon);

        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);

        // Title
        let titleItem = new PopupMenu.PopupMenuItem("GNOME HUD");
        titleItem.sensitive = false;
        this._button.menu.addMenuItem(titleItem);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Overlay switch
        let switchItem = new PopupMenu.PopupSwitchMenuItem("Overlay", false);
        switchItem.connect("toggled", this.overlayToggled);
        this._button.menu.addMenuItem(switchItem);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings button
        let settingsItem = new PopupMenu.PopupMenuItem("Settings");
        settingsItem.connect("activate", this.settingsButtonActivate);
        this._button.menu.addMenuItem(settingsItem);

        // Quit button
        let quitItem = new PopupMenu.PopupMenuItem("Quit");
        quitItem.connect("activate", this.quitButtonActivate);
        this._button.menu.addMenuItem(quitItem);
    }

    overlayToggled()
    {
        log("Overlay toggled.");
    }

    settingsButtonActivate()
    {
        log(`${Me.metadata.uuid} settings opened.`);
        ExtensionManager.openExtensionPrefs(Me.metadata.uuid, "", null);
    }

    quitButtonActivate()
    {
        log("Quitting.");
    }
}

class Extension
{
    enable()
    {
        log(`Enabling ${Me.metadata.uuid}`);

        settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.gnomehud");

        //Main.pushModal(new St.Label());

        this._ext = new ExtensionPanel();
    }

    disable()
    {
        log(`Disabling ${Me.metadata.uuid}`);

        this._ext.destroy();
        this._ext = null;
    }
}

function init()
{
    log(`Initializing ${Me.metadata.uuid}`);
    return new Extension();
}
