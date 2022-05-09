"use strict";

const { Gio, GLib, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Monitor = Me.imports.monitors.monitor;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

const ByteArray = imports.byteArray;

var meta = class Meta extends Monitor.monitor
{
    static { GObject.registerClass(this); }

    static name = _("Meta");

    constructor()
    {
        super();

        this.formats = {};

        /** Run-time data for this `Processor`. */
        this.stats = {
            ...this.stats,
        };

        /** Configuration values derived from extension settings. */
        this.config = {
            ...this.config,
        };
    }

    async query(cancellable = null)
    {
        super.query(cancellable);

        return { ...this.stats };
    }

    static newFromConfig(config)
    {
        if (typeof config === "string")
        {
            config = JSON.parse(config);
        }

        const newMonitor = new Meta();
        newMonitor.config = { ...newMonitor.config, ...config };
        return newMonitor;
    }
};