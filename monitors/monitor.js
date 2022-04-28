"use strict";

const { GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const gtype = GObject.Object.$gtype;

const Util = Me.imports.util;

const Gettext = imports.gettext;
const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

/**
 * Places where a `Monitor` may be displayed.
 */
var places = {
    OVERLAY: "OVERLAY",
    INDICATOR: "INDICATOR",
    PANEL: "PANEL",
};

var formats = {
    PERCENT: "PERCENT",
    USED: "USED",
    FREE: "FREE",
    TOTAL: "TOTAL",
    TEMP: "TEMP",
    TIME_TO_FULL: "TIME_TO_FULL",
    TIME_TO_EMPTY: "TIME_TO_EMPTY",
    SPEED_UP: "SPEED_UP",
    SPEED_DOWN: "SPEED_DOWN",
};

var monitor = class Monitor extends GObject.Object
{
    static 
    { 
        GObject.registerClass(
        {
            Properties: 
            {
                "config": GObject.ParamSpec.object(
                    "config",
                    "Configuration",
                    "Monitor configuration",
                    GObject.ParamFlags.READWRITE,
                    gtype
                ),
            },
        }, this);
    }

    constructor()
    {
        super();

        this.settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.gnomehud");

        this.stats = {};
        this.config = {
            precision: 0,
            place: [],
            label: "MON",
            icon: "utilities-system-monitor-symbolic",
            color: this.settings.get_string("foreground-color"),
            format: [],
            file: "/",
            type: "Monitor",
        };
        this.binds = {};
        this.labels = new Map();
    }

    /**
     * 
     * @param {string} property1 property on `this` to bind to
     * @param {Gtk.Widget} widget the Gtk.Widget to listen for a signal
     * @param {string} property2 the Gtk.Widget property to bind
     * @param {string} signal the signal on `widget` to connect to
     * @param {Function} callback optional callback to call
     */
    bind(property1, widget, property2, signal, callback = null)
    {
        if (!this.binds[widget]) this.binds[widget] = [];

        this.binds[widget].push(
            widget.connect(signal, () =>
            {
                property1
                    .split('.')
                    .reduce((p, c, i) => p[c] = property1.split('.').length === ++i ? widget[property2] : p[c], this)
                callback();
            })
        );
    }

    toString()
    {
        return JSON.stringify(this.stats);
    }

    toConfigString()
    {
        return JSON.stringify({ ...this.config, type: this.constructor.name });
    }

    destroy()
    {
        // Remove external bindings
        for (let key in this.binds)
        {
            this.binds[key].forEach((x) =>
            {
                key.disconnect(this.binds[key]);
            })

            delete this.binds[key];
        }

        // Destroy labels associated with this monitor
        if (this.labels)
        {
            this.labels.forEach((v, label) =>
            {
                label.destroy();
            });
            this.labels = null;
        }
    }

    get config()
    {
        return this._config;
    }

    set config(value)
    {
        this._config = value;
    }
};