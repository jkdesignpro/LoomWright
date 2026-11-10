# Files and saving

This chapter covers how LoomWright saves your work, what it keeps on your computer besides your project files, and where.

## Project files

Each project is saved as one file with the extension `.loom`. It holds every sheet, part and wire, the project settings, your own colours, any custom components the project uses, the harness formboard layouts, the vehicle picture and the issued revisions.

A `.loom` file is plain text (JSON), so:

- it is small, and safe to email or keep in cloud storage,
- it works well with version control such as Git, which can show what changed between two versions,
- other programs can read it. The format is described in the LoomWright source, in [the .loom file format](../file-format.md).

## Saving

- **File › Save** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) saves the project. The first time, it asks where, and suggests a file name made from the project title.
- **File › Save as** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) saves a copy under a new name; from then on, the project is saved to the new file.

A dot (•) after the project name in the title bar, and on its tab, means there are changes not yet saved to the file.

In the **desktop app**, Save writes straight to the file. The file is written in full and then swapped in, so a program reading it at that moment never sees half a file.

In a **web browser**, a page is not allowed to write to a file it opened. In Chrome and Edge, Save asks where to save each time. In Firefox and Safari, it downloads the file to your Downloads folder; move it somewhere sensible and open it from there next time.

## Opening files

- **File › Open** (<kbd>Ctrl</kbd>+<kbd>O</kbd>) opens a `.loom` file in a new tab.
- On Windows and Linux, double-clicking a `.loom` file opens it in LoomWright.
- **File › Open example project** opens the Defender example.

Files saved by earlier versions of LoomWright open normally and are brought up to date when you next save them.

## When the file changes on disk

The desktop app checks every second or two whether the open file has been changed by another program, such as the Claude add-on, a Git pull, or a sync service.

- If you have no unsaved changes, LoomWright reloads the file and says **Updated from file. Ctrl+Z undoes the change.** Undo takes you back to how it was before the reload.
- If you do have unsaved changes, it says **This file changed on disk** and offers **Reload**. Reloading replaces your unsaved changes with the file; ignoring it keeps your version, and your next save overwrites the file.

A browser cannot watch files, so this only happens in the desktop app.

## What LoomWright remembers between sessions

Besides your project files, LoomWright keeps a few things of its own on this computer:

| What | Where it is kept |
| --- | --- |
| The projects you had open, including unsaved changes | The app's own storage. They reopen next time you start LoomWright. |
| Save points (copies of each project at points in time) | The app's own storage. See [Save points](20-revisions-and-save-points.md#save-points). |
| My components, My blocks and your saved palette of colours | A file called `library.json` in the desktop app's data folder, or the browser's storage when running in a browser. |
| Language, theme and similar settings | The app's own storage. |

The projects LoomWright remembers are a safety net in case the computer or the program stops unexpectedly. They are not a substitute for saving: save your work to a `.loom` file, and keep a copy somewhere else.

## Where the desktop app keeps its data

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\org.loomwright.app` |
| Mac | `~/Library/Application Support/org.loomwright.app` |
| Linux | `~/.local/share/org.loomwright.app` |

**Help › About LoomWright** shows the exact path of your library file on this computer.

In the portable Windows copy, everything is kept in the `LoomWright-data` folder next to `LoomWright.exe` instead: the library, the app's own storage and the save points. Copy the whole folder to move LoomWright, with your components and remembered projects, to another computer. See [The portable Windows copy](01-getting-started.md#the-portable-windows-copy).

## In a web browser

When LoomWright runs in a browser, everything it remembers lives in that browser's storage for the page's address. That has some consequences:

- A different browser, or the same browser in a private window, starts empty.
- Clearing your browsing data or site data clears your remembered projects, save points and **My components**.

Export your components and blocks now and then with **Tools › Export my components and blocks**, and keep your projects as `.loom` files.

## Sharing a project with someone

- Send the `.loom` file. Custom components used in the project travel inside it, so the other person sees the same symbols. Their colour palette and blocks are their own.
- For someone without LoomWright, use **File › Save read-only web page**. It writes a single web page with the drawings and the wire list, which anyone can open in a browser. See [Import and export](21-import-and-export.md#a-read-only-web-page).
- For the workshop, print a build pack. See [Build pack and wire labels](15-build-pack-and-labels.md).
