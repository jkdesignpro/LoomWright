# The .loom file format

A LoomWright project is one `.loom` file. It is plain JSON, written with two-space indents, so it diffs well in Git and can be read or written by other programs. This page describes version 3 of the format, which LoomWright 0.3 and 0.4 read and write. 0.4 added some optional keys (project type, mains settings, mains details on wires, build progress and compressed air systems); older versions keep them when they open and save a file.

The model lives in `app/core/loom-core.js` (`newDoc`, `newSheet`, `normalise`, `view`). The reports in `app/core/loom-reports.js` and the checks in `app/core/loom-nets.js` read the same structure.

## Reading a file safely

When LoomWright opens a file it passes it through `normalise()`, which:

- fills in every missing top-level key and setting with its default, so a minimal file opens;
- turns a version 1 file (one drawing, with `parts` and `wires` at the top level) into a project with one sheet;
- drops parts with no `type` and wires with no `from` or `to`;
- removes the `app` key, which is written on save for information only.

If you write `.loom` files from another program, write version 3 and let `normalise()` fill in the rest. Unknown keys at the top level and on parts and wires are kept as they are; on a sheet, only the keys listed below are kept.

## Units and ids

- Positions are in drawing units. The grid is 10 units, and on a printed sheet 4 units are 1 mm. Parts and bend points snap to the grid.
- Wire lengths are in metres, wire sizes in mm², currents in amps, as strings or numbers.
- Ids are short random strings with a prefix: `prj` for projects, `s` for sheets, `p` for parts, `w` for wires, `r` for revisions, `cab` for cables. Any unique string works. Ids are what wires and revisions point at, so do not change them once a file is in use.

## Top level

```json
{
  "format": "loomwright",
  "version": 3,
  "id": "prjk2f9x1a",
  "title": "Defender 110 auxiliary electrics",
  "meta": { "project": "", "drawnBy": "", "revision": "A", "date": "2026-11-10", "notes": "" },
  "settings": { },
  "harnesses": ["Engine bay", "Dash"],
  "cables": [],
  "customColours": [],
  "customParts": [],
  "revisions": [],
  "harnessLayouts": {},
  "vehicle": null,
  "air": [],
  "sheets": [],
  "app": "LoomWright 0.4.0"
}
```

| Key | What it holds |
| --- | --- |
| `format` | Always `"loomwright"`. |
| `version` | `3`. |
| `id` | The project's id. |
| `title` | The project title, shown in the title block. |
| `meta` | Title block details: `project`, `drawnBy`, `revision` (the current revision letter), `date` (YYYY-MM-DD) and `notes`. |
| `settings` | Drawing and build settings for the whole project; see below. |
| `harnesses` | The harness names, as an array of strings. Wires refer to a harness by name. |
| `cables` | Multicore, twisted and screened cables; see below. |
| `customColours` | Your own wire colours; see below. |
| `customParts` | Every custom component used in the project, so the file opens on a computer without your library. The format is in [components.md](components.md). |
| `revisions` | Issued revisions, oldest first; see below. |
| `harnessLayouts` | Formboard layouts, keyed by harness name; see below. |
| `vehicle` | The vehicle locations view, or `null`; see below. |
| `air` | Optional. Compressed air systems planned in this project; see below. |
| `sheets` | The sheets, in order. A project always has at least one. |
| `app` | The program and version that saved the file. Ignored when reading. |

## Settings

These are the defaults that `newDoc()` writes.

| Key | Default | Meaning |
| --- | --- | --- |
| `standard` | `"lr"` | Colour code standard: `lr` (Land Rover / British), `din` (DIN 72551 / IEC 60757), `sae` (SAE / US) or `custom` (your own colours only). |
| `volts` | `12` | System voltage, used to turn watts into amps and for the voltage drop check: 12, 24 or 48, or 110, 230 or 400 for mains. |
| `labels` | `"full"` | Wire labels on the drawing: `full` (number, colour code, size), `code` (colour code only) or `none`. |
| `titleBlock` | `true` | Draw the title block and revision table. |
| `colourKey` | `true` | Draw the colour key. |
| `stock` | `[]` | Ids of the colours you stock. |
| `stockOnly` | `false` | Only offer stocked colours in the colour lists. |
| `page` | `"fit"` | Paper size: `fit` (fit to the drawing), `A4`, `A3`, `A2` or `A1`. |
| `orientation` | `"landscape"` | `landscape` or `portrait`. |
| `bw` | `false` | Black and white drawings, with colour codes written on the wires. |
| `junctions` | `true` | Draw a dot where two or more wires meet at a pin. |
| `xrefs` | `true` | Draw cross-references such as `→ 2/B4` at off-sheet links. |
| `clouds` | `""` | Id of the revision to draw revision clouds against, or empty for none. |
| `cutAllowance` | `0.15` | Metres added to each wire in the cut lists. |
| `currency` | `"£"` | Currency symbol for costs. |
| `cableCosts` | `{}` | Cable price per metre, keyed by size in mm² (for example `{ "2.5": 0.32 }`). |
| `projectType` | `"vehicle"` | `vehicle`, `household`, `factory`, `electronics` or `mixed`. Picks the parts, tabs and checks shown first. Choosing household, factory or mixed also sets `mains`, `standard: "din"`, and 230 V for household. |
| `mains` | not set | Household and factory projects: `{ "building", "country", "ambient", "method" }`. `building` is `dwelling`, `hmo`, `hrrb`, `student`, `care` or `commercial`; `country` is `england`, `wales`, `scotland` or `ni`; `ambient` is the usual air temperature in °C (30); `method` is the usual installation method (`C`). |
| `autoColour` | not set | `true` picks colours for new wires with the colour helper. |
| `harnessTemps` | not set | Air temperature around each harness in °C, keyed by harness name, for derating. |

## Sheets

```json
{ "id": "s1", "name": "Charging and aux supply", "page": "A3", "orientation": "landscape", "notes": "", "parts": [], "wires": [] }
```

`page` and `orientation` are optional and override the project settings for that sheet. `notes` is optional.

## Parts

```json
{
  "id": "pk3j2h1q",
  "type": "relay4",
  "x": 400, "y": 160,
  "rot": 0,
  "flip": true,
  "label": "K1",
  "props": { "rating": "30A" },
  "mpn": "V23134-B52-X298",
  "supplier": "", "cost": "4.20",
  "location": "Under seat box"
}
```

| Key | Meaning |
| --- | --- |
| `type` | The component id: a built-in one such as `battery`, `fuse_blade`, `relay4` or `conn`, or the id of an entry in `customParts`. A part whose type cannot be found is drawn as a dashed box with a question mark. |
| `x`, `y` | Top-left corner of the unrotated symbol, in drawing units. |
| `rot` | Quarter turns clockwise, 0 to 3. |
| `flip` | Optional. `true` mirrors the symbol left to right. |
| `label` | The reference, such as `F1` or `K1`. Two parts with the same reference and type on different sheets are the same part drawn twice. |
| `props` | The component's fields, keyed by field name. Missing fields take the component's defaults. |
| `mpn`, `supplier`, `cost`, `location` | Optional part data: part number, supplier, unit cost and where it is fitted. |

## Wires

```json
{
  "id": "wq8d0s2m",
  "name": "W13",
  "from": { "part": "pk3j2h1q", "pin": "87" },
  "to": { "part": "p0lamp01", "pin": "1" },
  "colour": "purple", "tracer": "white", "tracer2": "",
  "gauge": "2.5", "length": 3.5, "current": "10",
  "circuit": "Spot lamps", "harness": "Engine bay", "notes": "",
  "insulation": "fly",
  "cable": "cabx81k2",
  "route": "straight",
  "points": [{ "x": 520, "y": 180 }],
  "dx": 0,
  "lab": { "dx": 10, "dy": -20 },
  "ends": {
    "from": { "term": "", "method": "crimp", "strip": "5", "seal": "seal", "shrink": "6 mm adhesive, 25 mm" },
    "to": { }
  }
}
```

| Key | Meaning |
| --- | --- |
| `name` | The wire number, unique across the project. |
| `from`, `to` | The two ends: a part id and a pin id on that part. |
| `colour`, `tracer`, `tracer2` | Colour ids: built-in (`black`, `brown`, `red`, `orange`, `yellow`, `green`, `lightgreen`, `blue`, `lightblue`, `purple`, `grey`, `white`, `pink`, `tan`, `turquoise`, `natural`) or the id of an entry in `customColours`. The tracers are optional. |
| `gauge` | Size in mm², as a string such as `"0.75"`, `"1.0"` or `"16"`. |
| `length` | Length in metres. |
| `current` | Current in amps, typed by you. |
| `circuit`, `harness`, `notes` | Free text. `harness` should match a name in `harnesses`. |
| `insulation` | Optional insulation type: `flry_b`, `fly`, `txl`, `gxl`, `sxl`, `tefzel`, `silicone` or `battery` (from `INSULATION` in `loom-data.js`). |
| `cable` | Optional id of the multicore cable the wire is a core of. |
| `signal` | Optional. What the wire carries, used in electronics projects: `power`, `ground`, `digital`, `analogue`, `pwm`, `i2c_sda`, `i2c_scl`, `spi_mosi`, `spi_miso`, `spi_sck`, `spi_cs`, `uart_tx`, `uart_rx`, `can_h`, `can_l`, `rs485_a`, `rs485_b`, `usb_dp`, `usb_dm`, `onewire` or `shield` (from `SIGNALS` in `loom-electronics.js`). |
| `route` | Optional. `"straight"` draws straight lines through the bend points; otherwise the wire is drawn with square corners. |
| `points` | Optional bend points, in drawing units. |
| `dx` | Optional sideways offset of the middle run of a square-cornered wire with no bend points. |
| `lab` | Optional offset of the wire label from where it would sit. |
| `method`, `insul`, `grouped`, `groupKind`, `cpc`, `ambient` | Optional, mains cables only: installation method (`C`, `B`, `A`, `100` to `103`), thermal insulation, how many circuits are grouped with it and how (bunched or clipped side by side), the earth (cpc) size in mm², and the air temperature in °C. Missing values use the project's `mains` settings. |
| `build` | Optional build progress: `cut`, `ends` and `fitted` (`true` when done), `test` (`pass` or `fail`) and `note`. Restoring a revision keeps it. |
| `ends` | Optional. How each end is finished: `term` (a terminal id from `loom-data.js`), `method` (`crimp`, `crimp_solder`, `solder`, `screw` or `ferrule`), `strip` (mm), `seal` (`seal`, `plug` or `gel`) and `shrink` (free text). |

## Cables

```json
{ "id": "cabx81k2", "name": "C1", "type": "multicore", "cores": 4, "mpn": "" }
```

`type` is `single` (single cores), `multicore` (sheathed), `twisted` (twisted pair), `screened` or `twisted_screened`. Wires join a cable through their `cable` key.

## Custom colours

```json
{ "id": "c_k2j1x9", "custom": true, "name": "Slate", "code": "SL", "hex": "#5b6770" }
```

`code` is what the drawings and lists show. Built-in colours are not stored in the file.

## Revisions

```json
{ "id": "r8x2k1m0", "rev": "B", "date": "2026-11-10", "by": "", "description": "Fridge feed moved to 6 mm²", "snapshot": { } }
```

`snapshot` is a full copy of the project at the time of issue: `title`, `meta`, `settings`, `harnesses`, `cables`, `customColours`, `customParts`, `harnessLayouts`, `sheets` and `air`. It does not hold the revision list itself or the vehicle view. Comparing revisions, going back to one and drawing clouds all work from these snapshots. Save points are not stored in the file; they stay on the computer.

## Harness layouts (formboards)

```json
"harnessLayouts": {
  "Engine bay": {
    "nodes": [
      { "id": "n0", "kind": "point", "label": "", "x": 0, "y": 0 },
      { "id": "n1", "kind": "end", "key": "P:FB1", "label": "FB1", "x": 220, "y": 0 }
    ],
    "branches": [
      { "id": "b1", "a": "n0", "b": "n1", "length": 500, "sleeve": "braid" }
    ]
  }
}
```

A node is either a `point` (a breakout or junction on the board) or an `end` (a place where wires leave the harness). An end's `key` says which: `P:<reference>` for a part, `P:<ref> + <ref>` for a mated connector pair, `N:<link name>` for an off-sheet link or net label, or `S:<sheet id>:<part id>` for a part with no reference. Branch `length` is in millimetres and `sleeve` is a sleeving id from `SLEEVING` in `loom-data.js` (`conduit`, `conduit_split`, `braid`, `heatshrink`, `cloth`, `pvc_tape`, or empty). LoomWright adds and removes end nodes to match the wires each time it opens the formboard.

## Vehicle

```json
"vehicle": { "image": "data:image/jpeg;base64,...", "marks": { "relay4|K1": { "x": 412, "y": 230 } } }
```

`image` is a picture of the vehicle as a data URL, or empty for the built-in outline. `marks` places parts on a 1000 by 500 view, keyed by `<type>|<reference>`, or by the part id for a part with no reference.

## Compressed air systems

```json
"air": [
  {
    "id": "airk2j9x1", "name": "Workshop air",
    "settings": { "use": "work", "quality": "dry", "tariff": 0.25, "hours": 2000, "ambient": 20, "altitude": 0, "rh": 70, "leakPct": 10, "growthPct": 15, "simultaneity": 70 },
    "compressors": [{ "id": "c1", "name": "Screw compressor", "kind": "screw", "fad": 1600, "basis": "fad", "kw": 11, "cutIn": 7, "cutOut": 7.5 }],
    "receivers": [{ "id": "r1", "name": "Main receiver", "litres": 500, "ps": 11, "safetyValve": true, "drain": true }],
    "treatment": [{ "id": "t1", "kind": "dryer-ref", "name": "", "rated": 2000, "dp": 0.2, "before": false }],
    "pipes": [{ "id": "p1", "parent": null, "name": "Ring main", "material": "aluminium", "size": "32", "length": 60, "role": "main", "ring": true, "fittings": { "elbow": 6, "bend": 0, "teeRun": 4, "teeBranch": 0, "valve": 1, "coupling": 0 } }],
    "drops": [{ "id": "d1", "pipe": "p1", "name": "Bench 1", "takeoff": "top", "drainLeg": true, "outlets": 1,
      "frl": { "rated": 1500, "dp": 0.2, "set": null, "lubricator": false },
      "hose": { "size": "3/8\"", "length": 5, "coupling": "1/4\"", "couplings": 1, "safety": false },
      "tools": [{ "id": "k1", "kind": "impact-12", "name": "Impact wrench 1/2\"", "lpm": 850, "util": 25, "bar": 6.3, "cont": false, "paint": false }] }]
  }
]
```

Flows are free air in l/min, pressures bar gauge, lengths metres and volumes litres. `use` is `work` or `home`, which changes the pressure systems advice. A pipe's `parent` is the pipe it branches from, or `null` for one that starts at the receiver; a drop's `pipe` is the pipe it is taken off. The lists of compressor kinds, treatment kinds, pipe materials and sizes, hoses, couplings and tools are in `app/core/loom-air.js` (`Loom.air`). Revisions keep a copy of the air systems.

## Component library file

**Tools › Export my components and blocks** writes a separate file:

```json
{ "format": "loomwright-library", "version": 2, "parts": [], "colours": [], "blocks": [] }
```

`parts` are custom components ([components.md](components.md)), `colours` are custom colours as above, and each block is `{ id, name, parts, wires, custom }`: the parts and wires of a saved circuit, with any custom components it uses. Import also accepts a plain array of components.
