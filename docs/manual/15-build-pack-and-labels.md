# Build pack and wire labels

When the drawing is done, LoomWright can put everything needed to build the loom into one printable document, export the drawings and lists as a PDF, and print a label for every wire.

## Printing the drawings

**File › Print or save PDF (all sheets)** (<kbd>Ctrl</kbd>+<kbd>P</kbd>) prints every sheet, each on its own page at its paper size, followed by the wire list. To get a PDF, choose **Save as PDF** (or **Microsoft Print to PDF**) as the printer in the print window. For a sharper PDF with bookmarks and links, use [Export PDF](#export-pdf) instead.

For a single sheet as a picture or for CAD, see [Import and export](23-import-and-export.md#exporting-drawings).

## Export PDF

**File › Export PDF with bookmarks and links…**, or **PDF** on the tool rail, saves the project as one PDF file without going through the print window. Every sheet is a sharp drawing you can zoom right into, then come the tables you pick.

In the **Export PDF** dialog:

- **Sheets**: **All sheets**, or **This sheet only**.
- **Tables after the drawings**: tick the lists to add after the drawings:

| Table | What it holds |
| --- | --- |
| Wire list | Every wire, with both ends, colour, size, length, current, voltage drop, circuit and harness. |
| Connectors | Every connector, cavity by cavity. |
| Fuses, relays and supplies | The fuse and relay schedule and the supplies. |
| Voltage at each load | The volts each load gets when it runs. See [Voltage at each load](14-lists-and-reports.md#voltage-at-each-load). |
| Parts and costs | The parts to buy, with prices. |
| Cable totals | The cable to buy, by size and colour. |
| Where parts are fitted | Each part's location. |
| Circuit schedule (household) | Household projects only. See [The circuit schedule](18-household-wiring.md#the-circuit-schedule). |
| Motors, PLC inputs and outputs | Factory projects only. See [Lists for panels](19-factory-and-control-panels.md#lists-for-panels). |
| Terminal plan | Factory projects, or once you place a terminal strip. |

Which tables start ticked depends on the project type. A household project starts with the wire list, circuit schedule and parts. A factory project starts with the wire list, motors, terminal plan, PLC inputs and outputs, and parts. Other projects start with the wire list, connectors, fuses, voltage at each load and parts.

- **Drawings in black and white (wire colours written as codes)** draws the sheets for a mono printer.
- **Save PDF** saves the file, named after the project.

In the PDF:

- Each sheet is a page at its own paper size. A **Fit to drawing** sheet is a page the size of the drawing.
- The tables are on A4 landscape pages. Each table page has the project name, the page number and a short disclaimer line along the bottom.
- The bookmarks list every sheet, with every part on it by reference, and every table. Click one to go there.
- Cross-references on the drawings, such as `→ 2/B4`, are links that jump to the other end. In the wire list, the wire number jumps to the wire, and **From** and **To** jump to the parts. In the other tables, the reference jumps to the part.

The PDF uses the standard PDF fonts, so a few symbols are written in letters: Ω becomes `ohm` and → becomes `->`. Characters outside Western European alphabets come out as `?`.

## The build pack

**File › Build pack (PDF)**, **Reports › Build pack**, or **Pack** on the tool rail, opens the build pack dialog. Tick the sections you want:

| Section | What it holds |
| --- | --- |
| Drawings | Every sheet, one to a page. |
| Revision history | Every issued revision: letter, date, who issued it and the description. |
| Wire list | Every wire, with both ends, code, colour, size, length, current, circuit, harness and notes. |
| Cut lists by harness | One cut list per harness, with the length to cut and both ends' terminals. |
| Connector tables | Every connector, cavity by cavity, with housing, wedge lock, terminal and the number of cavity plugs needed. |
| Fuses, relays and load budget | The fuse and relay schedule and the supplies. |
| Voltage at each load | The volts each load gets when it runs, worked out from the drawing. See [Voltage at each load](14-lists-and-reports.md#voltage-at-each-load). |
| Circuit schedule (household) | Each breaker's circuit, cable, RCD, volt drop and Zs. Household and mixed projects only. See [The circuit schedule](18-household-wiring.md#the-circuit-schedule). |
| Motors, Terminal plan, PLC inputs and outputs | The factory lists. Factory and mixed projects only, and the terminal plan when there are terminal strips. |
| Power rails | Each supply rail with what it feeds. Electronics and mixed projects only. See [Power budget](21-electronics.md#power-budget). |
| Fault-finding sheets | A **Does not work** fault sheet for each load with a reference. Not ticked to start with. See [Fault finding](12-fault-finding.md). |
| Parts and costs | The parts to buy and the cable to buy, with prices and totals. |
| Multicore and screened cables | Each cable, its type and cores, how many are used and spare, and its wires. |
| Component locations | The vehicle picture with its markers, and where each part is fitted. |
| Harness formboards | The formboard drawing of each harness, with its branch lengths. |
| Colour usage | Every colour code and the circuits and harnesses it is used for. |
| Wire labels | A sheet of wire labels. Not ticked to start with. |
| Design checks | Any errors and checks still open, with the rule code of household and factory checks. Information findings are left out. |

The pack starts with a cover page giving the project title, vehicle, revision, date, who drew it and how many sheets and wires it has. The cover ends with the short disclaimer; in household, factory and mixed projects it is the mains version, which says the checks are guidance only and do not replace a qualified electrician.

A section with nothing in it is left out. The formboard section only includes harnesses you have laid out in the formboard view; see [Harness formboard](16-harness-formboard.md).

**Drawings in black and white (wire colours written as codes)** prints the drawings for a mono printer, whatever the drawing setting is. See [Black and white drawings](05-projects-and-sheets.md#black-and-white-drawings).

Then:

- **Print or save PDF** sends the pack to the printer, where you can choose **Save as PDF**. The pack is laid out for A4.
- **Save as web page** saves the whole pack as one HTML file. Open it in any browser to read it on a tablet in the workshop, or print it from there.

> Read the build pack through before you cut any wire. Check part numbers against the makers' catalogues, and check the design checks section is empty or that you understand everything in it.

## Wire labels

**File › Wire labels** (or **Reports › Wire labels**) prints a label for each end of every wire. Each label shows:

- the wire number, in bold,
- where this end goes and where the other end goes, such as `F1:2 → U1:IN`,
- the colour code.

So a wire end found in the middle of a loom says what it is and where it should go.

Choose a **Label size**:

| Size | Suits |
| --- | --- |
| 38 × 21 mm | A4 sheets of 65 labels. |
| 63.5 × 33.9 mm | A4 sheets of 24 labels. |
| 46 × 11.1 mm | A4 sheets of 84 wrap-around labels. |
| 25 × 10 mm | Heat-shrink sleeve printers. |

Tick **One label per wire instead of one per end** for one label per wire, showing both ends as `F1:2 ↔ U1:IN`.

- **Print labels** prints them on A4 at the size chosen. Print a test page on plain paper first and hold it against a label sheet: printers differ, and so do label sheets.
- **Save CSV for a label printer** saves the labels as a spreadsheet file, with one row per label. Most label printer programs can import it. **Reports › Export wire labels (CSV)** does the same.

The **Wire labels** section of the build pack prints one label per wire end at 38 × 21 mm. For another size, print labels from **File › Wire labels**.

Renumber wires before printing labels, not after; see [Renumbering](03-drawing.md#renumbering-wires-and-parts).

## When printing is not available

When LoomWright runs inside a preview that does not allow printing, the print commands are hidden or greyed out. Use **Save as web page** in the build pack dialog instead, open the saved page in a browser, and print from there.
