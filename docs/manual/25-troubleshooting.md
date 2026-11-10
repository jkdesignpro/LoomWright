# Troubleshooting and questions

## Installing and starting

### Windows says it protected my PC

The installers are not code-signed yet, so Windows does not recognise the publisher. Click **More info**, then **Run anyway**. You only need to do this once.

### The Mac says LoomWright cannot be opened

Right-click (or Control-click) LoomWright in Applications, choose **Open**, then **Open** again. After the first time it opens normally.

### The portable copy does not start

It needs the Microsoft Edge WebView2 runtime. Windows 10 and 11 normally have it; if yours does not, install the WebView2 runtime from Microsoft and try again. Make sure you unzipped the whole folder somewhere you can write to, not inside the zip file.

### Double-clicking a .loom file on a Mac does not open it

On a Mac, open projects from inside LoomWright with **File › Open** (<kbd>Cmd</kbd>+<kbd>O</kbd>).

### LoomWright opened the example project

It does that the first time it starts, and when no other project is open. Your own projects are where you saved them; open them with **File › Open**.

## Saving and files

### I saved in the browser, but cannot find the file

In Firefox and Safari, Save downloads the file to your Downloads folder. In Chrome and Edge, Save asks where to put it each time. See [Saving](06-files-and-saving.md#saving).

### My components, blocks or remembered projects have gone

They are kept on the computer, not in your project files. Check that you are using the same copy of LoomWright as before:

- the desktop app and a browser keep separate libraries,
- each browser, and each private window, has its own storage, and clearing browsing data clears it,
- the portable copy keeps its own library in `LoomWright-data` beside the program.

**Help › About LoomWright** shows where the desktop app keeps your library. Use **Tools › Export my components and blocks** now and then to keep a copy. Components used in a project are also stored in that project's file.

### I need an earlier version of my project

In order of how far back they go:

1. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the last 200 changes in this session.
2. **Save points** in the History pane hold copies from every save and every ten minutes of work, on this computer.
3. **Issued revisions** in the History pane hold every revision you issued, in the project file.
4. Your own backups, or version control such as Git.

See [Revision history and save points](20-revisions-and-save-points.md).

### Changes made by Claude do not appear

The app only notices changes to the file it has open, and only in the desktop app. Check that Claude saved to the same file you have open. If you had unsaved changes, LoomWright offers **Reload** instead of reloading by itself.

## Drawing

### Clicking a pin moves the part instead of starting a wire

If the pointer moves while the button is down, LoomWright takes it as a drag and moves the part. Click without moving. Point at the pin first and wait for the blue circle.

### Clicking on the sheet adds bends instead of selecting

You are still drawing a wire: each click on empty space adds a bend point. Click a pin to finish it, or press <kbd>Esc</kbd> to stop.

### Keyboard shortcuts do nothing

The cursor is probably in a text box, where letters are typed instead. Click an empty part of the sheet and try again. In a browser, <kbd>Ctrl</kbd>+<kbd>Tab</kbd> switches the browser's own tabs; use <kbd>PgDn</kbd> and <kbd>PgUp</kbd> for sheets.

### Wires are grey and tracers have disappeared

Black and white drawing is on. Turn it off with **View › Black and white drawings**.

### Wire numbers and codes are not shown on the drawing

**Wire labels** is set to **None** in the drawing settings. Click an empty part of the sheet and choose another setting.

### The colour I want is not in the colour list

**Only offer colours I stock** is on, and that colour is not ticked as in stock. Tick it in **Tools › Wire colours and stock**, or turn the setting off.

### Pasted parts have different references

That is deliberate: pasted parts and blocks get new references and wire numbers, so nothing clashes. To draw the same part on another sheet, give the copy the same reference by hand. See [The same part on several sheets](05-projects-and-sheets.md#the-same-part-on-several-sheets).

## Circuits and checks

### A trace stops where the circuit goes to another sheet

The two off-sheet references need exactly the same **Link name**, and two drawings of the same part need the same reference and the same kind of part. Check the **Continues on** or **Also drawn on** list in the part's Properties.

### A trace stops at a fuse or switch

That is how the trace works: it shows one circuit, and fuses, switches, relays and loads divide circuits. Trace the other side too, or use the live test to see a whole path from the battery. See [What counts as one circuit](11-trace-and-live-test.md#what-counts-as-one-circuit).

### I cannot switch a relay in the live test

Relays operate themselves when their coil has a feed and an earth. Operate the switch that feeds the coil.

### A load does not come on in the live test

It needs a path from a battery through closed switches and good fuses to its feed pin, and a path from its earth pin to earth. Trace both sides to find the gap. A battery isolator starts **On**; an alternator or solar panel only supplies power when set to **Engine running** or **Sun**.

### A motor starter drops out when I release the start button

The live test does not remember that a contactor was pulled in, so a hold-in contact does not latch. Leave the start button on **Pressed** to see the circuit running. See [Operating parts](11-trace-and-live-test.md#operating-parts).

### Nothing comes on in the live test of a household project

The household **Supply** part is not a supply in the live test, so household circuits do not run. Use the [circuit schedule](18-household-wiring.md#the-circuit-schedule) and the checks for household circuits.

### The live test figures look too high or too low

Check the **System voltage** in the drawing settings, and that every wire has a size and a length and every load a current or wattage. The notes in the live test panel list wires and loads with missing figures. See [Volts and amps](11-trace-and-live-test.md#volts-and-amps).

### Fault finding says to give loads a reference

Fault finding only offers loads and relays with a reference, such as `H1` or `K1`. Household and three-phase parts are not offered at all. See [Fault finding](12-fault-finding.md).

### The fuse schedule shows 0 A loads

LoomWright only knows a load's current if the part has a current or wattage. Fill in lamps' wattage and loads' current. See [How LoomWright works out a load](13-fuses-and-loads.md#how-loomwright-works-out-a-load).

### The Circuit schedule, Motors or PLC I/O tab is missing

These tabs only appear in projects that need them. Set the **Project type** to **Household**, **Factory, workshop and control panels** or **Mixed**. See [Project type](05-projects-and-sheets.md#project-type).

### My wire colours changed to DIN codes

Choosing a household, factory or mixed project type changes **Land Rover / British** colour codes to **DIN**. Set **Colour codes** back in the drawing settings if you want them.

### Imported lengths are a thousand times too big or too small

LoomWright guessed the unit. Undo the import, add a header row such as `Wire,Length mm` or `Wire,Length m`, and import again. See [Measured wire lengths](21-import-and-export.md#measured-wire-lengths).

## Printing

### Print is missing or greyed out

When LoomWright runs inside a preview that cannot print, the print commands are not available. Use **Save as web page** in the build pack dialog, open the page in a browser and print from there.

### The labels do not line up with my label sheet

Printers and label sheets differ. Print a test page on plain paper and hold it against a label sheet; check the printer is not scaling the page (choose 100% or **Actual size** in the print window).

## Reporting a problem

If something does not work as this manual says, please report it on the project's GitHub page. Say what you did, what you expected and what happened, which version you have (it is shown at the right-hand end of the status bar and in **Help › About LoomWright**), and whether you use the desktop app or a browser. A small `.loom` file that shows the problem helps a great deal.
