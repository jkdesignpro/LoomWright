# Build pack and wire labels

When the drawing is done, LoomWright can put everything needed to build the loom into one printable document, and print a label for every wire.

## Printing the drawings

**File › Print or save PDF (all sheets)** (<kbd>Ctrl</kbd>+<kbd>P</kbd>, or **PDF** on the tool rail) prints every sheet, each on its own page at its paper size, followed by the wire list. To get a PDF, choose **Save as PDF** (or **Microsoft Print to PDF**) as the printer in the print window.

For a single sheet as a picture or for CAD, see [Import and export](18-import-and-export.md#exporting-drawings).

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
| Parts and costs | The parts to buy and the cable to buy, with prices and totals. |
| Multicore and screened cables | Each cable, its type and cores, how many are used and spare, and its wires. |
| Component locations | The vehicle picture with its markers, and where each part is fitted. |
| Harness formboards | The formboard drawing of each harness, with its branch lengths. |
| Colour usage | Every colour code and the circuits and harnesses it is used for. |
| Wire labels | A sheet of wire labels. Not ticked to start with. |
| Design checks | Any errors and checks still open. Information findings are left out. |

The pack starts with a cover page giving the project title, vehicle, revision, date, who drew it and how many sheets and wires it has.

A section with nothing in it is left out. The formboard section only includes harnesses you have laid out in the formboard view; see [Harness formboard](15-harness-formboard.md).

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
