"use strict";

const { Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

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
}