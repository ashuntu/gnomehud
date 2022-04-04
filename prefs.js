"use strict";

const { Adw, Gio, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init()
{

}

function fillPreferencesWindow(window)
{
    const settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.gnomehud");

    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup();
    page.add(group);

    // show-indicator
    const indicatorRow = new Adw.ActionRow({ title: "Show Extension Indicator" });
    group.add(indicatorRow);

    const indicatorToggle = new Gtk.Switch({
        active: settings.get_boolean("show-indicator"),
        valign: Gtk.Align.CENTER,
    });

    settings.bind(
        "show-indicator",
        indicatorToggle,
        "active",
        Gio.SettingsBindFlags.DEFAULT,
    );

    indicatorRow.add_suffix(indicatorToggle);
    indicatorRow.activatable_widget = indicatorToggle;

    // show-overlay
    const overlayRow = new Adw.ActionRow({ title: "Show Overlay" });
    group.add(overlayRow);

    const overlayToggle = new Gtk.Switch({
        active: settings.get_boolean("show-overlay"),
        valign: Gtk.Align.CENTER,
    });

    // TODO: properly bind toggle to overlay display
    settings.bind(
        "show-overlay",
        overlayToggle,
        "active",
        Gio.SettingsBindFlags.DEFAULT,
    );

    overlayRow.add_suffix(overlayToggle);
    overlayRow.activatable_widget = overlayToggle;

    window.add(page);
}