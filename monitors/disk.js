"use strict";

const { Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const DSK_DIR = "/proc/diskstats";

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");

/**
 * Query current disk data from the filesystem.
 * 
 * @returns {disk} disk info object
 */
var getDisks = async(cancellable = null) =>
{
    

    return null;
}