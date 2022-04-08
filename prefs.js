"use strict";

const { Adw, Gio, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

let settings;

function init()
{
    settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.gnomehud");
}

function fillPreferencesWindow(window)
{
    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({ title: _("Settings") });
    page.add(group);

    // show-indicator
    const indicatorRow = new Adw.ActionRow({ title: _("Show Extension Indicator") });
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
    const overlayRow = new Adw.ActionRow({ title: _("Show Overlay") });
    group.add(overlayRow);

    const overlayToggle = new Gtk.Switch({
        active: settings.get_boolean("show-overlay"),
        valign: Gtk.Align.CENTER,
    });

    settings.bind(
        "show-overlay",
        overlayToggle,
        "active",
        Gio.SettingsBindFlags.DEFAULT,
    );

    overlayRow.add_suffix(overlayToggle);
    overlayRow.activatable_widget = overlayToggle;

    // update-delay
    const delayRow = new Adw.ActionRow({ title: _("Update Delay (ms)") });
    group.add(delayRow);

    const delayRange = Gtk.SpinButton.new_with_range(
        250, 5000, 250
    );

    settings.bind(
        "update-delay",
        delayRange,
        "value",
        Gio.SettingsBindFlags.DEFAULT,
    );

    delayRow.add_suffix(delayRange);
    delayRow.activatable_widget = delayRange;

    // anchor-corner
    const anchorRow = new Adw.ActionRow({ title: _("Anchor Corner" )});
    group.add(anchorRow);

    const anchorSelector = Gtk.DropDown.new_from_strings([
        "Top-Left",
        "Top-Right",
        "Bottom-Left",
        "Bottom-Right",
    ]);

    settings.bind(
        "anchor-corner",
        anchorSelector,
        "selected",
        Gio.SettingsBindFlags.DEFAULT,
    );

    anchorRow.add_suffix(anchorSelector);
    anchorRow.activatable_widget = anchorSelector;

    // default-monitor
    const monitorRow = new Adw.ActionRow({ title: _("Default Monitor")} );
    group.add(monitorRow);

    const monitorSelector = Gtk.DropDown.new_from_strings([
        "0", "1", "2", "3", "4"
    ]);

    settings.bind(
        "default-monitor",
        monitorSelector,
        "selected",
        Gio.SettingsBindFlags.DEFAULT,
    );

    monitorRow.add_suffix(monitorSelector);
    monitorRow.activatable_widget = monitorSelector;

    // background-opacity
    const backgroundOpacityRow = new Adw.ActionRow({ title: _("Background Opacity") });
    group.add(backgroundOpacityRow)

    const backgroundOpacityScale = Gtk.Scale.new_with_range(
        Gtk.Orientation.HORIZONTAL,
        0,
        1.0,
        0.05,
    );
    backgroundOpacityScale.set_hexpand(true);
    backgroundOpacityScale.set_draw_value(true);
    backgroundOpacityScale.set_digits(2);

    settings.bind(
        "background-opacity",
        backgroundOpacityScale.get_adjustment(),
        "value",
        Gio.SettingsBindFlags.DEFAULT,
    );

    backgroundOpacityRow.add_suffix(backgroundOpacityScale);
    backgroundOpacityRow.activatable_widget = backgroundOpacityScale;

    // foreground-opacity
    const foregroundOpacityRow = new Adw.ActionRow({ title: _("Foreground Opacity") });
    group.add(foregroundOpacityRow);

    const foregroundOpacityScale = Gtk.Scale.new_with_range(
        Gtk.Orientation.HORIZONTAL,
        0,
        1.0,
        0.05,
    );
    foregroundOpacityScale.set_hexpand(true);
    foregroundOpacityScale.set_draw_value(true);
    foregroundOpacityScale.set_digits(2);

    settings.bind(
        "foreground-opacity",
        foregroundOpacityScale.get_adjustment(),
        "value",
        Gio.SettingsBindFlags.DEFAULT,
    );

    foregroundOpacityRow.add_suffix(foregroundOpacityScale);
    foregroundOpacityRow.activatable_widget = foregroundOpacityScale;

    // keybinds
    const keybindGroup = new Adw.PreferencesGroup({ title: _("Keybinds") });
    page.add(keybindGroup);

    const toggleKeybindRow = new Adw.ActionRow({ title: _("Toggle Overlay") });
    keybindGroup.add(toggleKeybindRow);

    // addResetButton(toggleKeybindRow, "kb-toggle-overlay", 
    //     () => toggleKeybindText.set_text(settings.get_strv("kb-toggle-overlay")[0])
    // );

    const toggleKeybindText = new Gtk.Text()

    let keybind = settings.get_strv("kb-toggle-overlay")[0];
    toggleKeybindText.set_text(keybind);
    toggleKeybindText.set_truncate_multiline(true);
    toggleKeybindText.connect("changed", () => keybindUpdate(toggleKeybindText));

    toggleKeybindRow.add_suffix(toggleKeybindText);
    toggleKeybindRow.activatable_widget = toggleKeybindText;

    window.add(page);
}

function keybindUpdate(text)
{
    settings.set_strv("kb-toggle-overlay", [text.get_text()]);
}

// function addResetButton(row, key, callback)
// {
//     const button = Gtk.Button.new_from_icon_name("edit-undo-symbolic");
//     row.add_suffix(button);
//     button.set_sensitive(!settings.get_default_value(key).equal(settings.get_value(key)));
//     button.connect("clicked", () => {
//         button.set_sensitive(false);
//         settings.reset(key);
//         callback();
//     });

//     return button;
// }