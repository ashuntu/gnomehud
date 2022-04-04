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

    const row = new Adw.ActionRow({ title: "Show Extension Indicator" });
    group.add(row);

    // show-indicator
    const toggle = new Gtk.Switch({
        active: settings.get_boolean("show-indicator"),
        valign: Gtk.Align.CENTER,
    });

    settings.bind(
        "show-indicator",
        toggle,
        "active",
        Gio.SettingsBindFlags.DEFAULT,
    );

    // show-overlay
    const overlayToggle = new Gtk.Switch({
        active: settings.get_boolean("show-overlay"),
        valign: Gtk.Align.CENTER,
    });

    row.add_suffix(toggle);
    row.activatable_widget = toggle;

    window.add(page);
}