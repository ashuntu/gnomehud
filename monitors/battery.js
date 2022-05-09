"use strict";

const { Gio, GLib, GObject } = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Util = Me.imports.util;
const Monitor = Me.imports.monitors.monitor;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

const STATUS = {
    CHARGING: "CHARGING",
    DISCHARGING: "DISCHARGING",
    FULL: "FULL"
};

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");

/**
 * System monitor for battery devices.
 */
var battery = class Battery extends Monitor.monitor
{
    static { GObject.registerClass(this); }

    static name = _("Battery");

    constructor()
    {
        super();

        this.formats = {
            PERCENT: "PERCENT",
            TIME_TO_FULL: "TIME_TO_FULL",
            TIME_TO_EMPTY: "TIME_TO_EMPTY",
            TIME: "TIME",
        };

        /** Run-time data for this `Battery`. */
        this.stats = {
            ...this.stats,
            capacity: 0,                // charge %
            energy_now: 0,              // Wh of battery
            energy_full: 0,             // full Wh
            energy_full_design: 0,      // full design Wh
            status: STATUS.FULL,        // charging, discharging
            technology: "None",         // Li-poly, etc
            voltage_now: 0,             // current voltage,
            percent: 0.0,
            time_to_full: 0,
            time_to_empty: 0,
            time: 0,
        };

        /** Configuration values derived from extension settings. */
        this.config = {
            ...this.config,
            precision: 2,
            place: [ Monitor.places.OVERLAY ],
            label: "BAT",
            icon: "battery",
            format: [ this.formats.PERCENT ],
            file: "/sys/class/power_supply/BAT0/",
            type: this.constructor.name,
        };
    }

    async query(cancellable = null)
    {
        super.query(cancellable);

        const file = Gio.File.new_for_path(this.config.file.concat("present"));
        const content = await file.load_contents_async(cancellable);
        const data = Number(ByteArray.toString(content[0]));

        if (data != 1)
        {
            return null;
        }

        const files = [
            Gio.File.new_for_path(this.config.file.concat("capacity")),
            Gio.File.new_for_path(this.config.file.concat("energy_now")),
            Gio.File.new_for_path(this.config.file.concat("energy_full")),
            Gio.File.new_for_path(this.config.file.concat("energy_full_design")),
            Gio.File.new_for_path(this.config.file.concat("status")),
            Gio.File.new_for_path(this.config.file.concat("technology")),
            Gio.File.new_for_path(this.config.file.concat("voltage_now")),
        ];

        const results = await Promise.all(
            files.map(file => file.load_contents_async(cancellable))
        );

        results.forEach((result, i) =>
        {
            const name = files[i].get_basename();
            this.stats[name] = ByteArray.toString(result[0]);
            
            if (name != "technology" && name != "status")
            {
                this.stats[name] = Number(this.stats[name]);
            }
        });

        this.stats.percent = (this.stats.energy_now / this.stats.energy_full) * 100;

        // time to empty
        // if (this.stats.energy_now != this.stats.old.energy_now)
        // {
        //     const energyDif = this.stats.old.energy_now - this.stats.energy_now;
        //     const timeDif = this.stats.updated - this.stats.old.updated;
        //     const dif = (energyDif / timeDif);
        //     this.stats.time_to_empty = Util.monoToHuman(dif);
        // }

        return { ...this.stats };
    }

    static newFromConfig(config)
    {
        if (typeof config === "string")
        {
            config = JSON.parse(config);
        }

        const newMonitor = new Battery();
        newMonitor.config = { ...newMonitor.config, ...config };
        return newMonitor;
    }
};