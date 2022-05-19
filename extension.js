"use strict";

const { Gio } = imports.gi;

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
const Me = ExtensionUtils.getCurrentExtension();

const Indicator = Me.imports.indicator;
const Overlay = Me.imports.overlay;
const MonitorManager = Me.imports.monitors.monitorManager;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

function init()
{
    log(`${Me.metadata.uuid}: Initializing`);
    ExtensionUtils.initTranslations(Me.metadata.uuid);
    return new Extension();
}

class Extension
{
    enable()
    {   
        log(_(`${Me.metadata.uuid}: Enabling`));

        this.settings = ExtensionUtils.getSettings();
        this.cancellable = new Gio.Cancellable();

        MonitorManager.init();
        MonitorManager.start(this.cancellable);

        this.indicator = new Indicator.indicator();
        this.overlay = new Overlay.overlay();
    }

    disable()
    {
        log(_(`${Me.metadata.uuid}: Disabling`));

        MonitorManager.destroy();

        this.settings = null;

        if (this.indicator) this.indicator.destroy();
        this.indicator = null;

        if (this.overlay) this.overlay.destroy();
        this.overlay = null;
    }
}