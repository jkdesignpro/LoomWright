# Components

Every symbol in LoomWright, built-in or your own, is described the same way: a size, a list of pins, a list of shapes, and some fields. This page describes that format for people adding built-in components to LoomWright, and for anyone writing custom components by hand or from another program.

To draw your own component in the app, use the component builder; see the [user manual](manual/09-component-builder.md).

## Drawing units and the grid

- Drawing units are the same as on the sheet: 4 units are 1 mm on paper, and the grid is 10 units.
- A component's width `w` and height `h` must be multiples of 20. A part rotates about its centre, so this keeps its pins on the grid after a quarter turn.
- Pins must sit on the 10-unit grid, normally on the edge of the box.
- Pin ids must be unique within a component.

`npm test` (`scripts/test-core.js`) places every built-in component and checks all three rules.

## A component

```json
{
  "id": "c_k2j1x9a",
  "custom": true,
  "cat": "My components",
  "name": "Relay with diode",
  "prefix": "K",
  "sub": "{rating}",
  "props": [{ "k": "rating", "l": "Rating", "d": "30A" }],
  "w": 80, "h": 60,
  "pins": [
    { "id": "30", "x": 0, "y": 20, "n": "30 common" },
    { "id": "87", "x": 80, "y": 20, "n": "87 normally open" },
    { "id": "85", "x": 0, "y": 50, "n": "85 coil −" },
    { "id": "86", "x": 80, "y": 50, "n": "86 coil +" }
  ],
  "shapes": [
    { "t": "rect", "x": 10, "y": 0, "width": 60, "h": 60, "rx": 4 },
    { "t": "text", "x": 40, "y": 34, "text": "K", "size": 12, "weight": 600 }
  ]
}
```

| Key | Meaning |
| --- | --- |
| `id` | Unique id. Parts refer to their component by this id (the part's `type`). The builder gives custom components ids starting `c_`. |
| `custom` | `true` for components made in the builder, by the Claude add-on or imported. |
| `cat` | Category in the Parts pane. Custom components are always `My components`. |
| `name` | Name in the Parts pane and the lists. |
| `prefix` | Letter or letters for references: `K` gives K1, K2 and so on. Empty for parts with no reference. |
| `sub` | Optional text drawn under the symbol. `{field}` is replaced by that field's value. |
| `props` | The fields shown in Properties; see below. |
| `w`, `h` | Size in drawing units, multiples of 20. |
| `pins` | `id` is what wires connect to and what the lists show; `x`, `y` is the position; `n` is a longer name shown in Properties and the trace. |
| `shapes` | What is drawn, in order; see below. |

Custom components are stored in the user's library (`library.json` in the desktop app's data folder, or browser storage), and a copy of every custom component used in a project is kept in the project's `customParts`, so the file opens anywhere. See [file-format.md](file-format.md).

## Fields

```json
{ "k": "rating", "l": "Rating", "d": "30A" }
```

`k` is the key used in `part.props` and in `{k}` templates, `l` is the label in Properties, and `d` is the default. Built-in components can also give:

- `type: "int"` with `min` and `max`, for whole numbers such as the number of ways;
- `type: "select"` with `options` as `[value, label]` pairs;
- `type: "textarea"`, for longer text.

The builder writes plain text fields only. In the builder's Fields box, each line `key = default` becomes a field, with the label made from the key.

Some field names have a meaning in the fuse and load figures:

- `amps`: the current the part draws, written with its unit, such as `8A` (a value in `Ah` is a battery capacity and is ignored);
- `watts`: its power, such as `55W` or `2 × 60W`, divided by the system voltage.

## Shapes

All coordinates are in drawing units, inside the component's box. Colours are `ink` (the drawing colour), `paper` (white) or `none`.

| `t` | Keys | Notes |
| --- | --- | --- |
| `line` | `x1`, `y1`, `x2`, `y2`, `w`, `dash` | `w` is the stroke width (default 2). `dash` is an SVG dash pattern such as `"4 3"`. |
| `rect` | `x`, `y`, `width`, `h`, `rx`, `sw`, `fill`, `dash` | Width is `width`, not `w`. Stroke width is `sw` (default 2). `fill` defaults to `paper`. |
| `circle` | `cx`, `cy`, `r`, `w`, `fill` | `fill` defaults to `paper`. A filled dot is `fill: "ink", w: 0`. |
| `path` | `d`, `w`, `fill` | `d` is SVG path data. `fill` defaults to `none`. |
| `text` | `x`, `y`, `text`, `size`, `anchor`, `weight` | `size` defaults to 9, `anchor` (`start`, `middle`, `end`) to `middle`. `{field}` in `text` is replaced by the field's value. |

Any shape can also carry `tx`, `ty` to move it, and `stroke` to change its line colour. Text can carry `color`.

## Built-in components

Built-in components are defined in code, in `app/core/loom-core.js` and, for connectors and some vehicle-specific parts, `app/core/loom-data.js`. A definition looks like this:

```js
def('battery', {
  name: 'Battery', cat: 'Power & charging', prefix: 'BAT', w: 60, h: 40,
  props: [{ k: 'volts', l: 'Voltage', d: '12V' }, { k: 'ah', l: 'Capacity', d: '' }],
  sub: '{volts} {ah}',
  pins: [pin('-', 0, 20, '−'), pin('+', 60, 20, '+')],
  shapes: [L(0, 20, 24, 20), L(26, 11, 26, 29, { w: 3 }), L(34, 4, 34, 36, { w: 3 }), L(36, 20, 60, 20)],
});
```

The helpers make the shape objects above: `L` (line), `R2` (rect), `C` (circle), `P` (path), `T` (text), `DOT` (a filled dot) and `pin(id, x, y, name)`.

Built-in components can also have:

| Key | Meaning |
| --- | --- |
| `cat` | One of the categories in `CATEGORIES`: Power & charging, Protection, Switches, Relays & control, Lighting, Motors & loads, Gauges & sensors, Wiring & connectors, Electronics, Annotation. |
| `tags` | Extra words for the Parts search, such as `'deutsch dt dtm'`. |
| `noLabel` | Do not draw or number a reference (earths, splices). |
| `hidePins` | Do not draw the pin circles (splices). |
| `gen(props)` | For parts whose shape depends on their fields, such as fuse boxes, connectors, busbars and modules. Returns `{ w, h, pins, shapes }`. |
| `derive(props)` | Works out extra values from the fields before drawing, for use in `sub` and `gen`. |

### How a part behaves in the trace and live test

What a component does electrically is set in `behaviour()` in `app/core/loom-data.js`, by component id: which pins are joined inside it, whether it is a source, an earth, a load, a switch with positions, a relay or a fuse. A new built-in component that is more than a plain load needs an entry there. Anything without an entry, including a custom component without `inside`, is treated as a load between its supply pins and its earth pins (pins named `-`, `31`, `E`, `GND`, `G` and similar), or, with two pins and no earth pin, as a load between them.

### Parts inside a custom component

A custom component can be made of real parts, such as the fuses and relays of a relay and fuse box. Give it an `inside`:

```json
"inside": {
  "parts": [
    { "id": "F2", "type": "fuse", "props": { "rating": "{f2}" } },
    { "id": "R1", "type": "relay4", "props": { "rating": "{relay}" } }
  ],
  "links": [["BAT+", "F2.1"], ["F2.2", "R1.30"], ["R1.87", "R1 OUT"], ["R1.86", "R1 SW"], ["R1.85", "R1 GND"]]
}
```

- `parts` are built-in components (`fuse`, `fuse_maxi`, `breaker`, `relay4`, `relay5`, `diode` and so on). Their fields can take the placed component's fields in braces, so `{f2}` is whatever is typed in that part's F2 field.
- `links` join two points inside: a pin of the component itself (`BAT+`) or `SUBID.PIN`, a pin of a part inside (`F2.1`).
- The trace, the live test, the voltage solver, the fuse and relay schedule and the design checks treat the parts inside as real parts. They are named after the component, so fuse F2 inside FB1 is `FB1/F2`.
- Only one level: a part inside cannot have its own `inside`.

### Editing a component without breaking its wiring

Each save of a custom component counts up `rev`. When pins are renamed, `renames` records `{ "rev": 3, "map": { "old id": "new id" } }`. A project keeps the `rev` of its own copy, and when it takes a newer design it moves wires from old pin ids to new ones using the later entries only. Wires on pins the new design no longer has are left for the user to deal with: the builder warns before saving, and `Ctrl+Z` brings them back.

### Before you send a new component

- Run `npm test`.
- Place it in the app, rotate and flip it, and check the pins land on the grid and the text stays readable.
- If it has a real-world pinout, put the terminal numbers in the pin ids (such as `30`, `85`, `86`, `87` for a relay), and give the source of the pinout in your pull request.
