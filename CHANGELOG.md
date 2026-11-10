# Changelog

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
