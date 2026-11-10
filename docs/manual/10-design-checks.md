# Design checks

As you draw, LoomWright checks the project for common mistakes: a fuse too big for the wire it protects, a wire carrying more than its size suits, a load with no earth, a supply wired straight to earth. The checks run all the time and cover every sheet.

> The checks are rules of thumb. They catch slips, but they cannot prove a design is safe. Wire sizes and fuse ratings in particular depend on the cable, how it is bundled and routed, how hot it gets and how long the run is. Always check your cable maker's and fuse maker's data, and fuse every circuit to protect its wire. See the [Disclaimer](28-disclaimer.md).

## Where to see them

- The **status bar** says **Checks passed**, or how many checks need a look. Click it to open the list.
- The **Checks** tab in the Lists pane lists every finding, with its level.
- **Tools › Run design checks**, or the **Check** button on the tool rail, opens the list and says how many there are.
- With nothing selected, the Properties pane says how many findings are on the sheet you are looking at.

Click a finding in the list to go to the wire or part it is about.

Household and factory projects have their own checks as well. They are described in [Household wiring](18-household-wiring.md#the-household-checks) and [Factory, workshop and control panels](19-factory-and-control-panels.md#the-factory-checks).

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
- **CAN H and CAN L swapped** at a device on a CAN bus.

### Checks

- **Voltage drop over 3%** of the system voltage on a wire, from its length, size and current. Consider a heavier size.
- **Current above the guide figure** for the wire's size. See [Wire size](04-wires-and-colours.md#wire-size) for the guide figures.
- **A fuse bigger than the guide figure for a wire it feeds.** A fuse protects the wire after it; if the fuse is larger than the wire can carry, the wire can overheat before the fuse blows.
- **A fuse or relay with more load than its rating**, from the fuse schedule. See [Fuses and loads](13-fuses-and-loads.md).
- **A load fed from a supply with no fuse in between.**
- **A load with no earth return.**
- **A wire size outside what its terminal takes**, for example 2.5 mm² wire in a terminal for 0.5–1.5 mm².
- **The same reference used for different kinds of part** on different sheets, such as `F1` as a fuse on one sheet and a relay on another.
- **A wire carrying more than it can once heat and bundling are allowed for.** See [Heat and bundling](04-wires-and-colours.md#heat-and-bundling).
- **A bundle too big for its grommet or bulkhead hole**, on a harness formboard. See [Grommets and bulkhead holes](16-harness-formboard.md#grommets-and-bulkhead-holes).
- **A CAN bus without exactly two terminating resistors.** It needs one at each end, which reads about 60 Ω between H and L with the power off.
- **A CAN stub longer than about 0.3 m** to a device that is not a terminated end.

### Information

- **A part with no wires connected.**
- **A pin left unconnected** on a part that normally has every pin used. Parts that often have spare pins, such as fuse boxes, connectors, busbars, terminal strips, modules, ICs, rotary and 8-pin rocker switches and DC-DC chargers, are not reported pin by pin.
- **A circuit using more than one colour.** That is fine across a connector, where the colour may change; otherwise it is usual to keep one colour per circuit.
- **A colour used for different circuits in one harness.** Tell the wires apart by wire number or a sleeve.
- **A grommet hole more than 80% full.** Leave room for sleeving and a spare wire.
- **CAN bus wires not in a twisted pair cable.** CAN H and L should be twisted together.

## CAN bus checks

LoomWright finds a CAN bus from the pin names. A device with a pin called `CANH` (or `CAN_H`, `CAN-H`, `CANHI`, `CANHIGH`) and a pin called `CANL` (or the same forms) is on the bus. Devices joined by their CAN pins are one bus.

A terminating resistor counts when it is a **CAN bus terminator (120 Ω)** part, or a device with a field called `term` or `terminated` set to `yes`, `on` or `120`.

## Household and factory projects

In projects of type **Household** or **Factory, workshop and control panels**, five of the vehicle checks are left out: voltage drop over 3%, current above the guide figure, a fuse bigger than the guide figure, a load fed with no fuse in between, and a load with no earth return. Mains cables are checked with the mains rules instead. **Mixed** projects keep every check.

In these projects the **Checks** tab starts with a note: the mains checks are guidance from selected rules of BS 7671 and BS EN 60204-1. They are not a design, test or certificate, and passing them does not mean the work meets the regulations. A qualified electrician must design, test and certify the work.

## Things the checks cannot know

The checks only know what is on the drawing. They do not know:

- the real current of a load unless you give it a current or wattage,
- the length of a wire unless you fill it in,
- how tightly a loom is bundled, unless you lay it out on the formboard,
- how hot it really runs, or the cable's real rating,
- whether a part is fitted the right way round, or a terminal crimped well.

A project with no findings is a good sign, not a guarantee. Test the finished loom with a meter, a fused supply and care before you connect it to a battery.
