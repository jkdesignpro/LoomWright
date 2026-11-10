# Fuses and loads

The **Fuses & loads** tab in the Lists pane is a fuse and relay schedule with a load budget. For every fuse, fuse box way, relay and supply in the project it adds up what is downstream and compares it with the rating.

> These figures are estimates for planning, made from the numbers you type in. They are a worst case with everything switched on, and they ignore inrush current (motors and lamps draw far more for a moment when they start), cable heating and voltage drop. Choose fuses to protect the wire, using the cable and fuse makers' data.

## How LoomWright works out a load

A part's current comes from its fields:

- a **current** field with amps in it, such as the Generic load's **Current** of `5A`,
- or a **power** field in watts, divided by the system voltage. A lamp or light bar **Rating** of `55W` at 12 V is 4.6 A, and `2 × 60W` is read as 120 W, so 10 A.

Some parts are counted in a fixed way:

- a relay coil counts as 0.2 A,
- a DC-DC charger draws its rated output current plus 10% from its input.

Parts without a current or power field, such as motors, pumps, fans and the winch, count as 0 A. To include them, use a **Generic load** with its **Current** filled in, or give your own component a field called `amps` (such as `amps = 8A`) or `watts`.

Set the system voltage in the drawing settings; it is used for every conversion from watts.

## Fuses and breakers

The first table lists every fuse, circuit breaker, fusible link and fuse box way:

| Column | What it shows |
| --- | --- |
| Fuse | The fuse's reference, or the fuse box and way, such as `FB1 way 3`. |
| Rating A | The fuse rating, from its field. Fuse box ways take theirs, in order, from the box's **Ratings (comma list)**, such as `20,15,5,10,10,5`. |
| Load A | The total current of every load it feeds, with every switch on, or the largest **Current** you gave a wire leaving it, whichever is higher. |
| Use | The load as a share of the rating, with a bar. |
| Smallest wire | The smallest wire size on the fuse's output. The fuse should protect this wire. |
| Feeds | The loads downstream, each with its current. |
| Circuits | The circuit names of the wires it feeds. |

Each row is marked when the load is over the rating, or over 80% of it. A fuse with no rating is marked too. Fuses running near their rating blow on a warm day or when a motor starts; leave some margin.

The design checks also flag a fuse bigger than the guide figure for a wire it feeds. See [Design checks](10-design-checks.md#checks).

## Power distribution modules

A **Power distribution module (electronic)**, in **Protection**, is a solid-state fuse box: each output is switched and protected by the module instead of a fuse and relay. Its fields are:

| Field | What it does |
| --- | --- |
| Outputs | How many outputs, `OUT1`, `OUT2` and so on. |
| Inputs | How many control inputs, `IN1`, `IN2` and so on. |
| Output limits, amps (comma list) | The current limit of each output, in order, such as `15,15,15,15,10,10,5,5`. |
| What switches each output (IN1, IN2… or ALWAYS) | For each output in order, the input that turns it on, or `ALWAYS` for an output that is on whenever the module has a supply. |
| Inputs switch on when | **fed with + (active high)** or **earthed (active low)**. |
| CAN bus pins | Adds `CANH` and `CANL` pins. |

It also has a `BAT` pin for its main feed and a `GND` pin.

In the **Fuses and breakers** table each output is a row of its own, such as `PDM1 OUT1`, with its limit as the rating. In the [live test](11-trace-and-live-test.md), an output comes on when the module's `BAT` pin is live and its control input is live (or earthed, for active low inputs), or when it is set to `ALWAYS`.

## Relays

The second table lists each relay's contact rating (from its **Rating** field; 30 A if none is given), the current its contacts switch, and what they switch. A relay whose contacts carry more than their rating is flagged in the design checks.

## Supplies

The third table lists batteries, alternators, solar panels and DC-DC chargers, with the load on each:

- **Batteries**: their capacity, the load they feed, and **Hours at full load**. That figure assumes half the battery's capacity is usable, which suits a lead-acid battery you do not want to flatten; a lithium battery can give more.
- **Alternators**: the load against their rated output.
- **Solar panels**: their rating, worked out from the panel's power and the system voltage, against the load.
- **DC-DC chargers**: the load on their output against their rating.

## Exporting the schedule

**Reports › Export fuses and loads (CSV)** saves the three tables for a spreadsheet. The build pack includes them under **Fuses, relays and load budget**.

## Making the figures useful

- Give every fuse a rating, and every fuse box its list of ratings.
- Give every lamp and light its wattage, and every other load its current, from the maker's data.
- Give every wire its size, so the **Smallest wire** column and the fuse checks mean something.
- Remember the totals assume everything is on together. A fridge, a winch and the work lights are rarely all on at once; you can judge which loads really run together.
