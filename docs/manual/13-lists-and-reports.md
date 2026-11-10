# Lists and reports

LoomWright keeps a set of lists up to date as you draw. They are in the Lists pane under the sheet, in the **Reports** menu, and in the build pack. This chapter describes each one.

## Using the Lists pane

- Click a tab to show a list. **Reports** in the menu bar opens the same lists.
- **All sheets** lists the whole project. Untick it to list only the sheet you are looking at.
- Click a row to select that wire or part on the drawing. If it is on another sheet, LoomWright goes there.
- The arrow at the right-hand end folds the pane away; the **Lists** button on the tool rail brings it back.

## Wire list

Every wire, one row each, in drawing order:

| Column | What it shows |
| --- | --- |
| Sheet | The sheet number. |
| Wire | The wire number. |
| From, To | The two ends, as reference and pin, such as `F1:2` and `U1:IN`. |
| Colour, Code | The colour in words, with a swatch, and its colour code. |
| Size, AWG | The size in mm² and the nearest AWG. |
| Length m | The length you entered. |
| Current A | The current you entered. |
| Drop V | The voltage drop, when length and current are both filled in. |
| Circuit, Harness, Cable | As set on the wire. |
| Notes | The wire's notes. |

## Parts & costs

Everything to buy, grouped, with quantities, part numbers, suppliers, prices, references and locations, and totals for parts and cable. See [Part data](08-part-data.md#the-parts-list-and-costs).

## Cable totals

The cable to buy, by size, colour and insulation: how many wires, the total metres, the metres to buy with 15% added, the price per metre and the cost. Type your price per metre for each size under the table. See [Cable prices](08-part-data.md#cable-prices).

## Colour usage

Every colour code and every job it does, by circuit and harness. See [Colour usage](04-wires-and-colours.md#colour-usage).

## Fuses & loads

The fuse and relay schedule and the load budget. See [Fuses and loads](12-fuses-and-loads.md).

## Connectors

Every connector, cavity by cavity: the wire, its code and size, its circuit, where it goes, the terminal and the seal. Each connector's heading gives its series, housing, side, mating half, wedge lock and sheet. See [Connector tables](07-harnesses-connectors-and-ends.md#connector-tables).

## Cut list

The list to cut wires from, one section per harness, each headed with how many wires and how many metres to cut. Within a harness, wires are listed heaviest first.

| Column | What it shows |
| --- | --- |
| Wire, Code, Size, Insulation | Which wire, and what to cut it from. |
| Length m | The length you entered. |
| Cut m | The length plus the **cut allowance** for stripping and terminating. The allowance is set under **Build** in the drawing settings; it starts at 0.15 m. |
| From, End A | Where the first end goes, and its terminal, strip length, heat shrink and seal. |
| To, End B | The same for the other end. |
| Cable | The multicore cable it is a core of, if any. |

Harnesses are listed in alphabetical order. Wires with no harness come last, under **No harness**.

## Circuits

Every circuit, with its wires, connections, sheets and the pins it joins. Click a row to trace it. See [The Circuits list](11-trace-and-live-test.md#the-circuits-list).

## Checks

The design checks. See [Design checks](10-design-checks.md).

## Exporting lists as CSV

Each list can be saved as a CSV file for a spreadsheet, from the **Reports** menu:

- **Export wire list (CSV)**
- **Export parts and costs (CSV)**
- **Export cable totals (CSV)**
- **Export cut list (CSV)**
- **Export connector tables (CSV)**
- **Export fuses and loads (CSV)**
- **Export wire labels (CSV)**, for a label printer; see [Wire labels](14-build-pack-and-labels.md#wire-labels)
- **Export colour usage (CSV)**

The CSV files always cover the whole project.

## Printing lists

To print the lists, use the build pack, which puts any of them together with the drawings in one document. See [Build pack and wire labels](14-build-pack-and-labels.md). **File › Print or save PDF (all sheets)** prints every sheet followed by the wire list.
