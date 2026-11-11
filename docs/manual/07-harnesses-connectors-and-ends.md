# Harnesses, connectors and wire ends

A drawing shows what connects to what. To build the loom you also need to know which bundle each wire runs in, what connector it goes into, and how each end is finished. This chapter covers harnesses, connectors, terminals and multicore cables.

## Harnesses

A **harness** is one bundle of wires that is made up on the bench and fitted as a unit, such as the engine bay harness, the dash harness or the rear body harness.

Give each wire a harness in its Properties, under **Identity**. Pick one from the list or type a new name. LoomWright then:

- makes a separate cut list for each harness,
- lays each harness out on its own formboard (see [Harness formboard](16-harness-formboard.md)),
- shows in the **Colour usage** list which colours are used for different jobs inside one harness,
- can export one harness at a time for WireViz.

The **Harnesses** section of the Project pane lists every harness with the number of wires in it:

- **Add harness** adds one. Type its name in the box.
- Edit a name in the list to rename the harness. Every wire in it, and its formboard layout, follow the new name.
- The formboard button beside a harness opens its formboard.
- The remove button deletes the harness from the list. Its wires are left with no harness; they are not deleted.

## Connectors

The library has three kinds of connector, all under **Wiring & connectors**:

- **Connector (series)** is a real connector from a named range, with the right number of ways, the housing part number and the terminals that go in it. Use this one for anything you will buy.
- **Inline connector** draws both halves of a generic connector with numbered cavities, for a quick drawing.
- **Connector (one side)** draws one half of a generic connector.

**Bulkhead / grommet** is also in that category, for where a harness passes through a panel.

### Choosing the series and size

Select a **Connector (series)** and set its fields:

- **Series**: the connector range. See the table below.
- **Ways**: how many cavities. LoomWright rounds it to the nearest size the range is made in, such as 2, 3, 4, 6, 8 or 12 for Deutsch DT.
- **Side**: **Plug (sockets)** or **Receptacle (pins)**. This decides which terminals the cavities take.
- **Housing part no.**: filled in for the ranges where LoomWright knows the number, such as `DT06-4S`. Type your own to override it.
- **Mates with (reference)**: the reference of the other half, such as `X2`.

Under the fields, a note sums up the series: the current per contact, the wire sizes it takes, whether it is sealed, the housing and wedge lock part numbers and the terminal it uses.

| Series | Ways | Rating and wire sizes | Sealed |
| --- | --- | --- | --- |
| Deutsch DT | 2, 3, 4, 6, 8, 12 | 13 A per contact, 0.5–2.0 mm² | Yes |
| Deutsch DTM | 2, 3, 4, 6, 8, 12 | 7.5 A per contact, 0.35–1.5 mm² | Yes |
| Deutsch DTP | 2, 4 | 25 A per contact, 2.0–6.0 mm² | Yes |
| TE Superseal 1.5 | 1 to 6 | 14 A, 0.5–1.5 mm² | Yes |
| TE Econoseal J Mark II | 1, 2, 3, 4, 6, 8, 10, 12 | 20 A, 0.5–2.0 mm² | Yes |
| Aptiv Metri-Pack 150 | 1 to 6 | 14 A, 0.35–0.8 mm² | Yes |
| Aptiv Metri-Pack 280 | 1, 2, 3, 4, 6 | 30 A, 0.8–3.0 mm² | Yes |
| Bullet 4.7 mm (classic Land Rover) | 1 to 4 | 15 A, 0.5–2.0 mm² | No |
| Spade 6.3 mm (Lucar) | 1 to 4 | 20 A | No |
| Anderson SB50 | 2 | 50 A | No |
| Anderson SB120 | 2 | 120 A | No |
| Anderson SB175 | 2 | 175 A | No |
| Anderson Powerpole | 1 to 4 | 30 A or 45 A | No |
| Generic connector | Any | – | – |

> The part numbers, ratings and wire ranges LoomWright shows are a guide to get you started. Check every part number against the maker's current catalogue before you order, and use the maker's ratings, not LoomWright's.

### Mating pairs

Draw both halves of a connection, for example plug `X1` on the dash side and receptacle `X2` on the rear body side, and set **Mates with** on one to the reference of the other. LoomWright then joins cavity 1 of one to cavity 1 of the other, cavity 2 to cavity 2, and so on. Circuits trace straight through the pair, and the live test and checks treat it as connected.

The two halves can be on different sheets.

### Connector tables

The **Connectors** tab in the Lists pane, and the build pack, list every connector cavity by cavity: the wire in it, its colour code and size, its circuit, where the wire goes, the terminal and the seal.

If you have not chosen a terminal for a wire end in a series connector, the table shows the terminal the series uses (pins in a receptacle, sockets in a plug), and a wire seal for a sealed series. Empty cavities in a sealed connector need cavity plugs; the build pack counts them.

## Wire ends

Each wire has two ends. **End A** is where you started drawing it, **End B** where you finished; the heading of each section names the pin, such as **End A: BAT1:+**. **Swap ends** at the bottom of the wire's Properties exchanges them.

For each end you can set:

- **Terminal**: what is crimped or soldered on. The list has bare and tinned ends, bootlace ferrules, soldered joints and butt splices; ring terminals from M4 to M10 in the red, blue and yellow insulated sizes; tube lugs from 10 to 70 mm²; male and female spade terminals (2.8, 4.8 and 6.3 mm); 4.7 mm bullets; and the contacts for the Deutsch, Superseal, Metri-Pack, Econoseal and Anderson ranges.
- **Fitting**: **Crimp**, **Crimp and solder**, **Solder**, **Screw terminal** or **Ferrule**.
- **Strip (mm)**: how much insulation to strip.
- **Seal**: **Wire seal**, **Cavity plug** or **Gel / grease**.
- **Heat shrink**: free text, such as `6 mm adhesive, 25 mm`.

Terminals marked **✕ size** in the list are not made for this wire's size. If you choose one anyway, the design checks point it out. For example, a red ring terminal takes 0.5–1.5 mm², so it is marked on a 2.5 mm² wire.

The ends appear in the cut list (one column for each end), in the connector tables and in the build pack, so whoever makes the loom knows what goes on each end.

## Multicore and screened cables

Some wires run together inside one sheath: a 4-core trailer cable, a twin-and-earth feed, or a screened twisted pair for a sensor. LoomWright calls that a **cable**.

To set one up:

1. Open **Tools › Cables (multicore, screened)**, or **Cables…** in the Project pane.
2. **Add cable**, then give it a name (such as `C1` or `Trailer`), a **Type** (**Single cores**, **Multicore (sheathed)**, **Twisted pair**, **Screened / shielded** or **Twisted and screened**), the number of **Cores** and a **Part number** if you have one.
3. On each wire that is a core of it, choose the cable under **Cable › In cable** in the wire's Properties.

A quicker way: select the wires first, then open **Cables** and use **New cable from the selected wires**.

The dialog shows how many cores each cable has in use and which wires they are. The cable's name is added to the labels of its wires in square brackets, such as `W31 B 0.75mm² [C1]`. The cut list, the build pack and the WireViz export show the cable too.
