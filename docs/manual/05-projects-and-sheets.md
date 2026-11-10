# Projects and sheets

A **project** is one vehicle or one piece of equipment. It is saved as one `.loom` file and can hold as many **sheets** as you need: charging, lighting, dash, trailer and so on. Wire numbers, part references, harnesses, colours, cables and revisions belong to the whole project, so the lists and checks cover every sheet.

## Working with several projects

Each open project has a tab above the sheet tabs. You can have several open at once and copy parts and wires between them.

- **File › New project** (or the **+** at the end of the project tabs) starts an empty project. New projects start with the colours from your saved palette.
- **File › Open** (<kbd>Ctrl</kbd>+<kbd>O</kbd>) opens a `.loom` file in a new tab. If the current tab is an untouched new project, the file replaces it.
- **File › Close project**, or the **×** on its tab, closes a project. If it has unsaved changes, LoomWright asks before closing.

## Project details

Open the **Project** pane (the **Project** button on the tool rail). At the top are the project's details, which appear in the title block of every sheet:

| Field | Shown in the title block as |
| --- | --- |
| Title | PROJECT |
| Vehicle | VEHICLE / CLIENT |
| Drawn by | DRAWN BY |
| Revision | REV |
| Date | DATE |

The title is also the name on the project tab. When you issue a revision, LoomWright sets the revision letter and date for you; see [Revision history and save points](21-revisions-and-save-points.md).

The **Totals** section at the bottom of the pane counts sheets, parts and wires, and the total length of cable, over the whole project.

## Project type

Each project has a **Project type**, which tells LoomWright what kind of work it is. To set it, click an empty part of the sheet so nothing is selected, and choose under **Drawing › Project type** in the Properties pane:

| Project type | For |
| --- | --- |
| Vehicle (12/24 V) | Vehicle looms and other low-voltage DC work. New projects start as this. |
| Household (UK mains) | Consumer units and final circuits in a home. See [Household wiring](18-household-wiring.md). |
| Factory, workshop and control panels | Machines, motor starters and control panels. See [Factory, workshop and control panels](19-factory-and-control-panels.md). |
| Electronics project | Small electronic builds. |
| Mixed (show everything) | Anything that does not fit one type. Shows every part, list and check. |

The project type changes:

- which part categories come first in the Parts pane, and which start open,
- which [starter circuits](03-drawing.md#starter-circuits) are offered,
- the colour and size of the first new wire you draw. Vehicle and Mixed projects start with red 1.0 mm², Household with grey 2.5 mm², Factory with black 1.5 mm² and Electronics with red 0.5 mm²,
- which extra tabs appear in the Lists pane and which extra commands appear in the menus,
- which design checks run. Household and factory projects add the mains checks, and leave out some vehicle checks.

Choosing **Household**, **Factory** or **Mixed** also does three things to the project's settings:

- It adds the **Mains installation** settings. See [Sheet and drawing settings](#sheet-and-drawing-settings).
- If the colour codes are **Land Rover / British**, it changes them to **DIN**.
- For **Household** only, it sets the system voltage to 230 V if it was 12, 24 or 48 V.

Changing the type back does not undo these. Set the colour codes and system voltage yourself if you need to.

The first time a household, factory or mixed project opens on this computer, LoomWright shows the [Disclaimer](27-disclaimer.md) and asks you to read it. Click **I understand** to carry on. It does not ask again on this computer.

## Sheets

The sheet tabs above the drawing show every sheet in order. The **Sheet** menu and the Project pane hold the same commands:

- **New sheet** (or **+** at the end of the sheet tabs) adds an empty sheet at the end and lets you type its name.
- **Duplicate sheet** copies the current sheet, with every part and wire, next to it. The copied wires get new numbers, so wire numbers stay unique.
- **Rename sheet**: or double-click its tab, or edit the name in the Project pane.
- **Move sheet left** and **Move sheet right** change the order. The Project pane has up and down arrows for the same thing.
- **Delete sheet** removes the sheet and everything on it. A project always keeps at least one sheet. Deleting can be undone.
- **Previous sheet** (<kbd>PgUp</kbd>) and **Next sheet** (<kbd>PgDn</kbd>) step through them.

## Sheet and drawing settings

Click an empty part of the sheet so nothing is selected. The Properties pane then shows the settings.

Under **Sheet**, for this sheet only:

- **Name**.
- **Paper size**: **Project default**, **Fit to drawing**, or A4, A3, A2 or A1.
- **Orientation**: **Project default**, **Landscape** or **Portrait**.
- How many parts and wires the sheet has, and the length of cable on it.

Under **Drawing**, for every sheet in the project:

| Setting | What it does |
| --- | --- |
| Project type | What kind of work the project is. See [Project type](#project-type). |
| Paper size, all sheets | The paper size for sheets left on **Project default**. |
| Orientation | The orientation for sheets left on **Project default**. |
| System voltage | 12, 24, 48, 110, 230 or 400 V. Used for voltage drop, for working out current from wattage, and by the [live test](11-trace-and-live-test.md#volts-and-amps). |
| Colour codes | Land Rover / British, DIN, SAE, or Custom only. See [Colour codes](04-wires-and-colours.md#colour-codes). |
| Wire labels | What each wire's label shows: **Number, colour, size**, **Colour code only**, or **None**. |
| Title block and revision table | Draws the title block, with the revision table above it. |
| Colour key | Draws a key of every wire colour used on the sheet. |
| Cross-references | Writes where an off-sheet link continues, such as `→ 2/B4`. |
| Junction dots | Draws a dot where two or more wires meet at a pin. |
| Black and white | Draws wires in dark grey for printing on a mono printer. See [Black and white drawings](#black-and-white-drawings). |
| Only offer colours I stock | Limits the wire colour pickers to the colours you stock. |

In household, factory and mixed projects, a note under **Project type** says that the checks are a planning aid only, with a link to the [Disclaimer](27-disclaimer.md). Below the orientation is a **Mains installation** section:

| Setting | What it does |
| --- | --- |
| Building | Home (house or flat), House in multiple occupation, Flat in a high-rise residential building, Purpose-built student accommodation, Care home, or Commercial or industrial. Some household checks depend on it. |
| Country (building rules) | England, Wales, Scotland or Northern Ireland. Used for the note on notifiable work. |
| Usual installation method | How most cables are run, such as **C: clipped to a wall or floor**. Each cable uses this unless you set its own. |
| Ambient temperature °C | The air temperature around the cables. It starts at 30 °C. |

Earthing, Ze and the supply fuse are set on the **Supply** part, not here. See [Household wiring](18-household-wiring.md#the-supply-and-the-consumer-unit).

Under **Build**, also for the whole project:

- **Cut allowance per wire (m)**: extra length added to every wire in the cut list for stripping and terminating. It starts at 0.15 m.
- **Currency symbol**: used for prices in the parts list and cable totals. It starts at £.

**Wire colours…** opens the colours dialog, and **Project details** opens the Project pane.

## Paper sizes, frame and zones

With **Fit to drawing**, the sheet has no fixed size: it grows to fit whatever you draw. When you print or export it, LoomWright draws a border round the drawing and adds the colour key and title block beside it.

With a fixed paper size (A4 to A1), the editor shows the sheet as it will print: a frame with a zone grid round the edge, the colour key in the top right-hand corner, and the title block and revision table in the bottom right-hand corner. Keep the drawing inside the frame.

| Size | Zones across × down (landscape) |
| --- | --- |
| A4 | 6 × 4 |
| A3 | 8 × 6 |
| A2 | 12 × 8 |
| A1 | 16 × 12 |

Zones are named by a row letter and a column number, such as `B4`, as on an engineering drawing. The status bar shows the zone under the pointer, and cross-references use zones to say exactly where a link continues.

## Joining sheets

A circuit often runs across several sheets: the battery and main fuses on sheet 1, the lighting on sheet 2. LoomWright has three ways to join them, and all three count as real connections for tracing, testing, checks and lists.

### Off-sheet references

Place an **Off-sheet reference** (in **Wiring & connectors**) where a wire leaves the sheet, and another on the sheet where it arrives. Give both the same **Link name (same on both sheets)**, such as `AUX FEED`. The **Text** field is what is written in the box, such as `TO FUSE BOX FB1`.

With **Cross-references** on, LoomWright writes under each reference where the other end is: `→ 2/B4` means sheet 2, zone B4 (or only the sheet number on a sheet without zones). Click that text on the drawing to go there. The Properties pane lists the other ends under **Continues on**; click one to go to it.

### Net labels

A **Net label** joins every wire whose label has the same **Net name**, on any sheet, without drawing a wire between them. Use it for a supply such as `IGN 15 (+12V)` that many parts share. Net names and off-sheet link names are matched without regard to capitals, and a net label and an off-sheet reference with the same name are joined too.

### The same part on several sheets

If a part with the same reference and the same type is placed on two sheets, LoomWright treats it as one part drawn twice. For example, fuse box `FB1` can appear on the lighting sheet with ways 1 and 3 wired, and on the accessories sheet with way 5 wired. The Properties pane lists the other sheets under **Also drawn on**. Relays work the same way, so a relay's coil can be on one sheet and its contacts on another.

The design checks warn if one reference is used for two different kinds of part on different sheets, and flag it as an error if a reference is used twice on one sheet.

## Title block and revision table

With **Title block and revision table** ticked, each sheet carries a title block with:

- SHEET TITLE (the sheet name),
- PROJECT, VEHICLE / CLIENT and SIZE,
- DRAWN BY, DATE, REV, SHEET (for example `2 of 5`) and DRAWN WITH LoomWright.

Above it, once you have issued revisions, a revision table lists the latest six: revision, date, description and who issued it.

In household, factory and mixed projects, each sheet also carries a short disclaimer line along the bottom left: "LoomWright is a basic planning tool. Its checks are guidance only, not proof that work meets BS 7671, IEC 60204 or any other code, and it does not replace a qualified electrician or engineer." It is on the screen for sheets with a fixed paper size, and on every print and export.

## Black and white drawings

Colour wires are hard to tell apart on a mono printout. With **Black and white** on (in the drawing settings, or **View › Black and white drawings**), wires are drawn in dark grey, tracers are not drawn, and the colour key lists the codes without colour swatches.

In black and white the only way to read a wire's colour is its code on the label, so keep **Wire labels** on **Number, colour, size** or **Colour code only**.

The build pack has its own black-and-white option, so you can keep the editor in colour and still print the pack in black and white.
