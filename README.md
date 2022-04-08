# GNOME HUD (WIP)

<img src="./images/screenshot.png" height="200px">

GNOME Shell extension for displaying system information like CPU usage, RAM usage, GPU usage, and FPS.

## Installation

**Manual**

1. Download or clone the repository to `~/.local/share/gnome-shell/extensions/`
2. Rename the repository's folder to `gnomehud@ashtonn.com`
3. Restart the GNOME Shell with `Alt` + `F2`, `r`, then `Enter`. Alternatively, log out or restart the computer
4. If the extension isn't already enabled, use `gnome-extensions enable gnomehud@ashtonn.com`

**Bundle**

1. Download the `.zip` extension bundle
2. Run `gnome-extensions install gnomehud@ashtonn.com.shell-extension.zip`
3. Restart the GNOME Shell with `Alt` + `F2`, `r`, then `Enter`. Alternatively, log out or restart the computer
4. If the extension isn't already enabled, use `gnome-extensions enable gnomehud@ashtonn.com`

*If the extension does not appear, make sure you have user extensions enabled with `gsettings set org.gnome.shell disable-user-extensions false`*

## Usage

Use `Super` + `Alt` + `G` to toggle the overlay.

## Settings & Configuration

Extension settings can be accessed through the indicator in the status area with the 'Settings' button. Alternatively, open the settings dialog manually with `gnome-extensions prefs gnomehud@ashtonn.com`.

<details>
    <summary>Default Configuration</summary>

| Setting | Default | Type | Description |
|---------|---------|------|-------------|
| show-indicator | true | boolean | Show the top-panel indicator button |
| show-overlay | false | boolean | Show the HUD overlay |
| update-delay | 1000 | integer | Delay in milliseconds between overlay updates, 250-5000 |
| anchor-corner | 1 | integer | Corner of the monitor to anchor the overlay to. 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right |
| default-monitor | 0 | integer | Default monitor to display the overlay on. 0 = your primary monitor |
| background-opacity | 0.25 | double | Overlay background opacity, 0.00-1.00 |
| foreground-opacity | 0.75 | double | Overlay foreground (font) opacity, 0.00-1.00 |
| **Keybinds** |
| kb-toggle-overlay | &lt;Super&gt;&lt;Alt&gt;g | keybind | Toggles overlay display (bound to show-overlay setting), special keys like &lt;Alt&gt; must be surrounded in &lt; &gt; |
</details>

## Development

### View GNOME shell logs

```
journalctl -f -o cat /usr/bin/gnome-shell
```

### Pack Extension

```
gnome-extensions pack gnomehud@ashtonn.com --podir=po --extra-source={indicator.js,overlay.js}
```

### Compile (Preferences) Schemas

```
glib-compile-schemas schemas/
```

### Generate Translations

```
xgettext --from-code=UTF-8 --output=po/example.pot *.js
```