# Contributing to LoomWright

Thank you for helping. Bug reports, corrections to the manual or the translations, new component symbols and code are all welcome.

LoomWright is free software under the GNU General Public License, version 3 or later. By sending a change you agree that it is released under the same licence.

## Reporting a problem

Open an issue on GitHub. Say:

- what you did, what you expected, and what happened;
- which version you have (shown at the right-hand end of the status bar and in **Help › About LoomWright**);
- whether you use the desktop app (and on which system) or a browser (and which one);
- if you can, attach a small `.loom` file that shows the problem.

## Before you write code

For anything larger than a fix, open an issue first and describe what you want to change, so we can agree on the approach before you spend time on it.

[Building LoomWright](docs/building.md) explains how to run the app from the source and how it is put together.

## How the code is written

- **No build step and no framework.** The editor is plain HTML, CSS and JavaScript that runs as it is. Please do not add a bundler, a framework or a runtime dependency. A small library can go in `app/vendor/` with its licence, if there is no reasonable way to do without it.
- **Offline.** The app loads nothing from the internet. The desktop app's content security policy only allows files from the app itself, so do not add inline `<script>` blocks or external links to scripts, styles or fonts.
- **The core has no browser code.** Files in `app/core/` must also run in Node, because the tests and the Claude add-on use them. Keep anything that touches the page in `app/editor.js`, `app/views.js` or `app/builder.js`.
- **Style.** Two-space indents, single quotes, semicolons, `'use strict'`. Follow the code around your change.
- **Licence header.** Start each new file with a short description and `SPDX-License-Identifier: GPL-3.0-or-later`, as the existing files do.
- **Interface text** goes through `t()` from `app/i18n.js`, so it can be translated. Write it in plain UK English, in full sentences, and say what will happen ("Delete 3 wires") rather than how clever it is.
- **Colours and themes.** Use the CSS custom properties defined at the top of `app/styles.css` (`--bg`, `--panel`, `--ink`, `--line`, `--accent` and so on) so the change works in both the light and dark themes.
- **Keyboard.** New controls should work from the keyboard, and buttons need a visible label or an `aria-label`.

## Checks before you send a change

- Run `npm test`. If you changed anything in `app/core/` or `mcp/`, also run the add-on tests (`cd mcp && npm ci && node test.js`).
- Try the change in the running app, in the light and dark themes, and check the browser console for errors.
- If the change affects what the user sees or does, update the manual (below).

## Pull requests

- Keep each pull request to one change.
- Say what it changes and why, and how you tested it.
- Include a screenshot for changes to the interface.
- Add a line to `CHANGELOG.md` for anything a user would notice.

## Components

A new built-in symbol is a short definition in `app/core/loom-core.js` (or `app/core/loom-data.js` for connectors and vehicle-specific parts). [Components](docs/components.md) describes the format and the grid rules that the tests check. When a component has a real-world pinout, say where the pinout came from.

## Design checks and figures

The design checks, wire size guide figures and load figures are rules of thumb, and the manual says so. If you change a threshold or a rating, give the source in the pull request, and keep the wording in the app and the manual honest about what the check can and cannot tell.

## The user manual

The manual is in `docs/manual/`, one Markdown file per chapter. The app shows a copy built from it:

1. Edit the Markdown.
2. Run `npm run manual`. It rebuilds `app/manual.js` and warns about broken links between chapters or missing images.
3. Commit both the Markdown and `app/manual.js`.

How to write for the manual:

- Write in UK English, plainly, in full sentences, for someone building their own loom rather than a trained electrician.
- Describe only what the app does. Try each step in the app before you write it down.
- Use the names the app uses, in bold: **File › Save**, the **Properties** pane. Write keys as `<kbd>Ctrl</kbd>+<kbd>S</kbd>`.
- Keep sections short with clear headings, so the search lands somewhere useful.
- Be honest about limits. Do not write "simply" or "just".
- Screenshots go in `app/manual/img/`; see [Building LoomWright](docs/building.md#the-user-manual).

## Translations

The interface is in English, German, French, Spanish and Dutch. The translations are a first pass and corrections from native speakers are very welcome.

They are all in `app/i18n.js`. Each entry is the English text followed by the German, French, Spanish and Dutch, separated by `|`:

```js
'Save as…': 'Speichern unter…|Enregistrer sous…|Guardar como…|Opslaan als…',
```

Correct the part you know and leave the rest. Text that has no entry stays in English. To add a language, open an issue first: it means adding the language to `LANGS` and `COL` at the top of the file and a column to the entries.

The user manual is in English only for now.

## The Claude add-on

The add-on is in `mcp/`. Its instructions are in `mcp/README.md`, and `docs/claude-addon.md` is a copy of that file: change both together.
