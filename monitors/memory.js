"use strict";

const { Gio, GLib, GObject } = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Monitor = Me.imports.monitors.monitor;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");

/**
 * System monitor for memory devices like RAM.
 */
var Memory = class Memory extends Monitor.Monitor
{
    static { GObject.registerClass(this); }

    static name = _("Memory");

    constructor()
    {
        super();

        this.formats = {
            PERCENT_USED: "PERCENT_USED",
            PERCENT_FREE: "PERCENT_FREE",
            SPEED: "SPEED",
            TEMP: "TEMP",
            USED: "USED",
            FREE: "FREE",
            TOTAL: "TOTAL",
        };

        /** Run-time data for this `Memory`. */
        this.stats = {
            ...this.stats,
            total: 0,
            used: 0,
            free: 0,
            percent_used: 0.0,
            percent_free: 0.0,
            speed: 0.0,
            temp: 0,
        };

        /** Configuration values derived from extension settings. */
        this.config = {
            ...this.config,
            precision: 2,
            place: [ Monitor.places.OVERLAY ],
            label: "RAM",
            icon: "media-memory",
            format: [ this.formats.PERCENT_USED ],
            file: "/proc/meminfo",
            type: this.constructor.name,
        }
    }

    async query(cancellable = null)
    {
        super.query(cancellable);

        const file = Gio.File.new_for_path(this.config.file);
        const contents = await file.load_contents_async(cancellable);
        const data = ByteArray.toString(contents[0]);
        const dataRAM = data.match(/\d+/g);

        this.stats.total = parseInt(dataRAM[0]); // MemTotal
        this.stats.free = parseInt(dataRAM[2]); // MemAvailable
        this.stats.used = this.stats.total - this.stats.free;

        const ramPerc = (this.stats.used / this.stats.total) * 100;
        this.stats.percent_used = ramPerc;
        this.stats.percent_free = 100 - ramPerc;

        return { ...this.stats };
    }

    static newFromConfig(config)
    {
        if (typeof config === "string")
        {
            config = JSON.parse(config);
        }

        const newMonitor = new Memory();
        newMonitor.config = { ...newMonitor.config, ...config };
        return newMonitor;
    }
};