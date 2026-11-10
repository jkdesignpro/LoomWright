# The Claude add-on

LoomWright works fully on its own, offline. If you use Claude, an optional add-on lets Claude read and edit your projects for you: you describe a circuit in plain English and Claude draws it, checks it, or answers questions about it.

**Help › Use with Claude** (or the **Claude** button at the bottom of the tool rail) shows example requests and how to set it up. The full instructions, and the list of everything Claude can do, are in the LoomWright source in [the Claude add-on guide](../claude-addon.md).

## What it can do

Some examples of what you can ask:

- "Add a second sheet for the rear work lights: two LED floods on a relay, switched from the dash, 15 A fuse from FB1 way 5."
- "Here is a picture of my switch panel's pinout. Make it a custom component and save it to my library." (with the picture attached)
- "I only stock red, brown/red, black, green and purple/white. Recolour sheet 2 using just those and tell me where colours are reused."
- "Check the load on every fuse and tell me which are over 80%."
- "Trace the AUX FEED circuit and list every wire on it."
- "Issue revision B, 'fridge feed moved to 6 mm²', and tell me what changed since A."
- "Give me the cut list for the engine bay harness."
- "The spot lamps are dim. Write me a fault-finding sheet for them, with the voltages I should read."
- "What voltage will the fridge get at the end of 6 m of 4 mm² cable?"
- "Add a direct-on-line starter for a 2.2 kW motor to the panel sheet, and number the wires by potential."
- "Plan the air for my garage: a 300 l/min piston compressor, a 100 l receiver, a 15 m run and an impact wrench."

Claude uses the same component library, checks, trace, live test, circuit solver, reports and revision history as the app. For household, factory and compressed air work it gives the same guidance as the app, with the same limits: see the [Disclaimer](28-disclaimer.md).

## How it works with the app

The add-on is a small program (an MCP server) in the `mcp` folder of the LoomWright source. It is not part of the installers. It needs Node.js 18 or newer.

- Claude reads and writes the same `.loom` files you open in LoomWright.
- If the project is open in the **desktop app**, the app reloads it as soon as Claude saves, and says **Updated from file. Ctrl+Z undoes the change.** <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes everything Claude changed in that save. See [When the file changes on disk](06-files-and-saving.md#when-the-file-changes-on-disk).
- Components Claude makes are saved to the same library as **My components**, and appear in the Parts pane when you switch back to LoomWright.

The browser version cannot notice when a file changes, so use the desktop app with the add-on.

## Checking Claude's work

Treat what Claude draws as you would a drawing from someone else: look it over before you build from it. Trace the circuits it added, run the live test, read the design checks, and check any component made from a picture against the real part's pinout.
