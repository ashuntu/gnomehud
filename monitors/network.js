"use strict";

const { Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const NET_DIR = "/proc/net/dev";

const network = {};

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");

/**
 * Query current network data from the filesystem.
 * 
 * @returns {network} network info object
 */
var getNetwork = async(cancellable = null) =>
{
    const file = Gio.File.new_for_path(NET_DIR);
    const contents = await file.load_contents_async(cancellable);
    const data = ByteArray.toString(contents[0]).replace(/ +/g, " ");
    const lines = data.split("\n");
    lines.splice(0, 2);

    lines.forEach((x) =>
    {
        if (x.trim() == "") return;
        const line = x.trim().split(" ");
        const name = line[0].replace(":", "");

        if (network[name])
        {
            network[name].oldReceived = network[name].received;
            network[name].oldSent = network[name].oldSent; 
        }
        else
        {
            network[name] = {};
        }

        network[name].received = Number(line[1]);
        network[name].sent = Number(line[9]);
    });

    return network;
}