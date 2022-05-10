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

/**
 * System monitor for network devices.
 */
var network = class Network extends Monitor.monitor
{
    static { GObject.registerClass(this); }

    static name = _("Network");

    constructor()
    {
        super();

        this.formats = {
            SENT: "SENT",
            RECEIVED: "RECEIVED",
            SPEED_UP: "SPEED_UP",
            SPEED_DOWN: "SPEED_DOWN",
            PACKETS_SENT: "PACKETS_SENT",
            PACKETS_RECEIVED: "PACKETS_RECEIVED",
            PACKETS_UP: "PACKETS_UP",
            PACKETS_DOWN: "PACKETS_DOWN",
            PING: "PING",
        };

        /** Run-time data for this `Battery`. */
        this.stats = {
            ...this.stats,
            sent: 0,
            received: 0,
            speed_up: 0,
            speed_down: 0,
            packets_sent: 0,
            packets_received: 0,
            ping: 0,
            old: null,
        };

        /** Configuration values derived from extension settings. */
        this.config = {
            ...this.config,
            place: [ Monitor.places.OVERLAY ],
            label: "NET",
            icon: "preferences-system-network",
            format: [ this.formats.SPEED_DOWN ],
            file: "/proc/net/dev",
            deviceDir: "/sys/class/net/",
            pingURI: "https://example.com",
            type: this.constructor.name,
            device: "",
        };
    }

    async query(cancellable = null)
    {
        super.query(cancellable);

        const file = Gio.File.new_for_path(this.config.file);
        const contents = await file.load_contents_async(cancellable);
        const data = ByteArray.toString(contents[0]).replace(/ +/g, " ");
        const lines = data.split("\n");
        lines.splice(0, 2); // ignore header lines

        for (let i = 0; i < lines.length; i++)
        {
            let x = lines[i].trim();
            if (x == "") continue;
            const line = x.split(" ");
            const name = line[0].replace(":", "");

            if (name == this.config.device)
            {
                this.stats.received = Number(line[1]);
                this.stats.sent = Number(line[9]);
                this.stats.speed_down = Util.bytesToHuman(
                    (this.stats.received - this.stats.old.received) / Util.monoToSeconds(this.stats.updated - this.stats.old.updated),
                    this.config.precision
                ) + "/s";
                this.stats.speed_up = Util.bytesToHuman(
                    (this.stats.sent - this.stats.old.sent) / Util.monoToSeconds(this.stats.updated - this.stats.old.updated),
                    this.config.precision
                ) + "/s";

                if (this.config.format.includes(this.formats.PING))
                {
                    // TODO: ping the URI
                }

                break;
            }
        }

        return { ...this.stats };
    }

    /**
     * Get a string array of network devices on the system.
     * 
     * @param {Gio.Cancellable} cancellable 
     * @returns {string[]} string array containing names of network devices
     */
    async listDevices(cancellable = null)
    {
        const file = Gio.File.new_for_path(this.config.deviceDir);
        const iter = await file.enumerate_children_async(
            "standard::*", 
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, 
            GLib.PRIORITY_DEFAULT, cancellable
        ).catch(logError);

        const devices = [];
        let f = null;
        while (f = iter.next_file(cancellable))
        {
            devices.push(f.get_name());
        }

        return devices;
    }

    static newFromConfig(config)
    {
        if (typeof config === "string")
        {
            config = JSON.parse(config);
        }

        const newMonitor = new Network();
        newMonitor.config = { ...newMonitor.config, ...config };

        // set default device
        if (!newMonitor.config.device)
        {
            newMonitor.listDevices().then((devices) =>
            {
                for (let device of devices)
                {
                    // don't default to loopback device
                    if (device !== "lo")
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