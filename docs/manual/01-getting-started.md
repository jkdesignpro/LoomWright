# Getting started

LoomWright is a free program for drawing wiring diagrams, written first for vehicle looms. You draw the circuit with real components, give each wire its colour, size, length and circuit, and LoomWright turns that into the lists you need at the bench: a wire list, cut lists, connector tables, a fuse schedule, labels and a printable build pack.

LoomWright also draws household wiring, workshop and factory wiring, and control panels. Each project has a **Project type** that shows the parts, lists and checks for that kind of work. See [Projects and sheets](05-projects-and-sheets.md#project-type).

It works offline. Your projects are ordinary files on your computer, saved with the extension `.loom`.

> LoomWright is a planning and drawing tool. Its checks and hints are guidance only, and it does not replace a qualified electrician or engineer. Read the [Disclaimer](26-disclaimer.md) before you build from your drawings.

This chapter covers installing LoomWright, opening it for the first time, and drawing a first small circuit.

## Which version to use

LoomWright comes in three forms. They are the same program and open the same files.

| Version | Best for |
| --- | --- |
| Desktop app (installer) | Everyday use on your own computer. Opens and saves files directly and keeps your components in one place. |
| Portable Windows copy | Running from a folder or USB stick without installing, or on a computer where you cannot install programs. |
| In a web browser | Trying LoomWright out, or using it on a computer where you cannot run the desktop app. |

## Installing the desktop app

The installers are on the project's GitHub page, under **Releases**. Download the file for your computer:

| Computer | File to download |
| --- | --- |
| Windows 10 or 11 | The `.msi` file, or the `-setup.exe` file. Either installs LoomWright. |
| Mac with Apple Silicon (M1 or later) | The `.dmg` file. Open it and drag LoomWright to Applications. |
| Linux | The `.AppImage` file (runs without installing), or the `.deb` file for Debian and Ubuntu. |

The builds are not code-signed yet, so your computer warns you the first time:

- **Windows** shows "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **Mac** says the app cannot be checked for malicious software. Right-click (or Control-click) LoomWright in Applications and choose **Open**, then **Open** again. You only need to do this once.

On Windows and Linux, the installer tells the computer that `.loom` files belong to LoomWright, so double-clicking a project file opens it. On a Mac, open projects with **File › Open** (<kbd>Ctrl</kbd>+<kbd>O</kbd>).

## The portable Windows copy

The `-portable.zip` file holds `LoomWright.exe` and an empty file called `portable`. Unzip the whole folder somewhere you can write to, such as a USB stick or your Documents folder, and run `LoomWright.exe`.

While the `portable` file sits beside the program, LoomWright keeps its settings, the projects it remembers between sessions, its save points and your **My components** library in a folder called `LoomWright-data` next to the program, and leaves nothing on the computer itself. Delete the `portable` file and it behaves like an installed copy.

The portable copy needs the Microsoft Edge WebView2 runtime. Windows 10 and 11 already have it.

## Running in a web browser

LoomWright also runs in a current web browser such as Chrome, Edge, Firefox or Safari. Download or clone the LoomWright source and open `app/index.html` in the browser. Nothing is installed and nothing is sent anywhere.

In a browser a few things work differently, because a web page is not allowed to read and write files on its own:

- **Save** asks where to put the file each time (in Chrome and Edge), or downloads it to your Downloads folder (in Firefox and Safari).
- **My components**, your saved palette and the projects LoomWright remembers are kept in the browser's own storage. Clearing your browsing data clears them, so export your components now and then (see [Component builder and My components](09-component-builder.md#sharing-components-and-blocks)).
- LoomWright cannot notice when another program changes the open file, so the Claude add-on needs the desktop app.

If you work on the LoomWright source, `npm run serve` serves the same files at `http://localhost:5173`.

## The first time you open LoomWright

The first time it starts, LoomWright opens an example project: the auxiliary electrics of a Land Rover Defender 110 on three sheets. It has a split-charge system, a fuse box, a relay-switched light bar, a fridge feed and a work lamp through a Deutsch connector. Every feature in this manual can be tried on it, and you can reopen it at any time with **File › Open example project**.

LoomWright remembers the projects you had open, and reopens them next time, including changes you had not saved. That is a safety net, not a substitute for saving: save your work to a `.loom` file.

## Your first circuit

This short exercise draws a fused lamp: a battery, a fuse and a lamp, with an earth.

1. Choose **File › New project**. If the example is open and you have not changed it, the new project replaces it; otherwise it opens in a new tab.
2. In the **Parts** pane on the left, type `battery` in the search box. Drag **Battery** onto the sheet. Do the same for **Blade fuse**, **Lamp / bulb** and **Chassis earth**. You can also click a part in the list to drop it in the middle of the view.
3. Point at the end of the battery's **+** lead. The pointer becomes a cross, a blue circle marks the pin, and a tooltip names it. Click it, then click the fuse's left-hand pin. A wire appears between them, numbered `W1`.
4. Click the fuse's other pin, then one end of the lamp. Wire the lamp's other end to the earth. Place a second earth and wire the battery's **−** pin to it.
5. Click a wire to select it. Its details appear in the **Properties** pane on the right: set the colour, the size and a circuit name such as `Lamp`.
6. Look at the **Wire list** at the bottom of the window. Every wire is there, with where it starts and ends.
7. Save with <kbd>Ctrl</kbd>+<kbd>S</kbd>. Give the file a name; LoomWright adds `.loom`.

The rest of this manual explains each step in more detail. Good places to go next:

- [The window](02-the-window.md) names the parts of the screen.
- [Drawing](03-drawing.md) covers placing, wiring and arranging.
- [Wires and colours](04-wires-and-colours.md) covers wire colours, sizes and the colour codes.
- [Drawing](03-drawing.md#starter-circuits) also has ready-made starter circuits, such as spot lamps with a relay or a split charge, to place and change.

## Getting help inside LoomWright

- This manual is built in. Open it with **Help › User manual**, or press <kbd>F1</kbd>. <kbd>F1</kbd> opens the chapter for what you are doing, such as the live test, the formboard or the component builder. Otherwise it opens the chapter you last read. Use the search box at the top to find a word anywhere in it.
- **Help › Disclaimer** shows what LoomWright can and cannot tell you.
- Press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search every command, sheet, part and wire by name.
- **Help › Keyboard and mouse** lists the main shortcuts. [Keyboard and mouse](23-keyboard-and-mouse.md) has the full list.
- Hold the pointer over a button to see what it does.
- The status bar at the bottom of the window shows a hint for what you are doing.
