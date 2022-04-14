"use strict";

const { Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const Main = imports.ui.main;

const BATT_DIR = "/sys/class/power_supply/BAT0/";

const STATUS = {
    CHARGING: "CHARGING",
    DISCHARGING: "DISCHARGING",
    FULL: "FULL"
};

const battery = {
    capacity: 0,                // charge %
    energyNow: 0,               // Wh of battery
    energyFull: 0,              // full Wh
    energyFullDesign: 0,        // full design Wh
    status: STATUS.FULL,    // charging, discharging
    technology: "None",         // Li-poly, etc
    voltageNow: 0,              // current voltage
};

/**
 * Query current battery data from the filesystem.
 * 
 * @returns {battery} battery info object
 */
var getBattery = () =>
{
    let file = Gio.File.new_for_path(BATT_DIR.concat("present"));
    let data = Number(ByteArray.toString(file.load_contents(null)[1]));

    if (data != 1)
    {
        return null;
    }

    file = Gio.File.new_for_path(BATT_DIR.concat("capacity"));
    battery.capacity = Number(ByteArray.toString(file.load_contents(null)[1]));

    file = Gio.File.new_for_path(BATT_DIR.concat("energy_now"));
    battery.energyNow = Number(ByteArray.toString(file.load_contents(null)[1]));

    file = Gio.File.new_for_path(BATT_DIR.concat("energy_full"));
    battery.energyFull = Number(ByteArray.toString(file.load_contents(null)[1]));

    file = Gio.File.new_for_path(BATT_DIR.concat("energy_full_design"));
    battery.energyFullDesign = Number(ByteArray.toString(file.load_contents(null)[1]));

    file = Gio.File.new_for_path(BATT_DIR.concat("status"));
    battery.status = ByteArray.toString(file.load_contents(null)[1]);

    file = Gio.File.new_for_path(BATT_DIR.concat("technology"));
    battery.technology = ByteArray.toString(file.load_contents(null)[1]);

    file = Gio.File.new_for_path(BATT_DIR.concat("voltage_now"));
    battery.voltageNow = Number(ByteArray.toString(file.load_contents(null)[1]));

    return battery;
}