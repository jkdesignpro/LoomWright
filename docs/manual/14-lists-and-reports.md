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

The fuse and relay schedule and the load budget. See [Fuses and loads](13-fuses-and-loads.md).

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

## Build

The **Build** tab tracks the loom as you make it. Each wire has four steps: **Cut**, **Ends** done, **Fitted**, and its **Test**, which is **Pass** or **Fail**.

At the top is a progress bar for the whole project and, when there is more than one harness, for each harness. Beside each bar it says how many wires are cut, how many have passed and how many have failed. The percentage counts every step of every wire, so a wire that is cut, finished, fitted and passed counts in full.

The table lists the wires by harness, in cut list order:

| Column | What it shows |
| --- | --- |
| Wire, Code, Size, Cut m | Which wire, and its cut length. |
| From, To | Where the wire goes. |
| Cut, Ends, Fitted | Tick each one as you do it. |
| Test | **–** (not tested), **Pass** or **Fail**. A failed wire's row is marked. |
| Note | Anything you want to remember, such as a reading. |

The same steps are in the **Build and test** section of each wire's Properties, with a **Build note**. Build progress is saved in the project file. Restoring a save point or an older revision keeps it.

### Ticking the build off on a phone

To tick wires off at the bench without the computer:

1. Click **Phone checklist…** on the **Build** tab, or choose **Tools › Phone build checklist…**. LoomWright saves a web page called `<project>-build-checklist.html`.
2. Copy the page to your phone or tablet and open it in a web browser. It opens on the **Build checklist** tab. Tap **Cut**, **Ends** and **Fitted** for each wire as you go. Tap **Test** once for a pass (**Test ✓**), again for a fail (**Test ✗**), and again to clear it. Type a note under any wire.
3. The ticks are kept on that phone. When you are done, tap **Export progress**. The phone saves a file called `<project>-progress.json`.
4. Back in LoomWright, click **Import phone progress…** on the **Build** tab, or choose **Tools › Import phone progress…**, and pick that file.

When importing, a step ticked on either side stays ticked, and the phone's test result and note win. A file from a different project is refused. **Clear ticks on this device** on the phone starts its list again from the project's own progress.

## Shopping

The **Shopping** tab is what to buy for this project, after taking off what you already have in **My stock**.

The heading says how many lines there are to buy, the rough cost, and how many wires have no length.

The cable table has one row for each size, colour and insulation:

| Column | What it shows |
| --- | --- |
| Cable, Code, Colour | The size and colour. |
| Need m | The length of every wire, plus the cut allowance for each. `+?` means some of these wires have no length yet. |
| In stock m | What **My stock** holds of that size and colour. |
| Buy m | What you need plus 10% spare, less what is in stock. |
| Reel | The smallest usual reel that covers it: 5, 10, 25, 50 or 100 m. |
| Cost | From the price per metre on the **Cable totals** tab. |

The cores of a multicore cable are left out of the cable table, because they come with the cable.

The parts table lists every part from **Parts & costs**, with what you need, what is in stock and what to buy. A stock part matches when its part number is the same. A stock part with no part number matches by name.

Rows with nothing to buy are greyed out.

### My stock

**Tools › My stock…**, or **Edit my stock…** on the **Shopping** tab, holds what you have on the shelf:

- **Cable**: size, main colour, tracer and metres. **Add every cable this project uses** adds a row for each cable in the project, for you to fill in the metres.
- **Parts**: component, part number and quantity.

Click **Save stock**. Your stock is kept on this computer, with **My components**, and shared by all your projects. The [colour suggestions](04-wires-and-colours.md#suggested-colours) prefer colours you have in stock.

Once the loom is built, click **Take from stock…** on the **Shopping** tab. LoomWright lists what the project uses, without the 10% spare, and takes it off your stock when you confirm. The message after it offers **Undo**.

## Circuits

Every circuit, with its wires, connections, sheets and the pins it joins. Click a row to trace it. See [The Circuits list](11-trace-and-live-test.md#the-circuits-list).

## Checks

The design checks. See [Design checks](10-design-checks.md).

## Lists for household and factory projects

These tabs appear only when the project needs them:

- **Circuit schedule**, in household and mixed projects, or once you place an MCB or RCBO. See [The circuit schedule](18-household-wiring.md#the-circuit-schedule).
- **Motors** and **PLC I/O**, in factory and mixed projects, or once you place a three-phase motor, a contactor or a PLC card. See [Lists for panels](19-factory-and-control-panels.md#lists-for-panels).
- **Terminal plan**, in the same projects, or once you place a terminal strip.

The same lists are in the **Reports** menu.

## Voltage at each load

**Reports › Export voltage at each load (CSV)** saves a table of the voltage each load gets when it runs. LoomWright finds switch positions in which each load runs, from the positions drawn, and works out the volts as the [live test](11-trace-and-live-test.md#volts-and-amps) does, with a battery at 12.6 V at rest.

| Column | What it shows |
| --- | --- |
| Load, Sheet | Each load with a reference. |
| Switched on by | The switch positions used, such as `S1 Closed`, or `always on`. |
| Volts, Supply V, Drop % | The volts at the load, at the supply that feeds it, and the drop between them. |
| Amps | The current it draws. |
| Status | **ok** for a drop of 3% or less, **check** up to 10%, **low** over 10%. **never on** means no switch position LoomWright tried runs it. **no rating** means it has no current or wattage. |

The same table can go in the build pack and the PDF export. It is a guide, not a measurement.

## Exporting lists as CSV

Each list can be saved as a CSV file for a spreadsheet, from the **Reports** menu:

- **Export wire list (CSV)**
- **Export parts and costs (CSV)**
- **Export cable totals (CSV)**
- **Export cut list (CSV)**
- **Export connector tables (CSV)**
- **Export fuses and loads (CSV)**
- **Export voltage at each load (CSV)**
- **Export shopping list (CSV)**, with a row for each cable and part: what you need, what is in stock and what to buy
- **Export wire labels (CSV)**, for a label printer; see [Wire labels](15-build-pack-and-labels.md#wire-labels)
- **Export colour usage (CSV)**
- **Export circuit schedule (CSV)**, in household projects
- **Export motor list (CSV)**, **Export terminal plan (CSV)** and **Export PLC I/O list (CSV)**, in factory projects

The CSV files always cover the whole project.

## Printing lists

To print the lists, use the build pack, which puts any of them together with the drawings in one document. See [Build pack and wire labels](15-build-pack-and-labels.md). **File › Export PDF with bookmarks and links…** puts the drawings and the lists you pick in one PDF; see [Export PDF](15-build-pack-and-labels.md#export-pdf). **File › Print or save PDF (all sheets)** prints every sheet followed by the wire list.
