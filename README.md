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

- **88 built-in components** across power and charging, protection, switches, relays,
  lighting, motors and loads, gauges and sensors, connectors and electronics.
  Parametric parts (fuse boxes, connectors, busbars, terminal strips, modules, ICs) take any number of pins.
- **Real connectors.** Deutsch DT/DTM/DTP, Superseal, Econoseal, Metri-Pack, Lucar, bullets and Anderson,
  with ways, plug or receptacle side, housing and wedge-lock part numbers, terminals and cavity plugs.
  Mated pairs join cavity for cavity. Connector tables list every cavity.
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
- **Wire data.** Number, circuit, harness, size in mm² (with AWG), length, current, insulation, multicore
  cable, notes, and how each end is finished: terminal, crimp or solder, strip length, heat-shrink, seal.
- **Revision history.** Issue revisions A, B, C… with a description, compare any two (or a revision and
  the drawing now), go back to one, and draw revision clouds round what changed. A revision table sits
  above the title block, and local save points keep a rolling history of your work.
- **Proper sheets.** A4 to A1, landscape or portrait, with a frame, zone grid, and cross-references that
  say which sheet and zone an off-sheet link continues on. Black-and-white mode writes the colour codes.
- **Trace and test.** Click a wire to light up the whole circuit across sheets. The live test flicks
  switches and blows fuses to show what runs (connections only, not voltages).
- **Design checks.** Fuse rating against cable size, current, voltage drop over 3 %, unconnected pins,
  duplicate references, loads with no fuse or no earth, supplies shorted to earth, terminals that do not
  suit the wire, mixed colours on one net.
- **Fuses and loads.** A fuse and relay schedule and load budget for every fuse way, relay, battery,
  alternator and DC-DC charger.
- **Build outputs.** Cut lists per harness, connector tables, costed parts list, cable to buy, wire labels
  for a label printer or A4 label sheets, and a printable build pack with all of it.
- **Harness formboard.** Lay out each harness as branches with lengths and sleeving, see bundle sizes,
  export it 1:1 as DXF, and copy the routed lengths back onto the wires.
- **Component locations** on a photo or outline of the vehicle.
- **Import and export.** SVG, PNG, DXF, PDF, CSV for every list, WireViz YAML both ways, KiCad netlists,
  spreadsheet wire lists, measured lengths, and a read-only web page anyone can open.
- **Comforts.** Several projects open in tabs, reusable circuit blocks, align and distribute with guide
  lines, find and replace, renumbering, and the interface in English, German, French, Spanish or Dutch
  (translations are a first pass).
- **Desktop app** for Windows and Apple Silicon Macs (and Linux), fully offline, built with Tauri.
  A portable Windows copy runs from a folder or USB stick.
- **Optional Claude add-on.** An MCP server that lets Claude draw and edit projects from a
  plain-English description, turn a picture of a component's pinout into a custom component
  in your library, issue and compare revisions, trace and test circuits, and produce the build lists.
  See [docs/claude-addon.md](docs/claude-addon.md).

Projects are saved as `.loom` files, which are plain JSON, so they work well with Git.

## Getting the app

Installers are built by GitHub Actions (see *Desktop builds* under the Actions tab, or the Releases page):

| Computer | Download |
| --- | --- |
| Windows 10/11 | `.msi` or `-setup.exe`, or `-portable.zip` to run without installing |
| Mac with Apple Silicon (M1 and later) | `.dmg` |
| Linux | `.AppImage` or `.deb` |

The portable zip holds `LoomWright.exe` and an empty file called `portable`. While that file is there,
LoomWright keeps its settings, autosave and *My components* in a `LoomWright-data` folder beside the
program. It needs the Microsoft Edge WebView2 runtime, which Windows 10 and 11 already have.

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

To build the Windows and Mac installers in the cloud, push a tag like `v0.3.0` or run the
*Desktop builds* workflow by hand. The installers land on a draft release.

## Project layout

| Path | What it is |
| --- | --- |
| `app/` | The editor (plain HTML, CSS and JavaScript, no build step) |
| `app/core/loom-core.js` | Component library, colour standards, project model, renderer, checks and revisions |
| `app/core/loom-data.js` | Connector series, terminals, insulation, sleeving and how each part behaves electrically |
| `app/core/loom-nets.js` | Nets, circuit trace, live test, fuse and load schedule, project checks |
| `app/core/loom-reports.js` | Cut lists, connector tables, labels, costed parts list, formboards, build pack, CSV tables |
| `app/core/loom-io.js` | Import and export: CSV wire lists, WireViz, KiCad, DXF, read-only web page |
| `app/core/loom.js` | Loads all of the core in Node, for the Claude add-on and the tests |
| `app/editor.js`, `app/views.js` | The editor, and the formboard and vehicle views |
| `app/i18n.js` | Interface languages |
| `app/builder.js` | Component builder |
| `src-tauri/` | Desktop app shell (Rust, Tauri 2): native open/save dialogs and live reload of edited files |
| `mcp/` | Optional Claude add-on (MCP server) |
| `docs/` | Guides |

## Contributing

Issues and pull requests are welcome, especially new component symbols. A built-in component is
a short entry in `app/core/loom-core.js` (or `loom-data.js` for connector-type parts): a name, category, size (multiples of 20), pins (on a
10-unit grid) and a list of shapes. Run `npm test` before sending a change.

## Licence

LoomWright is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License version 3, or (at your option) any later version. See [LICENSE](LICENSE).

The bundled IBM Plex fonts are under the SIL Open Font License (`app/fonts/OFL.txt`).
The bundled js-yaml (`app/vendor/js-yaml.min.js`, used for WireViz files) is under the MIT License (`app/vendor/js-yaml.LICENSE`).

Design checks are a rule of thumb for single PVC automotive cable. Always check your cable maker's
ratings and fuse to protect the wire.
