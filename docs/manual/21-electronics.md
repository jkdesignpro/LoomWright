# Electronics projects

LoomWright can draw the wiring between boards, modules, sensors, supplies and connectors in an electronics project: an Arduino talking to a sensor, a Raspberry Pi switching a relay module, a converter feeding an ESP32. It checks that wiring for the usual slips and adds up what each supply has to give.

It is not a tool for designing circuit boards, and it does not try to be. Use a circuit board design program for that, and LoomWright for the wires between the boards.

> Every board pinout in LoomWright comes from the maker's own documentation, and each board says which document. Boards change between revisions, so check the pinout against the board you actually have before you wire it. The checks are guidance only: see the [Disclaimer](28-disclaimer.md).

## Starting an electronics project

With nothing selected, the Properties pane shows the sheet and the project. Under **Drawing**, set **Project type** to **Electronics project**. That does two things:

- **Starter circuits** in the Parts pane shows the electronics circuits.
- The electronics checks below run, and the wire list gains a **Signal** column.

**Mixed (show everything)** does both as well, alongside the vehicle and mains features.

## Boards

These boards are under **Electronics** in the Parts pane:

| Board | Pins | Pinout from |
| --- | --- | --- |
| Arduino UNO R3 | 32 | Arduino UNO R3 datasheet (A000066) and full pinout sheet |
| Arduino Nano | 30 | Arduino Nano datasheet (A000005) and full pinout sheet |
| Raspberry Pi 40-pin GPIO header | 40 | Raspberry Pi documentation, GPIO and the 40-pin header |
| ESP32-DevKitC V4 | 38 | Espressif ESP32-DevKitC V4 user guide |
| ESP32-S3-DevKitC-1 v1.1 | 44 | Espressif ESP32-S3-DevKitC-1 user guide |

Each board is drawn as a box with its header pins down the sides, in the order they are on the board. The name of each pin is written inside the box. Where the maker numbers the pins, the number is written small outside the box. Supply and ground pins are drawn thicker, and pins you should leave free are grey, such as the flash memory pins of the ESP32-DevKitC.

Point at a pin to see its full name, such as `GPIO2 / SDA, I2C data (pin 3)`.

### Pin names in the wire list

Each board uses one kind of name for its pins:

- **Arduino UNO R3 and Nano**: the names printed on the board, such as `D7`, `A4`, `5V` and `VIN`. A second or third pin with the same name gets `.2` or `.3`, so the grounds are `GND`, `GND.2` and `GND.3`. All of them are joined inside the board.
- **Raspberry Pi**: the physical pin number, 1 to 40. A wire to pin 11 shows as `A1:11`. When you add wires with the Claude add-on or a CSV import, `GPIO17`, `GP17` and `BCM17` find pin 11 too.
- **ESP32-DevKitC V4**: the names printed on the board, such as `IO25`, `TX` and `5V`.
- **ESP32-S3-DevKitC-1**: the numbers printed on the board, which are the GPIO numbers, such as `4` for GPIO4. `GPIO4` and `IO4` find it too.

### How much current a board draws

A board has a **Current it draws (mA)** field. LoomWright leaves it empty, because the makers do not give one figure for it: it depends on what the board is running. Fill it in from your own measurement or the maker's data, and the power budget below uses it.

### Boards that are not included

The Raspberry Pi Pico and Pico 2 are not included. Their pin order is published as a drawing, and the text of their datasheets names only a few pins by number, so the full order could not be checked against an official source. To use one, draw it with the [Component builder](09-component-builder.md), working from the pinout in Raspberry Pi's documentation.

## Supplies and modules

Also under **Electronics**:

- **DC supply (USB, adaptor or bench)**: a supply with a **Voltage**, the **Current it can give** and a word to show inside, such as `USB`. Its **−** is the 0 V of the circuit, so it counts as ground. LoomWright does not ask for a fuse after it, because these supplies usually limit their own current. If yours does not, add a fuse.
- **Buck / boost converter module**: a DC-DC converter with an **Output voltage** and an **Output current rating**. Its input − and output − are joined, as on most of these modules. Check yours.
- **Relay module (1 channel)**: a relay board with **VCC**, **GND** and **IN** on one side and the contacts **COM**, **NO** and **NC** on the other. In the live test it can be switched on and off.
- **I2C sensor / module**: a module with **VCC**, **GND**, **SDA** and **SCL**. **Pins on** puts them on the left or the right, to face the board.

## Ground

A board is treated as a load: it is fed on its supply pins (`5V`, `3V3`, `VIN` and so on) and returns through its **GND** pins. As in a vehicle drawing, a load needs a way back. Either wire GND to the − of a **DC supply**, or put an **Earth / ground** symbol on the 0 V line. Otherwise the checks say the board has no earth return.

All ground symbols are the same point, so two boards whose GND pins each go to a ground symbol share a ground.

## What a wire carries

Each wire can say what it carries in its **Signal** field: power, ground (0 V), digital, analogue, PWM, I2C SDA or SCL, SPI MOSI, MISO, SCK or CS, UART TX or RX, CAN H or L, RS-485 A or B, USB D+ or D−, 1-Wire, or shield.

The signal is shown in the **Signal** column of the wire list and its CSV export. It also helps the checks: a wire marked **I2C SDA** that ends on an SCL pin is reported, for example.

When you mark a UART wire, mark it from the side that sends. A wire from the TX pin of one board to the RX pin of another is **UART TX**.

## Electronics checks

These run with the other [Design checks](10-design-checks.md) in electronics and mixed projects. Each one only speaks up when the drawing shows the problem plainly.

### Errors

- **Supplies at different voltages joined**, such as a 12 V supply and a 5 V supply on one line.
- **A board's supply pin wired to a supply at another voltage**, such as a 5 V supply wired to the `3V3` pin of an ESP32.
- **A signal pin wired straight to a supply above the board's logic voltage**, such as 5 V on a Raspberry Pi GPIO pin. Raspberry Pi says its GPIO pins work at 3.3 V and are not 5 V tolerant.
- **CAN H wired to CAN L.**

### Checks

- **Two supply outputs joined**, such as two 5 V supplies. Feed each line from one supply.
- **A supply input outside the board's range**, such as 5 V on the `VIN` pin of an Arduino UNO R3, which takes 6 to 20 V.
- **A 5 V logic board wired to a 3.3 V logic board.** Use a level shifter.
- **TX wired to TX, or RX to RX.** Serial lines cross over: TX on one board goes to RX on the other.
- **SDA wired to SCL.** I2C lines go SDA to SDA and SCL to SCL.
- **A board pin driving a heavy load directly**: a motor, lamp, relay coil or other load wired straight to a pin. The Arduino boards give at most 20 mA a pin and the Raspberry Pi 16 mA, from the makers' data. Drive the load through a transistor, a MOSFET or a relay module. Espressif gives no fixed figure in the documents used, so ESP32 pins are not checked for this.
- **Two boards sharing a signal but not a ground.** A signal needs a return path: wire GND to GND.
- **A wire marked as one signal that ends on a pin for another**, such as a wire marked I2C SDA on an SCL pin, a wire marked ground on a supply pin, or a wire marked power on a ground pin.
- **Wires marked as different lines of a bus joined together**, such as an I2C SDA wire and an I2C SCL wire.
- **A wire marked power and a wire marked ground joined together.** That is a short, or one of the labels is wrong.

### Information

- **Two boards joined on their supply pins with no supply drawn.** If both are also plugged into USB, they feed each other. Espressif, for example, says to power its boards from one source only.

## Power budget

The **power** report lists each supply rail: every supply output that has something on it. For each rail it shows:

- the supply, its pin and its voltage,
- its rating in mA, where there is one: the **Current it can give** of a DC supply, the **Output current rating** of a converter, or the maker's figure for a board output, such as 50 mA for the `3V3` pin of an Arduino UNO R3,
- the load in mA, the share of the rating used, and **ok**, **close** (over 80%), **over** or **no rating**,
- what it feeds, with the mA of each,
- the parts with no current figure, which are not counted.

The figures come from each part's **Current it draws (mA)** field, or its current or wattage. A board passes on what its own outputs feed: if a sensor on an Arduino's `3V3` pin draws 10 mA, the supply feeding the Arduino gives those 10 mA as well. A converter takes its output power from its input, with 85% efficiency assumed.

The power report is the **Power rails** table in the PDF export, and the `power` report of the [Claude add-on](26-claude-add-on.md).

## Connector series

The **Connector (series)** part has these electronics series under **Series**. Ratings and wire sizes are given only where the maker's data was checked. Part numbers are there to help you find the right parts: check them with the maker before you order.

| Series | Ways | Rating and wire, from the maker |
| --- | --- | --- |
| JST XH (2.5 mm) | 1 to 16, 20 | 3 A (AWG 22), 250 V; AWG 30 to 22 |
| JST PH (2.0 mm) | 2 to 16 | 2 A (AWG 24), 100 V; AWG 32 to 24 |
| JST SH (1.0 mm) | 2 to 16, 20 | 1 A (AWG 28), 50 V; AWG 32 to 28 |
| JST RCY (2-way) | 2 | 3 A (AWG 22), 250 V; AWG 28 to 22 |
| Dupont-style 2.54 mm housing | any | Not one maker's series, so no rating |
| Molex KK 254 (2.54 mm) | 1 to 36 | Up to 4.0 A; AWG 30 to 22 |
| Molex Micro-Fit 3.0 (3.0 mm) | 2 to 12, then even to 24 | Up to 10.5 A, 600 V; AWG 30 to 18 |
| Molex Mini-Fit Jr. (4.2 mm) | any | Mini-Fit family up to 9.0 A, 600 V |
| XT30, XT60, XT90 | 2 | Not given: ratings vary between versions and makers |
| DC barrel 5.5 × 2.1 mm | 2 | Cavities `C` (centre pin) and `S` (sleeve) |
| USB-C (power only) | 2 | Cavities `VBUS` and `GND` |
| M8 sensor connector | 3, 4 | 3-pin uses cavities 1, 3 and 4 |
| M12 A-coded sensor connector | 4, 5 | |
| Screw terminal, 5.0 mm or 3.5 mm pitch | any | Not given: check with the maker |

Some series name their cavities with the colour of the core in a standard sensor cable:

- **M8, 3-pin**: 1 brown (+ supply), 3 blue (0 V), 4 black (signal). These are the colours Beckhoff gives for its sensor cables.
- **M12 A-coded, 5-pin**: 1 brown, 2 white, 3 blue, 4 black, 5 grey, from Baumer's cable data. Some makers use green-yellow for the fifth core.

Cable colours can differ from maker to maker, so check the cable you have. No colours are given for the 4-pin versions.

A centre-positive barrel plug is common but not universal, so check the polarity mark on your adaptor. 5.08 mm and 3.81 mm screw terminals are different sizes from 5.0 mm and 3.5 mm ones, so check which you have.

## Starter circuits

With the project type set to **Electronics project**, **Starter circuits** in the Parts pane has:

- **I2C sensor on an Arduino**: an I2C module on an Arduino UNO R3, powered from 5V and GND, with SDA on A4 and SCL on A5. Check that your module can run at 5 V.
- **Relay module on a Raspberry Pi**: a relay module switched by GPIO23 (pin 16), with its own 5 V supply. Check that the module switches on a 3.3 V input and does not pull its input up to 5 V.
- **12 V to 5 V buck feeding an ESP32**: a fused 12 V battery feeding a 5 V buck converter, which powers an ESP32-DevKitC on its 5V pin. Do not plug in USB while it runs from the converter.

Drag one onto the sheet and change it to suit. The wires are laid out tidily when it is placed.
