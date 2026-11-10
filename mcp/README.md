# Claude add-on (optional)

LoomWright works completely on its own. If you use Claude, this add-on lets you describe a
circuit in plain English and have Claude draw it, check it and edit it for you, for example:

> Add a pair of LED spot lamps on the aux battery. 20 A fuse from the fuse box, a 30 A relay,
> an illuminated rocker switch on the dash fed from ignition, brown/red feed and purple/white to
> the lamps, 2.5 mm², about 3.5 m run. Use Land Rover colour codes.

> Here is a picture of my switch panel's pinout. Make it a custom component and add it to my library.

> I only stock red, black, brown, green, purple and white. Put the rear work lights on a new sheet
> using just those, and tell me where a colour is reused in the same harness.

The add-on is a small [MCP](https://modelcontextprotocol.io) server in the `mcp/` folder. It reads
and writes the same `.loom` files as the app. If the file is open in the LoomWright desktop app,
the app reloads it as soon as Claude saves a change.

## Install

You need [Node.js](https://nodejs.org) 18 or newer.

```sh
cd mcp
npm install
```

### Claude Desktop

Open *Settings → Developer → Edit Config* and add:

```json
{
  "mcpServers": {
    "loomwright": {
      "command": "node",
      "args": ["C:/path/to/loomwright/mcp/server.js"],
      "env": { "LOOMWRIGHT_DIR": "C:/Users/you/Documents/LoomWright" }
    }
  }
}
```

On a Mac the paths look like `/Users/you/loomwright/mcp/server.js`. Restart Claude Desktop.

### Claude Code

```sh
claude mcp add loomwright -- node /path/to/loomwright/mcp/server.js
```

`LOOMWRIGHT_DIR` is where projects given as a plain file name are saved. It defaults to
`Documents/LoomWright` in your home folder. Full paths work too.

Components Claude makes are saved to the same library as the app's *My components*:

| System | Library file |
| --- | --- |
| Windows | `%APPDATA%\org.loomwright.app\library.json` |
| macOS | `~/Library/Application Support/org.loomwright.app/library.json` |
| Linux | `~/.local/share/org.loomwright.app/library.json` |

Set `LOOMWRIGHT_LIBRARY` to use another file. The app picks up new components when you switch back to it.

## A component from a picture

Attach a photo or screenshot of a pinout, a datasheet symbol or a connector face, and ask Claude to
make it a component. Claude reads the picture itself and calls `define_component` in *drawn mode*:
an outline and details drawn with lines, boxes, circles, paths and text, plus each pin with its number,
name and position on the outline. Pins are snapped to the 10-unit grid so wires line up. Claude also
writes a preview SVG it can check, and saves the component to your library (and to a project, if you name
one). You can fine-tune it afterwards in the app's component builder.

## What Claude can do

| Tool | Purpose |
| --- | --- |
| `build_diagram` | Text-to-diagram: add many parts and wires to a sheet in one go, auto-layout, save |
| `get_diagram`, `add_sheet` | Read a project; add, copy, rename, move or delete sheets |
| `list_components`, `describe_component` | Browse the library and see each part's pins |
| `list_wire_colours`, `add_custom_colour` | Standard codes and your own colours |
| `set_colour_stock`, `colour_usage` | The colours you stock, and every job each colour does |
| `add_part`, `add_wire`, `update_part`, `update_wire`, `remove` | Edit a diagram |
| `define_component` | Make a custom component, including one traced from a picture, and save it to your library |
| `auto_layout` | Tidy the layout |
| `check_diagram` | Fuse vs cable size, current vs cable size, voltage drop, unconnected pins |
| `wire_list` | Wire list, parts list and cable totals |
| `export_svg` | Export an SVG with title block and colour key |

Every editing tool takes an optional `sheet` (number or name; sheet 1 when left out).
Wire ends are written `REF:PIN`, for example `F1:2` or `K1:87`. Colours accept names
(`brown`), Land Rover codes (`N`, `NR`), DIN codes (`BN/RD`), SAE codes (`BRN/RED`) or your custom colours.
