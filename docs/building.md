# Building LoomWright

This page is for people who want to run LoomWright from the source, change it, or make a release. To use LoomWright, download an installer instead; see the [user manual](manual/01-getting-started.md).

## How it is put together

- **The editor** in `app/` is plain HTML, CSS and JavaScript with no build step and no framework. `app/index.html` loads the scripts in order. It runs in a browser as it is.
- **The core** in `app/core/` holds the component library, project model, drawing, checks, reports and import and export. It has no browser dependencies, so the tests and the Claude add-on load it in Node through `app/core/loom.js`.
- **The desktop app** in `src-tauri/` is a small Tauri 2 shell in Rust. It shows `app/` in a web view and adds native open and save dialogs, the component library file, portable mode, and reloading a file when it changes on disk.
- **The Claude add-on** in `mcp/` is a Node MCP server that uses the same core.
- **The user manual** is Markdown in `docs/manual/`, turned into `app/manual.js` by `scripts/build-manual.js`.

## Run it in a browser

You need [Node.js](https://nodejs.org) 18 or newer.

```sh
npm run serve
```

Then open http://localhost:5173. Set `PORT` to use another port, for example `PORT=5174 npm run serve`. The server is `scripts/serve.js`, a few lines with no dependencies that serves the `app` folder.

The browser version cannot open or save files directly in every browser, and keeps your component library in browser storage. Everything else works.

## Run the desktop app

You need Node.js 18 or newer, [Rust](https://rustup.rs) 1.77 or newer, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system. On Debian or Ubuntu that includes `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` and `patchelf`.

```sh
npm install
npm run dev      # the desktop app, reloading when you change files in app/
npm run build    # installers for this computer, in src-tauri/target/release/bundle/
```

## Tests

```sh
npm test
```

runs `scripts/test-core.js`. It places every built-in component and checks its size, pins and grid, opens the example project and checks it has no errors, and tests file round trips, sheet lookups, colour codes, the design checks, revisions, the trace and live test, the fuse schedule and load budget, the build lists, the formboard, and import and export.

The Claude add-on has its own tests:

```sh
cd mcp
npm ci
node test.js
```

GitHub Actions runs both on every push and pull request (`.github/workflows/ci.yml`, Node 22).

There is no automated test of the editor's interface. After changing it, try the change in the running app, in both the light and dark themes, and check the browser console for errors.

## The user manual

The manual's source is one Markdown file per chapter in `docs/manual/`, numbered to set the order. The chapter's id in the app is the file name without the number: `03-drawing.md` is `drawing`.

After changing the Markdown, rebuild the copy the app uses and commit both:

```sh
npm run manual
```

The build:

- understands headings, paragraphs, lists, tables, block quotes (shown as notes), code, bold, italic, links, images and `<kbd>` keys, and shows any other HTML as text;
- turns links to other chapters, such as `[Bends](03-drawing.md#shaping-wire-routes)`, into links inside the app, using the same heading anchors as GitHub;
- shows links to other files in the repository as a file name, since the app cannot open them;
- warns, and exits with an error, if a link points at a heading that does not exist or an image is missing.

The output depends only on the Markdown, so building twice gives the same file.

Screenshots go in `app/manual/img/` and are linked from the Markdown as `../../app/manual/img/name.png`, so they show both on GitHub and in the app. Take them from the running app at 1:1 scale (not on a high-density screen), keep each PNG under about 250 KB, and use the example project where you can.

The viewer is `app/manual-viewer.js` with styles in `app/manual.css`. It exposes:

```js
LoomManualViewer.open(chapterId?, anchor?)  // open the manual, optionally at a chapter and heading
LoomManualViewer.close()
LoomManualViewer.search(query)              // open the manual with a search
LoomManualViewer.isOpen()
LoomManualViewer.chapters()                 // [{ id, title, sections: [{ anchor, title }] }]
```

## Portable mode

If a file called `portable` (or `portable.txt`) sits next to the program, the desktop app keeps its data in a `LoomWright-data` folder beside it instead of the user's application data folder. That covers the component library (`library.json`) and, on Windows, the web view's storage (settings, autosave and save points), through `WEBVIEW2_USER_DATA_FOLDER`. **Help › About LoomWright** shows which folder is in use. The code is `portable_dir()` in `src-tauri/src/lib.rs`.

## Packing the Claude add-on

The add-on runs from the source folder as it is (`node mcp/server.js`); see [claude-addon.md](claude-addon.md). To make a package that runs on its own:

```sh
cd mcp
npm pack
```

`npm pack` first runs `mcp/scripts/bundle-core.js`, which copies `app/core` and `app/vendor` into the package. Those copies are ignored by Git.

## Making a release

1. Set the new version number in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `mcp/package.json` and `VERSION` in `app/core/loom-core.js`.
2. Add a section to `CHANGELOG.md`.
3. Check `npm test` and the add-on tests pass, and the manual builds.
4. Commit, then push a tag such as `v0.4.0`.

The *Desktop builds* workflow (`.github/workflows/release.yml`) runs on the tag. It can also be started by hand from the Actions tab. It builds on Windows, macOS (Apple Silicon) and Ubuntu 22.04 and puts the results on a **draft** release:

| System | Files |
| --- | --- |
| Windows | `.msi`, `-setup.exe`, and `_x64-portable.zip` (holding `LoomWright.exe`, the `portable` file and `LICENSE.txt`) |
| macOS | `.dmg` |
| Linux | `.AppImage`, `.deb` |

Check the draft, then publish it. The installers are not code-signed.
