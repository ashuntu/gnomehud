"use strict";

const { Clutter, St, Gdk, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;
const ByteArray = imports.byteArray;

const Main = imports.ui.main;
const ExtensionManager = Main.extensionManager;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Util = Me.imports.util;
const Monitor = Me.imports.monitors.monitor;
const Battery = Me.imports.monitors.battery;
const Memory = Me.imports.monitors.memory;
const Processor = Me.imports.monitors.processor;
const Network = Me.imports.monitors.network;
const Disk = Me.imports.monitors.disk;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

let _settings = null;
let _connections = [];
let _loop = null;
/** Set of functions to call each loop, passing the result of `query`. */
let _loopCallbacks = new Set();

let _time = 0;
let _n = 0;

/**
 * Dict of `Monitor` names to their types.
 */
var types = {
    Processor: Processor.Processor,
    Memory: Memory.Memory,
    Battery: Battery.Battery,
    Network: Network.Network,
    Disk: Disk.Disk,
};

/**
 * Array of `Monitor` objects parsed from settings.
 */
var monitors = [];

/**
 * Initialize settings connections and load `Monitor`s.
 */
var init = () =>
{
    _settings = ExtensionUtils.getSettings();
    _connections.push(_settings.connect("changed::monitors", () => load()));
    _connections.push(_settings.connect("changed::update-delay", () =>
    {
        stop();
        start();
    }));

    load();
}

/**
 * Loads and parses `Monitor` objects from settings into `monitors` and returns
 * it.
 * 
 * @returns {Monitor[]} array of `Monitor`s
 */
var load = () =>
{
    let newMonitors = [];

    for (let monitorString of _settings.get_strv("monitors"))
    {
        const obj = JSON.parse(monitorString);
        const monitor = types[obj.type].newFromConfig(obj);
        newMonitors.push(monitor);
    }

    let oldMonitors = monitors;
    monitors = newMonitors;
    oldMonitors.forEach(m => m.destroy());

    return monitors;
}

/**
 * Destroy all existing `Monitor`s.
 */
var destroy = () =>
{
    stop();

    _connections.forEach(c => _settings.disconnect(c));
    _connections = [];

    monitors.forEach(m => m.destroy());
    monitors = [];
}

/**
 * Query each `Monitor` in `monitors` and return the result.
 * 
 * Note: each function in `_loopCallbacks` will be called with the result of
 * the queries as a parameter.
 * 
 * @param {Gio.Cancellable} cancellable optional cancellable object
 * @param {boolean} call true to call each callback function, false to skip
 * @returns {object[]} array of results, one element per `Monitor`
 */
var query = async (cancellable = null, call = true) =>
{
    const updateStart = GLib.get_monotonic_time();

    const results = await Promise.all(
        monitors.map(m => m.query(cancellable))
    );

    if (call) _loopCallbacks.forEach(c => c(results));

    const updateEnd = GLib.get_monotonic_time();
    const diff = updateEnd - updateStart;
    _time += diff;
    log(`${diff}\t(avg. ${_time / ++_n})`);

    return results;
}

/**
 * Start (or restart) the `query()` loop.
 * 
 * @param {Gio.Cancellable} cancellable 
 */
var start = (cancellable = null) =>
{
    if (!_loop)
    {
        _loop = Mainloop.timeout_add(
            _settings.get_int("update-delay"),
            () => query(cancellable).catch(logError)
        );
    }
    else
    {
        stop();
        start(cancellable);
    }
}

/**
 * Stop the `query()` loop.
 */
var stop = () =>
{
    if (_loop) Mainloop.source_remove(_loop);
    _loop = null;
}

/**
 * Add `callback` to the `Set` of functions that are called after each `query()`,
 * and passed the result.
 * 
 * @param {Function} callback Function to be called per query
 * @returns {Set<Function>} the `Set` of callbacks with `callback` added
 */
var addCallback = (callback) =>
{
    return _loopCallbacks.add(callback);
}

/**
 * Remove `callback` from the `Set` of callback functions.
 * 
 * @param {Function} callback Function to remove from callback `Set`
 * @returns {boolean} `true` if `callback` was removed, `false` otherwise
 */
var removeCallback = (callback) =>
{
    return _loopCallbacks.delete(callback);
}