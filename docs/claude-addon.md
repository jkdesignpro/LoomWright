# Claude add-on (optional)

Loomwright works completely on its own. If you use Claude, this add-on lets you describe a
circuit in plain English and have Claude draw it, check it and edit it for you, for example:

> Add a pair of LED spot lamps on the aux battery. 20 A fuse from the fuse box, a 30 A relay,
> an illuminated rocker switch on the dash fed from ignition, brown/red feed and purple/white to
> the lamps, 2.5 mm², about 3.5 m run. Use Land Rover colour codes.

The add-on is a small [MCP](https://modelcontextprotocol.io) server in the `mcp/` folder. It reads
and writes the same `.loom` files as the app. If the file is open in the Loomwright desktop app,
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
      "env": { "LOOMWRIGHT_DIR": "C:/Users/you/Documents/Loomwright" }
    }
  }
}
```

On a Mac the paths look like `/Users/you/loomwright/mcp/server.js`. Restart Claude Desktop.

### Claude Code

```sh
claude mcp add loomwright -- node /path/to/loomwright/mcp/server.js
```

`LOOMWRIGHT_DIR` is where diagrams given as a plain file name are saved. It defaults to
`Documents/Loomwright` in your home folder. Full paths work too.

## What Claude can do

| Tool | Purpose |
| --- | --- |
| `build_diagram` | Text-to-diagram: add many parts and wires in one go, auto-layout, save |
| `list_components`, `describe_component` | Browse the library and see each part's pins |
| `list_wire_colours`, `add_custom_colour` | Standard codes and your own colours |
| `add_part`, `add_wire`, `update_part`, `update_wire`, `remove` | Edit a diagram |
| `define_component` | Make a custom component (for example a specific controller) |
| `auto_layout` | Tidy the layout |
| `check_diagram` | Fuse vs cable size, current vs cable size, voltage drop, unconnected pins |
| `wire_list` | Wire list, parts list and cable totals |
| `export_svg` | Export an SVG with title block and colour key |

Wire ends are written `REF:PIN`, for example `F1:2` or `K1:87`. Colours accept names
(`brown`), Land Rover codes (`N`, `NR`), DIN codes (`BN/RD`), SAE codes (`BRN/RED`) or your custom colours.
