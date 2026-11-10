# LoomWright

Free, open-source wiring diagram software for vehicle builds and electronics projects.
Draw a loom the way you will build it: real components, real wire colours with tracers,
real cable sizes, and a wire list you can take to the bench.

LoomWright was started for a fully custom Land Rover Defender build, so it speaks 12 V
automotive: DIN relay terminals (30, 85, 86, 87, 87a), blade and MIDI fuses, fuse boxes,
split charge, winches, and Land Rover style colour codes such as `NR` (brown with red tracer).
It works just as well for general electronics.

![LoomWright](docs/screenshot.png)

## Features

- **84 built-in components** across power and charging, protection, switches, relays,
  lighting, motors and loads, gauges and sensors, connectors and electronics.
  Parametric parts (fuse boxes, connectors, busbars, terminal strips, modules, ICs) take any number of pins.
- **Component builder.** Draw your own symbol with lines, boxes, circles and text, place pins,
  add fields such as `rating = 15A`, and save it to *My components*. Start from any library symbol.
  Export and import your component library to share it.
- **Wire colours your way.** Land Rover / British (B, U, N, R, G…), DIN 72551 / IEC 60757 (BK, BU, BN…)
  or SAE (BLK, BLU, BRN…) codes, a main colour plus up to two tracers, and fully custom colours
  with your own names, codes and shades for a non-standard loom.
- **Projects and sheets.** A project holds as many sheets as you need (charging, lighting, dash,
  trailer…). Sheet tabs, a project pane, off-sheet references between sheets, wire numbers that stay
  unique across the project, and a title block that says *Sheet 2 of 5*.
- **Colour reuse for limited stock.** Tick the cable colours you actually have and LoomWright offers
  only those. Give each wire a circuit and a harness; the *Colour usage* list shows every job a colour
  does, and flags the same colour used for different circuits inside one harness.
- **Wiring.** Click pin to pin. Square-cornered routing, draggable runs, bend points, straight lines.
- **Wire data.** Number, circuit, harness, size in mm² (with AWG), length, current and notes on every wire.
- **Design checks.** Fuse rating against cable size, current against cable size, voltage drop over 3 %,
  unconnected pins.
- **Reports.** Wire list, parts list, cable totals (how many metres of each colour and size to buy) and
  colour usage, for one sheet or the whole project.
- **Exports.** SVG and PNG per sheet, print or PDF of every sheet (with title block and wire colour key),
  and CSV for every report.
- **Desktop app** for Windows and Apple Silicon Macs (and Linux), fully offline, built with Tauri.
- **Optional Claude add-on.** An MCP server that lets Claude draw and edit projects from a
  plain-English description, and turn a picture of a component's pinout into a custom component
  in your library. See [docs/claude-addon.md](docs/claude-addon.md).

Projects are saved as `.loom` files, which are plain JSON, so they work well with Git.

## Getting the app

Installers are built by GitHub Actions (see *Desktop builds* under the Actions tab, or the Releases page):

| Computer | Download |
| --- | --- |
| Windows 10/11 | `.msi` or `-setup.exe` |
| Mac with Apple Silicon (M1 and later) | `.dmg` |
| Linux | `.AppImage` or `.deb` |

The builds are not code-signed yet. On Windows choose *More info → Run anyway*. On a Mac,
right-click the app and choose *Open* the first time.

You can also run the editor without installing anything: open `app/index.html` in a browser,
or run `npm run serve` and visit http://localhost:5173.

## Building from source

You need [Node.js](https://nodejs.org) 18+ and [Rust](https://rustup.rs), plus the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system.

```sh
npm install
npm run dev      # run the desktop app with live reload
npm run build    # build an installer for this computer
npm test         # check the component library and example
```

To build the Windows and Mac installers in the cloud, push a tag like `v0.2.0` or run the
*Desktop builds* workflow by hand. The installers land on a draft release.

## Project layout

| Path | What it is |
| --- | --- |
| `app/` | The editor (plain HTML, CSS and JavaScript, no build step) |
| `app/core/loom-core.js` | Component library, colour standards, diagram model, renderer and checks. Shared with the Claude add-on. |
| `app/builder.js` | Component builder |
| `src-tauri/` | Desktop app shell (Rust, Tauri 2): native open/save dialogs and live reload of edited files |
| `mcp/` | Optional Claude add-on (MCP server) |
| `docs/` | Guides |

## Contributing

Issues and pull requests are welcome, especially new component symbols. A built-in component is
a short entry in `app/core/loom-core.js`: a name, category, size (multiples of 20), pins (on a
10-unit grid) and a list of shapes. Run `npm test` before sending a change.

## Licence

LoomWright is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License version 3, or (at your option) any later version. See [LICENSE](LICENSE).

The bundled IBM Plex fonts are under the SIL Open Font License (`app/fonts/OFL.txt`).

Design checks are a rule of thumb for single PVC automotive cable. Always check your cable maker's
ratings and fuse to protect the wire.
