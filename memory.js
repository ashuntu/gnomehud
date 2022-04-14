"use strict";

const { Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const MEM_DIR = "/proc/meminfo";

const ram = {
    total: 0,               // total physical RAM KB
    used: 0,                // used RAM KB
    free: 0                 // available RAM KB
};

/**
 * Query current RAM data from the filesystem.
 * 
 * @returns {ram} RAM info object
 */
var getRAM = () =>
{
    let file = Gio.File.new_for_path(MEM_DIR);
    let data = ByteArray.toString(file.load_contents(null)[1]);
    let dataRAM = (data.split(" ")).filter((x) => { return x != "" && !isNaN(x) });
        
    ram.total = dataRAM[0]; // MemTotal
    ram.free = dataRAM[2]; // MemAvailable
    ram.used = ram.total - ram.free;

    return ram;
}