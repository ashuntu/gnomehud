"use strict";

const { Clutter, St, GObject, Gio, GLib, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionManager = Main.extensionManager;
const Me = ExtensionUtils.getCurrentExtension();

const Util = Me.imports.util;
const MonitorManager = Me.imports.monitors.monitorManager;
const Monitor = Me.imports.monitors.monitor;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

var Indicator = class Indicator extends GObject.Object
{
    static { GObject.registerClass(this); }

    /**
     * Construct a new Indicator. `create()` must be called once other GObjects
     * are constructed.
     * 
     * @param {Object} extension 
     */
    constructor()
    {
        super();

        this._settings = ExtensionUtils.getSettings();
        this._connections = [];
        this._update = this.update.bind(this);

        // Bind settings
        const settingsConnections = {
            "changed::icon": this.iconChanged,
            "changed::monitors": this.updatePanel,
        };

        for (let event in settingsConnections)
        {
            this._connections.push(
                this._settings.connect(event, settingsConnections[event].bind(this))
            );
        }

        this.updatePanel();
    }

    updatePanel()
    {
        if (this._button)
        {
            this._button.destroy();
            this._button = null;
        }

        // Toolbar button
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        this._icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: `${this._settings.get_string("icon")}-symbolic` }),
            style_class: "system-status-icon"
        });

        this._box = new St.BoxLayout();
        this._box.set_vertical(false);
        this._box.add_child(this._icon);
        this._button.add_child(this._box);

        this._settings.bind(
            "show-indicator",
            this._button,
            "visible",
            Gio.SettingsBindFlags.DEFAULT
        );

        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);

        // Title
        const titleItem = new PopupMenu.PopupMenuItem(Me.metadata.name);
        titleItem.sensitive = false;
        this._button.menu.addMenuItem(titleItem);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Monitors
        this.updateMonitors();

        // Overlay switch
        const switchItem = new PopupMenu.PopupSwitchMenuItem(
            _("Overlay"), 
            this._settings.get_boolean("show-overlay"),
        );
        switchItem.connect("toggled", () => this.toggleOverlay());
        this._button.menu.addMenuItem(switchItem);

        this._settings.bind(
            "show-overlay",
            switchItem._switch,
            "state",
            Gio.SettingsBindFlags.DEFAULT
        );

        // System Monitor button
        const systemMonitorButton = new PopupMenu.PopupMenuItem(_("Open System Monitor"));
        const app = Shell.AppSystem.get_default().lookup_app("gnome-system-monitor.desktop");
        systemMonitorButton.connect("activate", () => app.activate());
        this._button.menu.addMenuItem(systemMonitorButton);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Settings button
        const settingsItem = new PopupMenu.PopupMenuItem(_("Settings"));
        settingsItem.connect("activate", () => this.settingsButtonActivate());
        this._button.menu.addMenuItem(settingsItem);
    }

    updateMonitors()
    {
        MonitorManager.removeCallback(this._update);
        let popupNeeded = false;

        for (let monitor of MonitorManager.monitors)
        {
            if (monitor.config.place.includes(Monitor.places.POPUP) ||
                monitor.config.place.includes(Monitor.places.INDICATOR))
            {
                if (monitor.config.place.includes(Monitor.places.POPUP))
                {
                    monitor.menuItem = new PopupMenu.PopupMenuItem(monitor.config.label);
                    monitor.menuItem.sensitive = false;
                    this._button.menu.addMenuItem(monitor.menuItem);

                    popupNeeded = true;
                }
                
                if (monitor.config.place.includes(Monitor.places.INDICATOR))
                {
                    monitor.icon = new St.Icon({
                        gicon: new Gio.ThemedIcon({ name: `${monitor.config.icon}-symbolic` }),
                        style_class: "system-status-icon"
                    });
                    monitor.label = new St.Label();
                    monitor.label.set_y_align(Clutter.ActorAlign.CENTER);
                    this._box.add_child(monitor.icon);
                    this._box.add_child(monitor.label);

                    if (this._icon)
                    {
                        this._icon.destroy();
                        this._icon = null;
                    }
                }
            }
            
        }

        if (popupNeeded)
        {
            this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        MonitorManager.addCallback(this._update);
    }

    update(results)
    {
        results.forEach((stats, i) =>
        {
            const monitor = MonitorManager.monitors[i];
            let monitorString = "";

            for (let format of monitor.config.format)
            {
                const val = stats[format.toLowerCase()];

                if (typeof val === "number")
                {
                    monitorString += `${val.toFixed(monitor.config.precision)}\t`;
                }
                else
                {
                    monitorString += `${val}\t`;
                }
            }
            
            if (monitor.menuItem)
            {
                monitor.menuItem.label.set_text(`${monitor.config.label}\t${monitorString}`);
            }

            if (monitor.label)
            {
                monitor.label.set_text(monitorString);
            }
        });;
    }

    /**
     * Called when the indicator switch is flipped. Toggles the show-overlay setting.
     */
    toggleOverlay()
    {
        this._settings.set_boolean("show-overlay", this._settings.get_boolean("show-overlay"));
    }

    /**
     * Called when the setting button is pressed. Opens the extension preferences 
     * window.
     */
    settingsButtonActivate()
    {
        log(_(`${Me.metadata.uuid}: Opening settings dialog`));
        ExtensionManager.openExtensionPrefs(Me.metadata.uuid, "", null);
    }

    iconChanged()
    {
        this._icon.set_icon_name(`${this._settings.get_string("icon")}-symbolic`);
    }

    /**
     * Destroy this object and objects it created.
     */
    destroy()
    {
        // disconnect settings
        this._connections.forEach((c) => this._settings.disconnect(c));
        this._connections = [];

        // destroy button
        if (this._button) this._button.destroy();
        this._button = null;
    }
}