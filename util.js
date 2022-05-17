"use strict";

const { Gdk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

/**
 * Convert a Gdk.RGBA color object to a string.
 * 
 * @param {Gdk.RGBA} color
 * @returns {string} the string representation of the color
 */
var colorToString = (color) =>
{
    return color.to_string();
};

/**
 * Convert a string to a new Gdk.RGBA color.
 * 
 * @param {string} str
 * @returns {Gdk.RGBA} the newly created RGBA color
 */
var stringToColor = (str) =>
{
    const newColor = new Gdk.RGBA();
    newColor.parse(str);
    return newColor;
};

/**
 * Gets the CSS RGBA string from a given Gdk.RGBA and opacity value.
 *
 * @param {Gdk.RGBA} rgba 
 * @param {double} opacity 
 * @returns {string}
 */
var getCSSColor = (rgba, opacity) =>
{
    return `rgba(${rgba.red * 255}, ${rgba.green * 255}, ${rgba.blue * 255}, ${opacity});`;
};

/**
 * Append a style to a widget.
 * 
 * @param {St.Widget} widget 
 * @returns {St.Widget}
 */
var appendStyle = (widget, style) =>
{
    widget.set_style(`${widget.get_style()} ${style}`);

    return widget;
};

/**
 * Convert bytes to a human-readable format.
 * 
 * @param {number} bytes number of bytes
 * @param {boolean} si use SI units (1000), or 1024
 * @param {number} d decimal places
 * @returns {string}
 */
var bytesToHuman = (bytes, si = false, d = 2) =>
{
    const units = si ?
        ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"] :
        ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
    const div = si ? 1000 : 1024;
    let i = 0;

    while (bytes >= div)
    {
        bytes /= div;
        i++;
    }

    return `${bytes.toFixed(d)} ${units[i]}`;
};

/**
 * Convert a number from microseconds (monotonic time) to seconds.
 * 
 * @param {number} microseconds a number in microseconds
 * @returns {number} a number in seconds
 */
var monoToSeconds = (microseconds) =>
{
    return microseconds / (1000 * 1000);
}

/**
 * Convert a number from seconds to microseconds (monotonic time).
 * 
 * @param {number} seconds a number in seconds
 * @returns {number} a number in microseconds
 */
var secondsToMono = (seconds) =>
{
    return seconds * 1000 * 1000;
}

// var monoToHuman = (microseconds, d = 2) =>
// {
//     const units = ["s", "m", "h", "d"];
//     const divisor = [1000 * 1000, 60, 60, 24];
//     let string = `${microseconds / (1000 * 1000)}`;

//     return string;
// }

/**
 * Convert a GTK-style font to a CSS-style font
 * 
 * @param {string} font GTK-style font, e.g. "Monospace Bold 16"
 * @returns {string} CSS-style font, e.g. "16px Bold Monospace"
 */
var fontToCSS = (font) =>
{
    let css = "";
    let f = null;

    // font-size
    const regSize = /\d+/g;
    if (f = font.match(regSize))
    {
        css += `${f[0]}px `;
        font = font.replace(regSize, "");
    }

    return css.concat(font).trim();
}