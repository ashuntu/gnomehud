"use strict";

const { Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const BATT_DIR = "/sys/class/power_supply/BAT0/";

const STATUS = {
    CHARGING: "CHARGING",
    DISCHARGING: "DISCHARGING",
    FULL: "FULL"
};

const battery = {
    capacity: 0,                // charge %
    energy_now: 0,              // Wh of battery
    energy_full: 0,             // full Wh
    energy_full_design: 0,      // full design Wh
    status: STATUS.FULL,        // charging, discharging
    technology: "None",         // Li-poly, etc
    voltage_now: 0,             // current voltage
};

Gio._promisify(Gio.File.prototype, "load_contents_async", "load_contents_finish");

/**
 * Query current battery data from the filesystem.
 * 
 * @returns {battery} battery info object
 */
var getBattery = async(cancellable = null) =>
{
    const file = Gio.File.new_for_path(BATT_DIR.concat("present"));
    const content = await file.load_contents_async(cancellable);
    const data = Number(ByteArray.toString(content[0]));

    if (data != 1)
    {
        return null;
    }

    const files = [
        Gio.File.new_for_path(BATT_DIR.concat("capacity")),
        Gio.File.new_for_path(BATT_DIR.concat("energy_now")),
        Gio.File.new_for_path(BATT_DIR.concat("energy_full")),
        Gio.File.new_for_path(BATT_DIR.concat("energy_full_design")),
        Gio.File.new_for_path(BATT_DIR.concat("status")),
        Gio.File.new_for_path(BATT_DIR.concat("technology")),
        Gio.File.new_for_path(BATT_DIR.concat("voltage_now")),
    ];

    let results = await Promise.all(
        files.map(file => file.load_contents_async(cancellable))
    );

    results.forEach((result, i) =>
    {
        const name = files[i].get_basename();
        battery[name] = ByteArray.toString(result[0]);
        
        if (name != "technology" && name != "status")
        {
            battery[name] = Number(battery[name]);
        }
    });

    return battery;
}