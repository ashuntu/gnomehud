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

const MEM_DIR = "/proc/meminfo";

const ram = {
    total: 0,               // total physical RAM KB
    used: 0,                // used RAM KB
    free: 0                 // available RAM KB
};

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");

/**
 * Query current RAM data from the filesystem.
 * 
 * @returns {ram} RAM info object
 */
var getRAM = async(cancellable = null) =>
{
    const file = Gio.File.new_for_path(MEM_DIR);
    const contents = await file.load_contents_async(cancellable);
    let data = ByteArray.toString(contents[0]);
    let dataRAM = data.match(/\d+/g);

    ram.total = parseInt(dataRAM[0]); // MemTotal
    ram.free = parseInt(dataRAM[2]); // MemAvailable
    ram.used = ram.total - ram.free;

    return ram;
};

var memory = class Memory extends Monitor.monitor
{
    static name = _("Memory");

    static { GObject.registerClass(this); }

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
            type: "Memory",
        }
    }

    async query(cancellable = null)
    {
        const file = Gio.File.new_for_path(this.config.file);
        const contents = await file.load_contents_async(cancellable);
        let data = ByteArray.toString(contents[0]);
        let dataRAM = data.match(/\d+/g);

        this.stats.total = parseInt(dataRAM[0]); // MemTotal
        this.stats.free = parseInt(dataRAM[2]); // MemAvailable
        this.stats.used = this.stats.total - this.stats.free;

        let ramPerc = (this.stats.used / this.stats.total) * 100;
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

        let newMonitor = new Memory();
        newMonitor.config = { ...newMonitor.config, ...config };
        return newMonitor;
    }
};