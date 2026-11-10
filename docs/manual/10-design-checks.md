# Design checks

As you draw, LoomWright checks the project for common mistakes: a fuse too big for the wire it protects, a wire carrying more than its size suits, a load with no earth, a supply wired straight to earth. The checks run all the time and cover every sheet.

> The checks are rules of thumb. They catch slips, but they cannot prove a design is safe. Wire sizes and fuse ratings in particular depend on the cable, how it is bundled and routed, how hot it gets and how long the run is. Always check your cable maker's and fuse maker's data, and fuse every circuit to protect its wire. See the [Disclaimer](23-disclaimer.md).

## Where to see them

- The **status bar** says **Checks passed**, or how many checks need a look. Click it to open the list.
- The **Checks** tab in the Lists pane lists every finding, with its level.
- **Tools › Run design checks**, or the **Check** button on the tool rail, opens the list and says how many there are.
- With nothing selected, the Properties pane says how many findings are on the sheet you are looking at.

Click a finding in the list to go to the wire or part it is about.

## Levels

| Level | Meaning |
| --- | --- |
| error | Something is wrong and will not work as drawn, or is dangerous. |
| check | Probably a mistake, or a figure outside the usual guide. Look at it and decide. |
| info | Worth knowing, but often deliberate. Not counted in the status bar. |

## What is checked

### Errors

- **A wire connected to a pin that no longer exists**, for example after a connector was made smaller or a custom component lost a pin.
- **A wire that starts and ends on the same pin.**
- **A component type missing from the library**, usually a custom component from another computer that the project file did not carry.
- **A reference used twice on one sheet.** Give each part its own reference. (The same reference on different sheets means the same part drawn twice; see [The same part on several sheets](05-projects-and-sheets.md#the-same-part-on-several-sheets).)
- **A supply connected straight to earth**: a battery's positive, or another supply, with nothing between it and earth. That is a short circuit.

### Checks

- **Voltage drop over 3%** of the system voltage on a wire, from its length, size and current. Consider a heavier size.
- **Current above the guide figure** for the wire's size. See [Wire size](04-wires-and-colours.md#wire-size) for the guide figures.
- **A fuse bigger than the guide figure for a wire it feeds.** A fuse protects the wire after it; if the fuse is larger than the wire can carry, the wire can overheat before the fuse blows.
- **A fuse or relay with more load than its rating**, from the fuse schedule. See [Fuses and loads](12-fuses-and-loads.md).
- **A load fed from a supply with no fuse in between.**
- **A load with no earth return.**
- **A wire size outside what its terminal takes**, for example 2.5 mm² wire in a terminal for 0.5–1.5 mm².
- **The same reference used for different kinds of part** on different sheets, such as `F1` as a fuse on one sheet and a relay on another.

### Information

- **A part with no wires connected.**
- **A pin left unconnected** on a part that normally has every pin used. Parts that often have spare pins, such as fuse boxes, connectors, busbars, terminal strips, modules, ICs, rotary and 8-pin rocker switches and DC-DC chargers, are not reported pin by pin.
- **A circuit using more than one colour.** That is fine across a connector, where the colour may change; otherwise it is usual to keep one colour per circuit.
- **A colour used for different circuits in one harness.** Tell the wires apart by wire number or a sleeve.

## Things the checks cannot know

The checks only know what is on the drawing. They do not know:

- the real current of a load unless you give it a current or wattage,
- the length of a wire unless you fill it in,
- how tightly a loom is bundled, how hot it runs, or the cable's real rating,
- whether a part is fitted the right way round, or a terminal crimped well.

A project with no findings is a good sign, not a guarantee. Test the finished loom with a meter, a fused supply and care before you connect it to a battery.
