# Compressed air planner

The compressed air planner helps you lay out a workshop or garage air system: the compressor, the receiver (air tank), air treatment, pipe runs, drops and the tools on them. From what you type in, it works out the air demand, the pressure at each tool, the air speed in each pipe, the receiver size, how hard the compressor works, the running cost, the cost of leaks and the water to drain. It then lists anything to look at.

Open it with **Tools › Compressed air planner…**. The systems you plan are saved in the project file, and every change can be undone.

> The planner is a basic tool. Its figures are planning estimates, made from published rules of thumb and the numbers you type in. They can be wrong. They do not show that a pressure system is safe, or that it meets any regulation, and no responsibility is accepted for their use. If the system is used at work, the Pressure Systems Safety Regulations 2000 apply: see [Pressure systems at work](#pressure-systems-at-work) and the [Disclaimer](28-disclaimer.md).

## Before you start

The first time you open the planner, it shows a short disclaimer. Choose **I understand** to carry on. LoomWright remembers this on your computer, so it does not ask again. If you close the box without choosing **I understand**, the planner closes.

A line along the top of the planner repeats the main points all the time. **Read the disclaimer** shows the full text again.

## The planner window

- **The header** has the system picker, **New system…**, **Rename**, **Delete**, the exports, **Undo**, **Redo**, **Help** (this chapter) and **Close**.
- **The left side** is where you edit the system, in sections: **System**, **Compressors**, **Receivers**, **Air treatment**, **Pipework**, and **Drops and tools**. A card with a problem has a red edge; a card with a warning has an amber edge.
- **The schematic** is drawn for you from the pipework. It is not to scale. Each pipe is labelled with its material, size and length, then its flow, air speed and pressure lost. Each drop shows its pressure, and each tool its air use and the pressure it gets. Red marks a problem and amber a warning. Click any item to edit it. Use **−**, **Fit** and **+**, or hold <kbd>Ctrl</kbd> and scroll, to zoom.
- **The results** under the schematic have five tabs: **Results**, **Checks**, **Pipes**, **Pressure at tools**, and **Leak test and calculators**. Click a row or a check to go to the item it is about.

## Systems

A project can hold several air systems, such as a garage and a separate paint booth. Pick one in the header.

**New system…** starts one of three ways:

- **Start a new system**: one piston compressor, a 100 litre receiver, one main pipe and one drop, all with typical figures you can change.
- **Home garage example**: a piston compressor, a 100 litre tank, an aluminium main and two drops with a sander and an impact wrench.
- **Workshop example**: a screw compressor, a 500 litre receiver, filters and a refrigerant dryer, a ring main and two branches with four drops.

**Rename** and **Delete** act on the system shown. Deleting can be undone.

## Laying out a system

Every field starts with a sensible typical figure. Replace them with the figures from your own equipment's data plates and manuals where you have them.

### System

| Field | What it does |
| --- | --- |
| Where it is used | **At work** or **At home (hobby)**. This changes the pressure systems notes. |
| Air quality needed | **General** (no dryer), **Dry** (dew point +3 °C, a refrigerant dryer) or **Very dry** (−40 °C, a desiccant dryer). |
| Electricity £/kWh | The price you pay, for the running costs. |
| Hours a year | How long the system is switched on in a year. |
| Room °C, Humidity % | The air the compressor draws in. They set how much water the system makes. |
| Altitude m | Height above sea level. Air is thinner higher up. |
| Leaks % | An allowance for leaks, as a share of the tools' air use. 10 % is typical of a well-run system. |
| Growth % | An allowance for tools you add later. |
| Tools at once % | How much of the tools' average use happens at the same time. For one person using one tool at a time, lower it. |

### Compressors

Choose the **Type**: **Piston**, **Screw, fixed speed (load/unload)** or **Screw, variable speed (VSD)**. Then give its **Air l/min**, and say whether **That figure is** free air delivered (FAD) or displacement.

Small piston compressors are often sold by displacement, the volume the piston sweeps. The air they actually deliver is usually only 60 to 70 % of that. When you choose displacement, the planner uses 65 % of your figure (an estimate). A piston compressor rated at more than about 140 l/min per kW probably shows displacement, and the planner says so.

**Motor kW** is used for the running costs. Leave it empty and a typical figure for the type is assumed. **Cut-in bar** and **Cut-out bar** are the pressures where the compressor starts and stops (or loads and unloads). The planner works from the lowest cut-in, the pressure you can always count on.

With more than one compressor, the planner adds their output. For running costs it assumes the first one takes the load and the next ones only help when needed.

### Receivers

Give each receiver its **Volume litres** and its **Rated PS bar**, the maximum allowable pressure on its data plate. Tick **Safety valve** and **Condensate drain** if it has them. Every receiver needs both. The card shows PS × V in bar·litres, which matters at work: see [Pressure systems at work](#pressure-systems-at-work).

### Air treatment

Add aftercoolers, water separators, filters and dryers with **Add air treatment…**, and put them in the order the air passes through them with the arrows. Give each its **Rated l/min** and its **Loss at rating bar** from the maker's data. The usual order is: compressor, aftercooler and separator, receiver, pre-filter, dryer, then the finer filters. Tick **Before the receiver** for parts that sit between the compressor and the receiver.

A desiccant dryer uses some of the dried air to regenerate itself. Its **Purge %** (typically 15 %) is added to the demand.

### Pipework

Pipes form a tree. The first pipe starts at the receiver (after the air treatment). Each card's **Branch** button adds a pipe that starts at the end of that pipe, and **Drop** adds a drop there. You can also change where a pipe starts with **Starts from**.

For each pipe, set:

- **Use**: main, branch or drop. It sets the air speed limit.
- **Ring main**: for a main that loops back to where it started, so air reaches each point two ways.
- **Material** and **Size**: aluminium push-fit, steel, copper, air hose, or PVC water pipe. The planner uses each size's internal diameter. Never use PVC water pipe for compressed air: it is only listed so the planner can warn about it.
- **Length m**, and under **Fittings** the elbows, bends, tees, valves and couplings. Each fitting adds an equivalent length of straight pipe.

### Drops and tools

A drop is a take-off from a pipe to where you plug in. For each drop, set:

- **On pipe** and **Taken off the** top, side or underside of the pipe. Take drops from the top, so water stays in the main. Tick **Drain leg** if the pipe carries on down past the take-off to a drain.
- **Outlets**: the number of couplings on the drop. Each outlet runs one tool at a time.
- **Filter-regulator (FRL)**, with its rated flow, its loss at that flow, the **Regulator bar** it is set to (leave it empty for wide open) and whether it has a **Lubricator**.
- The **Hose** size and length, the **Coupling** size, how many couplings are in the line, and **Safety coupling** if one is used.

Add tools with **Add a tool…**. The list groups common tools with typical air use. After you add one, you can change its **l/min running** (the air it uses while running), its **Use %** (the share of the time it runs), the pressure it **Needs bar**, and whether it **Runs for minutes** (sanders, grinders, blasting, spray guns) or is a **Spray gun**. For a **Pneumatic cylinder**, give its bore, rod, stroke, cycles a minute and pressure, and the planner works out its air use.

## How the figures are worked out

All flows are free air, in litres a minute (l/min), as compressor makers quote them. Pressures are in bar gauge.

### Air demand

Each tool's average use is its running air use × its **Use %**. The planner adds these up for all tools and multiplies by **Tools at once %**. Then it adds the leak and growth allowances, and any dryer purge. This is the **design demand**, which is compared with the compressor output.

The **Compressor running** figure is the average demand, with leaks but without growth, as a share of the compressor output. Piston compressors are usually built for 50 to 60 % running time. Above 60 % the planner warns you.

### Flow in each pipe

A drop's peak flow is its hungriest tools running flat out, one on each outlet. The flow in a pipe is the larger of:

- the design demand of every drop beyond it, and
- the biggest single drop beyond it running flat out.

This sizes pipes for the worst moment at one drop, not for every tool at once.

### Pressure drop and air speed

The pressure lost in a pipe uses the Atlas Copco formula for steel pipe:

`Δp = 450 × q^1.85 × l / (d^5 × p)`

where `Δp` is the loss in bar, `q` the flow in litres a second, `l` the length plus fittings in metres, `d` the internal diameter in mm, and `p` the absolute pressure at the start of the pipe in bar. The figures 450 and 1.85 are typical; smooth aluminium pipe will lose a little less. The formula is not meant for losses above about 1 bar. A ring main is worked out as two halves, each carrying half the flow over half the length.

Air speed is the flow, squeezed by the pressure, divided by the pipe's area. The guide figures used are:

| Pipe | Air speed | How firm |
| --- | --- | --- |
| Main | Below 9 m/s; 6 m/s is better, so water and dirt stay in the drain legs. | Published guidance (BCAS) |
| Branch | Below about 15 m/s | Typical |
| Drop | Below about 15 m/s | Typical |

Aim to lose no more than 0.1 bar from the receiver to the furthest drop (Atlas Copco), and no more than 10 % of the compressor pressure before the air reaches a tool.

### Pressure at each tool

From the pressure at the drop, the planner takes off:

- **The filter-regulator.** Its loss at its rated flow, scaled with the square of the actual flow. Then, if you set the regulator, no more than that setting.
- **The quick couplings.** A 1/4" coupling is taken to lose about 0.25 bar at 600 l/min, an estimate. A 3/8" coupling loses about one-sixth as much. A 1/2" coupling is scaled from the 3/8" one (an estimate). The loss goes with the square of the flow, and a safety coupling passes about 20 % less air.
- **The hose**, with the same formula as the pipes and a typical bore for each hose size.

The filter-regulator, couplings and hose together should lose no more than about 0.6 bar. Most air tools are rated at 6.3 bar at the tool. Each bar short costs about 25 to 30 % of a tool's output.

When a tool uses more air than the compressor delivers, the **Pressure at tools** tab shows how many seconds the receiver and pipework alone can keep it going.

### Receiver size

For a fixed speed or piston compressor, the planner works out the receiver needed so the compressor loads no more than once every 30 seconds (Atlas Copco):

`V = 0.25 × q × p1 × T0 / (fmax × Δp × T1)`

where `q` is the compressor output in litres a second, `p1` the air pressure at the intake, `T1` the intake temperature, `T0` the receiver temperature (taken as 20 °C warmer), `fmax` one cycle in 30 seconds and `Δp` the gap between cut-in and cut-out. The air in the pipework counts towards the volume you have. A variable speed compressor needs much less; use its maker's figure.

### Running cost and pressure setting

Each compressor's yearly electricity is its motor power × how loaded it is × **Hours a year**. A fixed speed screw compressor running unloaded still draws about a quarter of its full power (the published range is 15 to 30 %).

Every 1 bar of extra pressure costs about 7 % more energy (BCAS). The planner works out the highest pressure a tool needs at the compressor, adds 0.5 bar, and shows any setting above that and its cost. Lower the pressure in small steps, and check your tools still work well.

### Leaks

Leak cost is the leak allowance × the compressor's power per litre a second of air × the hours × your electricity price. Well-run systems lose under 10 % of their air to leaks. Poorly kept systems often lose 20 to 30 %.

### Water

The planner works out the water the incoming air holds at the room temperature and humidity, and how much of it stays in the air once it is compressed and cooled. Without a dryer, the air is taken to cool back to room temperature. With a dryer, it is cooled to the dryer's dew point. The difference ends up as liquid water, shown per 8-hour day. Fit drains wherever it collects.

## Tool figures

The tool list gives typical air use while each tool runs. They come from published tables and makers' data, and every entry says how firm it is:

- **typical**: a usual figure from published tables;
- **estimate**: where the sources only give an average at 25 % use, the running figure is four times that average;
- **maker's figure**: a figure for one named product.

Sanders vary widely between sources and makers. For anything that matters, use the figure from your own tool's manual. Machines, blast cabinets and other tools have no figure until you enter one.

## Checks

The **Checks** tab lists problems first, then warnings, then notes. Each one names the item and its rule. Click it to go to the item. A short list does not mean the system is safe.

| Rule | What it looks for |
| --- | --- |
| D1-PVC | PVC water pipe used for compressed air (a problem). |
| D1-RATING | Aluminium push-fit pipe on a compressor that cuts out above its typical 12.5 bar rating. |
| D1-VEL | Air speed above the limit for the pipe's use. |
| D1-DP-NETWORK | More than 0.1 bar lost from the receiver to a drop, or a pipe far too small for its flow. |
| D1-TAKEOFF | A drop taken off the underside of a pipe with no drain leg. |
| D1-TOOL-P | A tool getting less pressure than it needs. |
| D1-DP-TOTAL | More than 10 % of the compressor pressure lost before a tool. |
| D1-DROP | More than 0.6 bar lost in a drop's filter-regulator, couplings and hose. |
| D1-HOSE | A long or narrow hose, or 1/4" couplings on a tool using over about 400 l/min. |
| D2-UNDERSIZE | No compressor yet. |
| D2-BAND | A cut-out pressure that is not above the cut-in pressure. |
| D2-FAD | A displacement figure, or a figure that looks like one. |
| D2-POWER | No motor power given, so a typical figure is assumed. |
| D2-DUTY | A piston compressor running more than 60 % of the time. |
| D2-PRESSURE | A pressure setting more than 0.25 bar above what the tools need. |
| D2-INLET | A warm room. Every 5 °C cooler intake air saves about 1 % of the energy. |
| D3-RECEIVER | A receiver too small for the compressor, or no receiver. |
| D3-SAFETY | A receiver without a safety valve or condensate drain (a problem). |
| D3-RATING | A compressor that cuts out above a receiver's rated pressure (a problem), or no rated pressure entered. |
| D3-PSSR | Notes on the Pressure Systems Safety Regulations 2000, or on home use. |
| D4-DRYER | Dry air needed, for example for spray painting, without a suitable dryer. |
| D4-DRYER-SIZE | A dryer that cannot handle the compressor output. A refrigerant dryer's rating is corrected for your pressure and temperatures. |
| D4-SIZE | A filter or dryer with more flow through it than its rating. |
| D4-ORDER | Air treatment out of the usual order. |
| D4-DRAINS | How much water the system makes, and where to drain it. |
| D4-PAINT-LUBE | A lubricator on a drop with a spray gun (a problem). |
| D5-LEAK-ALLOW | A leak allowance above 10 %, with its yearly cost. |
| D6-DEMAND | Design demand above the compressor output (a problem). |
| D6-CONTINUOUS-TOOL | A tool that runs for minutes and uses more than the compressor delivers. |
| D6-FRL-CAPACITY | A filter-regulator rated below the drop's peak flow. |

## Leak test and calculators

The **Leak test and calculators** tab has four small tools. They use your system's figures and settings.

- **Load/unload test.** With every tool off, time how long the compressor runs on load and off load over a few cycles. Leakage is the time on load as a share of the whole cycle. **Use this figure** puts it into **Leaks %**.
- **Pressure decay test.** With every tool off, pump the system up, switch the compressor off, and time the fall in pressure. The planner works out the leak flow from the volume of the receivers and pipework.
- **One leak.** What a round hole of a given size leaks at a given pressure, and what it costs a year. A sharp-edged hole leaks about 40 % less.
- **Receiver for a short peak.** The local receiver that would cover a short burst of air on its own, such as a blow-off or a machine cycle. It ignores what the compressor adds during the burst, so it errs on the large side.

## Exporting

- **Export CSV** saves the summary, the pipework, the pressure at each tool and the checks, for a spreadsheet.
- **Export SVG** and **Export PDF** save the schematic with the results, the checks and the disclaimer under it.

Every export carries the disclaimer.

## Keys

| Key | What it does |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Undo. |
| <kbd>Ctrl</kbd>+<kbd>Y</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Redo. |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save the project. |
| <kbd>0</kbd> | Fit the schematic to the window. |
| <kbd>Ctrl</kbd>+scroll | Zoom the schematic. |
| <kbd>F1</kbd> | Open this chapter. |
| <kbd>Esc</kbd> | Leave a field, or close the planner. |

On a Mac, use <kbd>Cmd</kbd> in place of <kbd>Ctrl</kbd>.

## Pressure systems at work

If the system is used at work, the Pressure Systems Safety Regulations 2000 apply to it. In short:

- The user or owner must set safe operating limits and fit protective devices, such as safety valves, set correctly and kept working.
- For most receivers, a competent person must draw up a written scheme of examination before the system is first used, and the system must then be examined to it.
- The scheme and examinations are not needed while every vessel in the system is under 250 bar·litres (its rated pressure in bar × its volume in litres). A 25 litre receiver rated at 10 bar is already 250 bar·litres.

The planner works out PS × V for each receiver. When **Where it is used** is **At work**, it notes any receiver at or above 250 bar·litres. This is a note only. Whether the regulations apply, and what they need, is for you and a competent person to decide.

At home, follow the maker's instructions, keep the safety valve working, drain the receiver, and never go over its rated pressure.

Whatever the setting, use only pipe, fittings, hoses and vessels rated for the pressure and temperature, and never PVC water pipe. The HSE leaflet INDG261, *Pressure systems: a brief guide to safety*, is a free and short introduction. Have a competent person design, install and examine the system.

## Limits of the planner

- The formulas are rules of thumb for steady flow. They do not model surges, pressure waves, or a compressor catching up after a burst.
- Fittings, couplings, filters and dryers use typical or estimated losses. Real parts differ, and filters lose more as they clog.
- Tool air use varies a lot between makers and with wear. The figures in the list are typical, not your tool's.
- Running costs assume steady use over the year at the hours you give.
- The planner does not check wall thicknesses, supports, expansion, temperature ratings or the strength of any part.

See also the [Disclaimer](28-disclaimer.md).
