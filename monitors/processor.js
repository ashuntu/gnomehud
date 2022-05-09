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

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");
Gio._promisify(Gio.File.prototype, "enumerate_children_async", "enumerate_children_finish");

/**
 * System monitor for processors like CPUs.
 */
var processor = class Processor extends Monitor.monitor
{
    static { GObject.registerClass(this); }

    static name = _("Processor");

    constructor()
    {
        super();

        this.formats = {
            PERCENT_USED: "PERCENT_USED",
            PERCENT_FREE: "PERCENT_FREE",
            SPEED: "SPEED",
            TEMP: "TEMP",
        };

        /** Run-time data for this `Processor`. */
        this.stats = {
            ...this.stats,
            total: 0,
            used: 0,
            free: 0,
            oldTotal: 0,
            oldUsed: 0,
            oldFree: 0,
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
            label: "CPU",
            icon: "cpu-x",
            format: [ this.formats.PERCENT_USED ],
            file: "/proc/stat",
            tempDir: "/sys/class/thermal/",
            type: this.constructor.name,
        };
    }

    async query(cancellable = null)
    {
        super.query(cancellable);

        // Gather statistics
        const file = Gio.File.new_for_path(this.config.file);
        const contents = await file.load_contents_async(cancellable).catch(logError);
        const data = ByteArray.toString(contents[0]);

        const dataCPU = data.match(/\d+/g);

        this.stats.oldTotal = this.stats.total;
        this.stats.oldUsed = this.stats.used;
        this.stats.oldFree = this.stats.free;

        this.stats.total = 0;
        for (let i = 0; i < 10; i++) this.stats.total += parseInt(dataCPU[i]);
        this.stats.free = parseInt(dataCPU[3]);
        this.stats.used = this.stats.total - this.stats.free;

        // Calculate format values
        const cpuD = this.stats.total - this.stats.old.total;
        const cpuUsedD = this.stats.used - this.stats.old.used;
        const cpuPerc = (cpuUsedD / cpuD) * 100;
        this.stats.percent_used = cpuPerc;
        this.stats.percent_free = 100 - cpuPerc;

        const tempDir = Gio.File.new_for_path(this.config.tempDir);
        const iter = await tempDir.enumerate_children_async(
            "standard::*", 
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, 
            GLib.PRIORITY_DEFAULT, cancellable
        ).catch(logError);

        // Processor Temperature
        let f = null;
        while (f = iter.next_file(cancellable))
        {
            if (f.get_name().startsWith("thermal_zone"))
            {
                const zoneFile = Gio.File.new_for_path(`${this.config.tempDir}/${f.get_name()}/type`);
                const zoneContent = await zoneFile.load_contents_async(cancellable).catch(logError);
                const zoneType = ByteArray.toString(zoneContent[0]).trim();

                if (zoneType === "x86_pkg_temp")
                {
                    const tempFile = Gio.File.new_for_path(`${this.config.tempDir}/${f.get_name()}/temp`);
                    const tempContent = await tempFile.load_contents_async(cancellable).catch(logError);
                    const temp = Number(ByteArray.toString(tempContent[0]));

                    this.stats.temp = temp / 1000;

                    break;
                }
            }
        }

        return { ...this.stats };
    }

    static newFromConfig(config)
    {
        if (typeof config === "string")
        {
            config = JSON.parse(config);
        }

        const newMonitor = new Processor();
        newMonitor.config = { ...newMonitor.config, ...config };
        return newMonitor;
    }
};