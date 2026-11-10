# Import and export

LoomWright can bring in wire lists and netlists from other programs, and write its drawings and lists in forms other programs can use. Everything is in the **File** and **Reports** menus.

## Importing

Every import can be undone with <kbd>Ctrl</kbd>+<kbd>Z</kbd>. If LoomWright finds something it cannot use, it says what, and imports the rest.

### A wire list from a spreadsheet

**File › Import wire list (spreadsheet)** turns a table of wires into a drawing. Save the spreadsheet as CSV and choose **Choose a CSV file…**, or select the cells in your spreadsheet, copy them, and paste them into the box.

The first row must name the columns. LoomWright understands:

| Column | What it holds |
| --- | --- |
| Wire | The wire number. |
| From, To | Each end, written as part and pin, such as `F1:2`. Or use separate **From part**, **From pin**, **To part** and **To pin** columns. |
| Colour, Tracer | A colour name or code, such as `red`, `R`, `RD` or `NR`, or main colour and tracer together, such as `BK/RD` or `red/white`. |
| Size | In mm² or AWG. |
| Length | In metres or millimetres. |
| Current | In amps. |
| Circuit, Harness, Notes | As on a wire. |

**Save a template** saves an example file with the right columns to start from.

The wires go onto a **new sheet**, named in **New sheet name**. For each part named in the list:

- if a part with that reference is already on another sheet, and has the pins the list uses, a copy of it is placed on the new sheet (the same reference means the same part);
- otherwise LoomWright makes a plain box with that reference and the pins the list uses. It appears in the parts list as `F9 (imported)`; replace it with a proper part when you can.

LoomWright arranges the new parts in rows. Tidy the sheet afterwards.

### WireViz

**File › Import WireViz (YAML)** reads a WireViz harness file (`.yml` or `.yaml`): its connectors, cables and connections become parts and wires on a new sheet named after the file.

### A KiCad netlist

**File › Import KiCad netlist** reads a netlist exported from KiCad (in KiCad, **File › Export › Netlist**, KiCad format, which gives a `.net` file).

- Two-pin resistors, capacitors, inductors and fuses (references starting R, C, L and F) become LoomWright's own symbols.
- Every other component becomes a box with its pins and reference.
- Each net is drawn as a chain of wires from pin to pin, 0.5 mm², in black for nets named like ground (`GND`, `0V`), red for nets named like a supply (`+12V`, `VCC`), and blue for the rest. Named nets give the wires their circuit name.

A circuit board netlist does not know about wire colours, sizes or harnesses, so expect to set those afterwards.

### Measured wire lengths

**File › Import wire lengths (CAD)** sets the lengths of existing wires from a list, for example lengths measured in a 3D model of the vehicle, or on the vehicle with a piece of string. Paste the list, or choose a file. Each row holds a wire number and its length:

```
Wire,Length mm
W1,450
W2,4300
```

How LoomWright reads the units:

- if the first row is a header that mentions `mm`, every length is in millimetres;
- otherwise, if every length in the list is more than 30, they are read as millimetres;
- otherwise every length is read as metres.

A header row saying which unit you mean avoids surprises. After the import, LoomWright says how many wires it updated, whether it read the lengths as metres or millimetres, and which wire numbers it could not find in the project.

## Exporting drawings

These export the sheet you are looking at:

- **File › Export sheet as SVG**: a scalable picture, sharp at any size. Good for documents and web pages.
- **File › Export sheet as PNG**: a picture at twice the drawing's size; an A4 sheet comes out 2376 × 1680 pixels.
- **File › Export sheet as DXF (CAD)**: an AutoCAD R12 DXF drawing in millimetres at paper size, with the frame, parts, pins, wires, text and wire labels on separate layers (`FRAME`, `PARTS`, `PINS`, `WIRES`, `TEXT`, `LABELS`).

A sheet with a fixed paper size exports at that size, with its frame. A **Fit to drawing** sheet exports with a border, the colour key and the title block round the drawing.

To print or save every sheet as PDF, see [Printing the drawings](14-build-pack-and-labels.md#printing-the-drawings).

## Exporting for WireViz

**File › Export for WireViz (YAML)** writes the project's connectors, cables and connections as a WireViz file. Choose **Whole project**, or one harness. WireViz is a separate free tool that draws harness documents from such a file.

## A read-only web page

**File › Save read-only web page** saves the whole project as one HTML file that anyone can open in a web browser, with nothing to install. It has:

- each sheet, on its own tab,
- the wire list,
- tracing: click any wire to highlight its circuit and list every wire on it, on every sheet.

It cannot be edited, which makes it a safe way to show a design to someone or keep a copy on a phone.

## Lists as CSV

Every list can be saved as a CSV file from the **Reports** menu. See [Exporting lists as CSV](13-lists-and-reports.md#exporting-lists-as-csv).

## Other exports

- The build pack can be saved as a web page. See [The build pack](14-build-pack-and-labels.md#the-build-pack).
- The harness formboard exports DXF at 1:1 and SVG. See [Exporting the formboard](15-harness-formboard.md#exporting-the-formboard).
- The vehicle view exports SVG and PNG. See [Using the locations](16-vehicle-locations.md#using-the-locations).
- Your components and blocks export as a library file. See [Sharing components and blocks](09-component-builder.md#sharing-components-and-blocks).
- The revision comparison exports CSV. See [Comparing revisions](17-revisions-and-save-points.md#comparing-revisions).
