"use strict";

const { GLib, GObject } = imports.gi;

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

/**
 * Represents a system hardware monitor.
 */
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

        this.stats = {
            updated: GLib.get_monotonic_time(),
        };
        this.config = {
            precision: 0,
            place: [],
            label: "MON",
            icon: `${this.settings.get_string("icon")}-symbolic`,
            color: this.settings.get_string("foreground-color"),
            format: [],
            file: "/",
            type: this.constructor.name,
            old: {},
        };

        this.binds = {};

        /** The St.BoxLayout that is used to display this `Monitor` */
        this.box = null;
    }

    async query(cancellable = null)
    {
        let {old, ...o} = this.stats; // omit this.stats.old from copy
        this.stats.old = o;
        this.stats.updated = GLib.get_monotonic_time();
    }

    /**
     * Bind a nested property on `this` to a property on `widget`
     * 
     * @param {string} property1 property on `this` to bind to
     * @param {Gtk.Widget} widget the Gtk.Widget to listen for a signal
     * @param {string} property2 the Gtk.Widget property to bind
     * @param {string} signal the signal on `widget` to connect to
     * @param {Function} callback optional callback to call
     */
    bind(property1, widget, property2, callback = null)
    {
        if (!this.binds[widget]) this.binds[widget] = [];

        this.binds[widget].push(
            widget.connect(`notify::${property2}`, () =>
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
        return JSON.stringify({ ...this.config });
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

        if (this.box)
        {
            this.box.destroy();
            this.box = null;
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