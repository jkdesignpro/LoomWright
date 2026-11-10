# Changelog

## 0.3.0

Everything from the feature review against professional harness tools (items 1 to 19 and the later list).

**Revision history**
- Issue a revision (A, B, C… or your own numbering) with a description. Each one keeps a full copy of the project.
- Compare any two revisions, or a revision against the drawing now, sheet by sheet: parts and wires added, removed, moved or changed, with old and new values. Export the list as CSV.
- Go back to a revision. The revision list itself is kept.
- Revision clouds on the drawing round everything changed since a chosen revision, and a revision table above the title block.
- Save points: the app keeps a rolling local history of your work (every save, and on a timer) that you can open again, separate from issued revisions.

**Connectors and build details**
- Connector part with real series: Deutsch DT, DTM and DTP, Superseal 1.5, Econoseal, Metri-Pack, Lucar 6.3 mm, bullet, Anderson Powerpole and SB, and more. Ways, plug or receptacle side, housing and wedge-lock part numbers, matching terminals, cavity plugs. Mated connectors join cavity for cavity.
- Wire ends: terminal (rings, spades, ferrules, connector contacts…), crimp or solder, strip length, heat-shrink, seal. The size of the terminal is checked against the wire.
- Insulation type (thin-wall FLRY-B, FLY, TXL/GXL and others) and multicore, twisted and screened cables with used and spare cores.
- Part number, supplier, unit price and fitted location on every part.
- New parts: Contura-style 8-pin rocker, Lucas 6RA relay, Lucas 4-way fuse box. Specific ECU plugs and vehicle fuse boxes are not guessed: make them from the maker's pinout with the component builder or the Claude add-on.

**Sheets**
- Fixed paper sizes A4 to A1, landscape or portrait, for the project or per sheet, with a frame and zone grid (A–F, 1–8).
- Off-sheet links and net labels show where the circuit continues (sheet and zone), and relay coils and contacts drawn on different sheets are cross-referenced.
- Black-and-white drawings with colour codes written on the wires.
- Junction dots, movable wire labels, wire label style (full, colour code only, none).

**Circuits**
- Trace a circuit: click a wire or pin and everything joined to it lights up on every sheet, with a list of the pins and wires.
- Live circuit test: flick switches, blow fuses and see which loads run, which relays pull in and which wires are live. Flags a supply shorted to earth. It checks connections only, not voltages.
- Fuse and relay schedule and load budget: load on each fuse way, relay and supply against its rating, smallest wire on each fuse, hours of running from a battery.
- More checks: duplicate references, the same reference used for different parts, loads fed without a fuse, a supply wired straight to earth, loads with no earth return, terminals that do not suit the wire size, more than one colour on one net.

**Build outputs**
- Cut list per harness with cut length (plus an allowance), terminals, strip lengths, sleeves and seals.
- Connector tables, cavity by cavity.
- Costed parts list and cable cost, in your currency.
- Wire labels for each end (or one per wire) on A4 label sheets or as CSV for a label printer.
- Build pack: one printable document with a cover, contents, every sheet, revision history, wire list, cut lists, connector tables, fuses and loads, parts and costs, cables, locations, formboards, colour usage, labels and checks.
- Harness formboard: each harness as ends and breakout points joined by branches. Set branch lengths and sleeving, see bundle diameters, draw it to scale, export it 1:1 as DXF, and copy the routed lengths back onto the wires.
- Component locations: a location for each part, and markers on a photo or drawing of the vehicle (or a plain outline).

**Editing**
- Several projects open at once in tabs, restored when the app opens again.
- Reusable circuit blocks: save a selection to My blocks and drop it into any project.
- Align and distribute, guide lines while dragging, find, find and replace, renumber wires and parts.

**Import and export**
- Import a wire list from a spreadsheet (CSV, or pasted cells), WireViz YAML, a KiCad netlist, and measured wire lengths.
- Export DXF for CAD (each sheet, and harness formboards at 1:1 in mm), WireViz YAML, and a read-only web page that anyone can open, with clickable circuits.
- CSV for every list.

**Other**
- Interface languages: English, German, French, Spanish and Dutch. The translations are a first pass and corrections are welcome.
- Portable Windows build: unzip and run, with settings and components kept beside the program. Help → About shows where data is kept.
- Claude add-on 0.3.0: new tools for revisions, circuit trace, live test, load budget, build lists, formboards, project and sheet settings, cables, connector series, and import and export. `update_part` and `update_wire` take the new build details.
- The core is split into modules (`loom-core`, `loom-data`, `loom-nets`, `loom-reports`, `loom-io`) loaded by `app/core/loom.js` in Node.
- Fix: a part drawn on more than one sheet with the same reference is counted once in the load budget.

## 0.2.0

- **Projects and sheets.** A `.loom` file is now a project with any number of sheets. Sheet tabs,
  a Project pane (title block details, sheets, harnesses), add, duplicate, rename, reorder and delete
  sheets, PgUp/PgDn to move between them. Wire numbers and part references stay unique across the
  project. Print or PDF outputs every sheet; the title block shows *Sheet n of m*. Version 1 files open
  as a one-sheet project.
- **Colour reuse.** Wires have a harness as well as a circuit. New *Colour usage* list shows every job
  each colour does across sheets and harnesses, and flags a colour used for different circuits in the
  same harness. Mark the colours you stock and optionally limit wire pickers to them. The wire panel
  shows where else its colour is used. The exported colour key lists the circuits for each colour.
- **Lists for the whole project** or the current sheet, with Sheet and Harness columns. New colour
  usage CSV export.
- **New look.** Desktop-style layout: menu bar, tool rail, Ctrl+K search over commands, parts, sheets
  and placed parts, docked panes, status bar with cursor position, sheet, counts and check status.
  Light and dark themes.
- **Claude add-on.** All tools work on sheets (`sheet` argument). New `add_sheet`, `colour_usage` and
  `set_colour_stock` tools. `define_component` can draw a full symbol with pins anywhere on the outline,
  so Claude can make a component from a picture, and saves it to the app's *My components* library.
- System voltage setting (12, 24 or 48 V) for voltage-drop checks; it was fixed at 12 V.
- Name is now written LoomWright everywhere.

## 0.1.0

- First release: editor with 84 components, component builder, standard and custom wire colours,
  design checks, wire list, parts list and cable totals, SVG/PNG/PDF/CSV export, Tauri desktop app,
  optional Claude MCP add-on.
