# Circuit trace and live test

Two tools help you follow a circuit through a drawing: the **trace**, which lights up everything connected to one wire, and the **live test**, which lets you operate switches and fuses to see what would run, and works out the volts and amps a meter should read.

## Tracing a circuit

A trace highlights one circuit: every wire joined to the one you pick, on every sheet.

To start a trace, do any of these:

- hold <kbd>Alt</kbd> and click a wire or a pin,
- select a wire and press <kbd>T</kbd>, or click **Trace** on the tool rail,
- click **Trace circuit** in a wire's Properties,
- click the **⤳** beside a pin in a part's Properties,
- click a row in the **Circuits** list.

While a trace is on:

- the traced wires are highlighted, and the sheet tabs mark the other sheets the circuit reaches,
- the Properties pane shows the circuit's name, how many wires and connections it has and on how many sheets, and lists its wires sheet by sheet. Click a wire in the list to go to it,
- the status bar says **Tracing a circuit across all sheets. Esc to clear.**

Press <kbd>Esc</kbd> to clear the trace.

### What counts as one circuit

A circuit, for the trace, is everything joined by wire with nothing in between that can break it. The trace follows wires through:

- splices, busbars, terminal strips and bulkhead grommets,
- mated connector pairs, cavity to cavity,
- off-sheet references and net labels with the same name, to other sheets,
- the same part drawn on several sheets.

It stops at anything that can switch or break the circuit, or that uses the power: switches, fuses, relays and loads. So tracing the feed to a lamp shows the wires from the switch to the lamp, not the battery side of the fuse. Trace the other side separately.

All earth points belong to one circuit, called **EARTH**.

### The circuit's name

LoomWright names a traced circuit from, in order of preference: the name of a net label or off-sheet link on it; the circuit names you gave its wires; a supply it starts from (such as `BAT1 +`). Otherwise it is numbered.

## The Circuits list

The **Circuits** tab in the Lists pane lists every circuit in the project: its name, how many wires and connections it has, which sheets it is on, and the pins it goes to. Click a row to trace it.

This list is a good way to check a drawing: a circuit you expected to be one piece that shows up as two usually means a missing wire or a mistyped link name.

## The live test

The live test treats every battery as live and lets you operate the switches and fuses, to see which wires would carry power and which loads would run.

Start it with **Tools › Live circuit test**, or the **Test** button on the tool rail. The sheet gets a green border, the status bar shows **LIVE TEST**, and you cannot edit the drawing until you stop.

![The live test on the example project](../../app/manual/img/live-test.png "The live test: switch S1 is on, so relay K1 has pulled in and the light bar H1 is lit. Powered wires glow, and each running load shows its volts and amps.")

### Operating parts

Click a part on the sheet to move it to its next position, or choose its position under **Controls** in the Properties pane. The parts you can operate, and their positions, are:

| Part | Positions |
| --- | --- |
| Blade fuse, Maxi / MIDI / ANL fuse, fusible link, circuit breaker | OK, Blown |
| Switch, push button (normally open), pressure and temperature switches | Open, Closed |
| Push button (normally closed) | Closed, Pressed (open) |
| Changeover switch | Position 1, Position 2 |
| Double-pole changeover | Position A, Position B |
| Illuminated rocker switch | Off, On |
| Rocker switch, 8 pin (Contura style) | Down, Off, Up |
| Rotary switch | Off, then each position |
| Ignition switch | 0 Off, I Accessory, II Ignition, III Start |
| Battery isolator | Off, On (starts On) |
| Door / pin switch | Door shut, Door open |
| Split charge relay (VSR) | Open, Combined |
| Flasher unit | Off, Flashing (on) (starts on) |
| Winch control box | Stop, Wind in, Wind out |
| Alternator | Engine off, Engine running |
| Solar panel | Dark, Sun |
| Push button, start (NO), Push button, stop (NC), Emergency stop | Released, Pressed |
| Isolator, three-pole; Circuit breaker, three-pole; Motor circuit breaker (MPCB) | On, Off |
| MCB, RCBO, RCD, main switch, fused connection unit | On, Off or tripped |
| Overload relay (thermal) | Not tripped, Tripped |

**Relays are not operated by hand.** A relay pulls in by itself when its coil has a feed on one side and an earth on the other, as a real one would. To test a relay circuit, operate the switch that feeds its coil. A **Contactor** works the same way.

A **Contact of a contactor or relay** drawn apart from its coil follows the **Contactor** with the same reference. It is not in **Controls**, and clicking it only tells you which coil it follows. Under it on the sheet, it shows **Coil on** or **Coil off**.

The live test works out each state from the start. It does not remember that a contactor was pulled in a moment ago. So a hold-in contact across a start button does not keep the contactor in once you set the button back to **Released**. To see a latching circuit running, leave the start button on **Pressed**.

Fuse boxes always pass power to every way; to test a blown fuse, use separate fuse parts.

### What you see

- **Powered wires glow**, and loads that have both a live feed and an earth are highlighted as working.
- **Working now**, in the Properties pane, counts the loads on, the relays pulled in and the live wires, and names the parts that are working.
- If a position connects a supply straight to earth, a **Short circuit** warning names the supply.
- Switches show their position under them on the sheet.
- Each running load with a current or wattage shows its volts and amps beside it, such as `12.3 V · 4.5 A`. See [Volts and amps](#volts-and-amps).

**Reset all** puts every part back to its starting position. **Stop test**, or <kbd>Esc</kbd>, ends the test.

### Volts and amps

While the test runs, LoomWright works out the voltage and current through the circuit, from the wire sizes and lengths and the load ratings. The figures are a guide to what a meter should read on a healthy circuit, not a measurement.

The badge beside each running load is green when the load loses 3% of its supply voltage or less, amber up to 10%, and red above 10%.

Under **Working now** the Properties pane adds:

- **Voltage at each load**: each running load and relay coil, with its volts, amps and the drop from the supply that feeds it. A load with no current or wattage says **no rating**. Click a load to go to it.
- **Fuses carrying current**: each fuse, or power module output, with its current, its rating and the current as a percentage of the rating. Over the rating is red, and over 80% is amber.
- **Supplies**: each battery, alternator, charger or power supply, with its volts, its current and what it is doing: supplying, charging, resting, running, off, at its current limit or not supplying.
- **Battery at rest, V**: the voltage of the battery with nothing running. Leave it blank for a charged battery: 12.6 V on a 12 V system, scaled for other system voltages.
- Notes, for example that a fuse would blow, that a load loses more than 10% of its supply voltage, or that some wires have no length, so their drop is not counted. If there is a short circuit, the figures show the fault current.

How LoomWright works the figures out:

- A battery is taken as 12.6 V at rest, scaled for the system voltage or for the battery's own **Volts**.
- A running alternator gives 14.2 V on a 12 V system, up to its rated amps.
- A solar panel in **Sun** gives up to its rated watts.
- A DC-DC charger switches on when its input, and its ignition sense if wired, is above 60% of the system voltage. It then gives 14.4 V on a 12 V system, up to its rated amps.
- Wires are copper at 20 °C, from their size and length. A wire with no length counts as no resistance.
- Fuses, switches, relay contacts, connector pairs and power module outputs each add a small contact resistance, as clean parts would.
- A load draws its rated current, or its wattage at the system voltage. An LED is treated as a diode. A relay coil draws about 0.15 A.

Set the **System voltage** in the drawing settings to match your supply. See [Sheet and drawing settings](05-projects-and-sheets.md#sheet-and-drawing-settings).

To find out why a load does not work as it should, click **Fault finding…** at the bottom of the pane. See [Fault finding](12-fault-finding.md).

> The live test works from the drawing. It does not model timing, heat or worn parts, so it cannot tell you that a relay is too slow or a joint is corroded. Its volts and amps are worked out, not measured. A real meter reading always wins.

### Mains and factory parts in the live test

The live test treats a 24 V power supply and a control transformer as supplies, so a 24 V or control transformer control circuit can be tested. Contactor coils, push buttons, emergency stops and overload trip contacts work as described above.

The three-phase power side is not modelled. Motors, indicator lamps, PLC cards, drives and safety relays do not light or run in the live test. The **Supply** part of a household project is not a supply in the live test, so household circuits do not come on.

## Using them together

A good way to check a new circuit:

1. Trace each wire you have added, to make sure it joins what you meant and nothing else.
2. Run the live test, operate the switch for the circuit, and check the right load comes on and nothing else does.
3. Look at the volts at the load and the current through its fuse.
4. Blow its fuse, and check the load goes off.
5. Open the **Checks** list and deal with anything new.
