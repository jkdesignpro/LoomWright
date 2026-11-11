# Changelog

## 0.4.1

- The Mac app is now signed ad hoc. Apple Silicon Macs said the 0.4.0 app "is damaged and can't be
  opened" because it had no signature. The 0.4.1 app gets the usual first-run warning instead; the
  manual's *Getting started* chapter shows how to open it, including on macOS 15 and later.
- The build checks the Mac app's signature, so this cannot slip through again.
- Getting started: on a Mac, double-clicking a `.loom` file opens it (added in 0.4.0).

## 0.4.0

**Licence.** From this release LoomWright is under the GNU Affero General Public License, version 3
or later (AGPL-3.0-or-later). It stays free to use, change and share. The difference from the GPL is
that a changed version offered to people over a network must offer them its source code too.

LoomWright is still mainly for vehicle looms, and now also covers household wiring, factory control
panels, electronics projects and compressed air. Every mains and compressed air check is planning
guidance only: see the disclaimer.

**Volts and amps**
- A circuit solver works out the voltage, current and drop at every load, wire and fuse, with battery,
  alternator, solar and DC-DC charger models, diodes and contact resistances.
- The live test shows volts and amps at each running load, fuse currents and supplies.
- Fault finding: a step-by-step test sheet for a load that does not work, will not switch off, keeps
  blowing its fuse, or is dim or slow, with the readings to expect.
- Power distribution modules (PDM) and CAN terminators; CAN bus checks for swapped H/L, terminators,
  twisted pair and long stubs.

**Colours, stock and the build**
- Colour helper: suggested colours for a wire from its circuit, the standard's feed and earth
  conventions, clashes in the same harness, and the cable you stock.
- My stock (cable and parts, shared by all projects), a Shopping tab with what to buy, and Take from stock.
- Build progress: tick cut, ends, fitted and test result for each wire, also from a phone checklist
  whose progress imports back.
- Wire ratings derated for harness temperature and bundled wires; grommet holes with bundle fill.
- Starter circuits (spot lamps, split charge, winch, compressor, reversing camera and more) and Tidy
  wires (Shift+T), which lays wires out on the grid with square corners and few bends.
- PDF export with every sheet as a vector page, the tables you choose, bookmarks, and
  cross-references you can click.

**Project types**
- Vehicle, household, factory, electronics or mixed. The type picks the parts, tabs and checks shown first.
- Household (UK mains): consumer unit parts, sockets, lights, showers, cookers, EV charge points, solar
  and batteries. Guidance checks drawn from selected BS 7671 rules: cable rating with derating, ring
  circuits, RCD and AFDD needs, earth loop impedance, voltage drop, bathrooms, Part P notification and
  maximum demand. A circuit schedule lists each breaker's figures.
- Factory and control panels: isolators, motor circuit breakers, contactors with auxiliary contacts that
  follow their coil, overloads, motors, buttons, emergency stops, PLC cards and drives. Guidance checks
  from selected BS EN 60204-1 recommendations, motor, terminal plan and PLC I/O lists, and wire numbering
  by potential.
- Electronics projects: Arduino UNO R3 and Nano, the Raspberry Pi 40-pin header, ESP32-DevKitC and
  ESP32-S3-DevKitC-1 with pinouts from the makers' documents, supplies, converters, relay and I2C
  modules, and JST, Molex, XT, barrel, USB-C, M8, M12 and screw terminal connector series. Each wire
  can carry a signal (I2C, SPI, UART, CAN and more). Checks for 5 V on 3.3 V pins, TX to TX, SDA to SCL,
  missing grounds and supplies fighting each other, and a Power rails list of what each supply feeds.
- A loads library of machines, household appliances and solar parts with typical ratings.
- Sources and known limits for every rule are listed in docs/standards-sources.md.

**Compressed air planner**
- Plan a workshop or garage air system: compressors, receivers, air treatment, pipe runs, drops and
  tools. It estimates air demand, pipe pressure drop and air speed, pressure at each tool, receiver size,
  compressor duty, running and leak costs and water to drain, with plain-English checks.
- Leak test and calculators, and CSV, SVG and PDF export.

**Live test**
- Relays and contactors stay pulled in, so a hold-in contact latches and a stop button drops it out.
- Household circuits come on from the supply; three-phase motors run from L1, L2 and L3 labels;
  drives, safety relays and indicator lamps work.

**Help and disclaimers**
- A built-in user manual (Help, or F1 for the chapter about what is on screen) with search.
- A disclaimer that must be read before household, factory or compressed air work, and on every
  mains sheet, report and PDF: LoomWright is a basic planning tool, its checks are not proof that work
  meets any code, and it does not replace a qualified electrician.

**Claude add-on**
- New tools for solving circuits, fault finding, colour suggestions, stock and shopping lists, build
  progress, starter circuits, tidying wires, numbering by potential, PDF export, household and factory
  projects, and compressed air systems.

**Smaller changes and fixes**
- Open a .loom file by double-clicking it on a Mac, or by dropping it on the window.
- The circuit schedule names each circuit in words and gives the 0.8 × maximum Zs a tester should read.
  Lights after a light switch now count in their circuit's design current.
- Checks show their rule codes; the build pack can include the household, factory and power lists,
  and its cover carries the disclaimer.
- Wires to an unnamed net label say so in the wire list instead of "Net label:R".
- Black-and-white drawings always show colour codes, even with wire labels turned off.
- Motors, pumps, compressors, fans and wiper motors have a current draw field.
- Closing the last tab opens a blank project rather than the example.
- KiCad import reads an MPN field from any symbol.
- The component builder and the new screens are translated (first pass).

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
