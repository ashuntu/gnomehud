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
}

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
}

/**
 * Gets the CSS RGBA string from a given Gdk.RGBA and opacity value.
 *
 * @param {Gdk.RGBA} rgba 
 * @param {double} opacity 
 * @returns {string}
 */
function getCSSColor(rgba, opacity)
{
    return `rgba(${rgba.red * 255}, ${rgba.green * 255}, ${rgba.blue * 255}, ${opacity});`;
}