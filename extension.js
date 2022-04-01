"use strict";

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
const Me = ExtensionUtils.getCurrentExtension();

const Indicator = Me.imports.indicator;
const Overlay = Me.imports.overlay;

function init()
{
    log(`${Me.metadata.uuid}: Initializing`);
    return new Extension();
}

class Extension
{
    enable()
    {   
        // log(GLib.spawn_command_line_async("free"));

        log(`${Me.metadata.uuid}: Enabling`);

        this.settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.gnomehud");

        this.indicator = new Indicator.indicator(this);
        this.overlay = new Overlay.overlay(this);
        this.indicator.create();
        this.overlay.create();
    }

    disable()
    {
        log(`${Me.metadata.uuid}: Disabling`);

        this.settings = null;

        if (this.indicator) this.indicator.destroy();
        this.indicator = null;

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}