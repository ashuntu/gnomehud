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

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");
Gio._promisify(Gio.File.prototype, "enumerate_children_async", "enumerate_children_finish");

/**
 * System monitor for disks like HDDs or SSDs.
 */
var Disk = class Disk extends Monitor.Monitor
{
    static { GObject.registerClass(this); }

    static name = _("Disk");

    constructor()
    {
        super();

        this.formats = {
            WRITE: "WRITE",
            READ: "READ",
            WRITE_SPEED: "WRITE_SPEED",
            READ_SPEED: "READ_SPEED",
            WAIT: "WAIT",
        };

        /** Run-time data for this `Battery`. */
        this.stats = {
            ...this.stats,
            write: 0,
            read: 0,
            write_speed: 0,
            wait: 0,
            old: null,
        };

        /** Configuration values derived from extension settings. */
        this.config = {
            ...this.config,
            place: [ Monitor.places.OVERLAY ],
            label: "DSK",
            icon: "drive-harddisk",
            format: [ this.formats.WRITE_SPEED ],
            file: "/proc/diskstats",
            device: "",
            type: this.constructor.name,
        };
    }

    async query(cancellable = null)
    {
        super.query(cancellable);

        const data = await this.getData(cancellable);

        for (let i = 0; i < data.length; i++)
        {
            const row = data[i];
            if (row[2] === this.config.device)
            {
                this.stats.read = Number(row[3]);
                this.stats.write = Number(row[7]);

                this.stats.read_speed = Util.bytesToHuman(
                    (this.stats.read - this.stats.old.read) / Util.monoToSeconds(this.stats.updated - this.stats.old.updated),
                    this.config.precision
                );

                this.stats.write_speed = Util.bytesToHuman(
                    (this.stats.write - this.stats.old.write) / Util.monoToSeconds(this.stats.updated - this.stats.old.updated),
                    this.config.precision
                );

                break;
            }
        }

        return { ...this.stats };
    }

    /**
     * Get a string array of disks on the system.
     * 
     * @param {Gio.Cancellable} cancellable 
     * @returns {string[]} string array containing names of disks
     */
    async listDevices(cancellable = null)
    {
        const data = await this.getData(cancellable);

        const devices = [];
        for (let i = 0; i < data.length; i++)
        {
            devices.push(data[i][2]);
        }

        return devices;
    }

    /**
     * Get 2D array of all diskstats
     * 
     * @param {Gio.Cancellable} cancellable 
     * @returns {string[][]}
     */
    async getData(cancellable = null)
    {
        const file = Gio.File.new_for_path(this.config.file);
        const contents = await file.load_contents_async(cancellable);
        const data = ByteArray.toString(contents[0]).replace(/ +/g, " ");
        const lines = data.split("\n");

        const dataValues = [];
        for (let i = 0; i < lines.length; i++)
        {
            const line = lines[i].trim();
            if (!line) continue;
            dataValues.push(line.split(" "));
        }

        return dataValues;
    }

    static newFromConfig(config)
    {
        if (typeof config === "string")
        {
            config = JSON.parse(config);
        }

        const newMonitor = new Disk();
        newMonitor.config = { ...newMonitor.config, ...config };

        // set default device
        if (!newMonitor.config.device)
        {
            newMonitor.listDevices().then((devices) =>
            {
                for (let device of devices)
                {
                    // don't default to loopback device
                    if (!device.startsWith("loop"))
                    {
                        newMonitor.config.device = device;
                        break;
                    }
                }
            }).catch(logError);
        }

        return newMonitor;
    }
};