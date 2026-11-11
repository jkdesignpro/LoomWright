/*
 * LoomWright electronics: development boards drawn with their header pins, small modules
 * and supplies, electronics connector series, a signal type for each wire, checks for
 * common wiring mistakes between boards, and a power budget for each supply rail.
 * It is for wiring between boards, modules and connectors, not for designing circuit boards.
 *
 * Every board pinout comes from the maker's own documentation; the source is given next to
 * each board. Check it against the revision of the board you have.
 *
 * Extends window.Loom; needs loom-core.js, loom-data.js, loom-nets.js, loom-reports.js and loom-templates.js first.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./loom-data.js'); require('./loom-nets.js'); require('./loom-reports.js'); require('./loom-templates.js'); module.exports = factory(require('./loom-core.js')); }
  else factory(root.Loom);
})(typeof self !== 'undefined' ? self : this, function (Loom) {
  'use strict';
  const { L, R, T } = Loom.shapes;
  const lib = Loom.LIBRARY;
  const projectOf = (d) => (d && d.project) || d;
  const key = (sheet, partId, pin) => `${sheet.id}|${partId}|${pin}`;
  const ceil20 = (x) => Math.ceil(x / 20) * 20;
  const GREY = '#8a918c';

  /* ---------------- Numbers from text ---------------- */
  // '5V' → 5, '3V3' → 3.3, '3.3 V' → 3.3, '12' → 12
  function volts(s) {
    const t = String(s == null ? '' : s).trim(), m = /^(\d+)V(\d+)$/i.exec(t);
    if (m) return parseFloat(m[1] + '.' + m[2]);
    const n = /(\d+(?:\.\d+)?)/.exec(t);
    return n ? parseFloat(n[1]) : null;
  }
  // a current in amps ('3A', '0.5') or milliamps ('500mA') → milliamps
  function mAof(s) {
    const m = /(\d+(?:\.\d+)?)\s*(mA|A)?/i.exec(String(s == null ? '' : s).trim());
    if (!m) return null;
    return /^ma$/i.test(m[2] || '') ? parseFloat(m[1]) : parseFloat(m[1]) * 1000;
  }
  // a field labelled in milliamps: a bare number is mA, '0.2A' is amps
  function mAfield(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return null;
    return /\d\s*A$/i.test(t) && !/mA$/i.test(t) ? mAof(t) : (parseFloat(t) >= 0 ? parseFloat(t) : null);
  }
  // output voltage of a regulator from its part number: 7805 → 5, LM1117-3.3 → 3.3, '3V3' → 3.3
  function regulatorVolts(s) {
    const t = String(s || '');
    let m = /78[LM]?(\d\d)/i.exec(t);
    if (m) return m[1] === '33' ? 3.3 : parseInt(m[1], 10);
    m = /(\d)V(\d)/i.exec(t);
    if (m) return parseFloat(m[1] + '.' + m[2]);
    m = /(\d+(?:\.\d+)?)\s*V\b/i.exec(t) || /-(\d+(?:\.\d+)?)$/.exec(t);
    return m ? parseFloat(m[1]) : null;
  }
  const near = (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.1;

  /* ---------------- Boards ---------------- */
  /* Header pin helpers. Each pin keeps its role:
     k: 'io' (signal), 'pwr' (supply), 'gnd', 'ctl' (reset or enable), 'ref' (reference), 'nc' (not connected).
     v: volts of a supply pin; dir: 'out' (the board supplies it), 'in' (the board is fed here) or 'both'.
     mA: the maker's current limit for an output pin. fn: a bus role (uart_tx, i2c_sda, spi_sck…).
     a: other names the pin is known by. num: the physical pin number drawn outside the board. */
  const io = (id, text, n, o = {}) => ({ id, text, n, k: 'io', ...o });
  const pw = (id, text, n, v, dir, o = {}) => ({ id, text, n, k: 'pwr', v, dir, ...o });
  const gnd = (id, n, o = {}) => ({ id, text: 'GND', n, k: 'gnd', ...o });
  const ctl = (id, text, n, o = {}) => ({ id, text, n, k: 'ctl', ...o });
  const ref = (id, text, n, o = {}) => ({ id, text, n, k: 'ref', ...o });
  const nc = (id, n, o = {}) => ({ id, text: 'NC', n, k: 'nc', ...o });
  const pairsOf = (groups) => groups.flatMap((g) => g.slice(1).map((x) => [g[0], x]));
  const mAprops = (p) => { const m = mAfield(p.mA); return { mAshown: m != null ? `${m} mA` : '', amps: m != null ? `${m / 1000}A` : '' }; };

  /* A board drawn as a rectangle, header pins down each side in their physical order (null leaves a gap). */
  function defBoard(id, o) {
    const rows = Math.max(o.left.length, o.right.length), h = 40 + rows * 20;
    const len = (list) => Math.max(0, ...list.filter(Boolean).map((p) => String(p.text).length));
    const w = Math.max(120, ceil20(48 + (len(o.left) + len(o.right)) * 4.4), ceil20(o.title.length * 5.6 + 40), o.line2 ? ceil20(o.line2.length * 4.4 + 40) : 0);
    const shapes = [R(10, 0, w - 20, h, { rx: 4 }), T(w / 2, 17, o.title, { size: 9, weight: 700 })];
    if (o.line2) shapes.push(T(w / 2, 29, o.line2, { size: 7, color: '#4a524d' }));
    const pins = [];
    const side = (list, right) => list.forEach((q, i) => {
      if (!q) return;
      const y = 40 + i * 20, heavy = q.k === 'pwr' || q.k === 'gnd';
      shapes.push(right ? L(w - 10, y, w, y, { w: heavy ? 3 : 2 }) : L(0, y, 10, y, { w: heavy ? 3 : 2 }));
      shapes.push(T(right ? w - 14 : 14, y + 3, q.text, { size: 7, anchor: right ? 'end' : 'start', weight: heavy ? 700 : 400, ...(q.k === 'nc' || q.avoid ? { color: GREY } : {}) }));
      if (q.num != null) shapes.push(T(right ? w - 5 : 5, y - 3, String(q.num), { size: 5.5 }));
      pins.push({ ...q, id: String(q.id), x: right ? w : 0, y });
    });
    side(o.left, false);
    side(o.right, true);
    lib[id] = {
      id, name: o.name, cat: 'Electronics', prefix: 'A', w, h, partial: true, tags: o.tags,
      note: `Pinout from ${o.maker} documentation; check against your board's revision.`, src: o.src,
      board: { maker: o.maker, logic: o.logic, gpioMaxmA: o.gpioMaxmA || null, limitText: o.limitText || '', pairs: pairsOf(o.links || []) },
      props: [{ k: 'mA', l: 'Current it draws (mA)', d: '' }], sub: '{mAshown}', derive: mAprops,
      pins, shapes,
    };
  }

  /* Arduino UNO R3 (A000066).
     Header order and functions: datasheet tables JANALOG and JDIGITAL,
       https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf
     Current limits, VIN range and PWM pins: full pinout sheet,
       https://docs.arduino.cc/resources/pinouts/A000066-full-pinout.pdf
       ("MAXIMUM current per I/O pin is 20mA", "MAXIMUM current per +3.3V pin is 50mA", "VIN 6-20V input to the board").
     Drawn with the USB socket at the top: JANALOG pins 1 to 14 down the left, JDIGITAL pins 18 to 1 down the right. */
  defBoard('arduino_uno_r3', {
    name: 'Arduino UNO R3', title: 'Arduino UNO R3', maker: 'Arduino', logic: 5, gpioMaxmA: 20,
    src: 'https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf', tags: 'arduino uno r3 atmega328p board microcontroller',
    left: [
      nc('NC', 'NC, not connected (JANALOG pin 1)'),
      ref('IOREF', 'IOREF', 'IOREF, logic voltage reference, joined to 5V (JANALOG pin 2)', { v: 5 }),
      ctl('RESET', 'RESET', 'RESET (JANALOG pin 3)'),
      pw('3V3', '3V3', '3V3, 3.3 V output, 50 mA at most (JANALOG pin 4)', 3.3, 'out', { mA: 50 }),
      pw('5V', '5V', '5V supply rail (JANALOG pin 5)', 5, 'both'),
      gnd('GND', 'GND (JANALOG pin 6)'),
      gnd('GND.2', 'GND (JANALOG pin 7)'),
      pw('VIN', 'VIN', 'VIN, supply input 6–20 V (JANALOG pin 8)', null, 'in', { vmin: 6, vmax: 20 }),
      null,
      io('A0', 'A0', 'A0, analogue input / GPIO (JANALOG pin 9)'),
      io('A1', 'A1', 'A1, analogue input / GPIO (JANALOG pin 10)'),
      io('A2', 'A2', 'A2, analogue input / GPIO (JANALOG pin 11)'),
      io('A3', 'A3', 'A3, analogue input / GPIO (JANALOG pin 12)'),
      io('A4', 'A4 SDA', 'A4 / SDA, I2C data (JANALOG pin 13)', { fn: 'i2c_sda' }),
      io('A5', 'A5 SCL', 'A5 / SCL, I2C clock (JANALOG pin 14)', { fn: 'i2c_scl' }),
    ],
    right: [
      io('SCL', 'SCL', 'SCL, I2C clock, same as A5 (JDIGITAL pin 18)', { fn: 'i2c_scl' }),
      io('SDA', 'SDA', 'SDA, I2C data, same as A4 (JDIGITAL pin 17)', { fn: 'i2c_sda' }),
      ref('AREF', 'AREF', 'AREF, analogue reference (JDIGITAL pin 16)'),
      gnd('GND.3', 'GND (JDIGITAL pin 15)'),
      io('D13', 'D13 SCK', 'D13 / SCK, SPI clock (JDIGITAL pin 14)', { fn: 'spi_sck', a: ['13', 'SCK'] }),
      io('D12', 'D12 CIPO', 'D12 / CIPO (MISO), SPI data in (JDIGITAL pin 13)', { fn: 'spi_miso', a: ['12', 'CIPO', 'MISO'] }),
      io('D11', '~D11 COPI', 'D11 / COPI (MOSI), SPI data out, PWM (JDIGITAL pin 12)', { fn: 'spi_mosi', pwm: true, a: ['11', 'COPI', 'MOSI'] }),
      io('D10', '~D10 SS', 'D10 / SS, SPI chip select, PWM (JDIGITAL pin 11)', { fn: 'spi_cs', pwm: true, a: ['10', 'SS'] }),
      io('D9', '~D9', 'D9, PWM (JDIGITAL pin 10)', { pwm: true, a: ['9'] }),
      io('D8', 'D8', 'D8 (JDIGITAL pin 9)', { a: ['8'] }),
      null,
      io('D7', 'D7', 'D7 (JDIGITAL pin 8)', { a: ['7'] }),
      io('D6', '~D6', 'D6, PWM (JDIGITAL pin 7)', { pwm: true, a: ['6'] }),
      io('D5', '~D5', 'D5, PWM (JDIGITAL pin 6)', { pwm: true, a: ['5'] }),
      io('D4', 'D4', 'D4 (JDIGITAL pin 5)', { a: ['4'] }),
      io('D3', '~D3', 'D3, PWM (JDIGITAL pin 4)', { pwm: true, a: ['3'] }),
      io('D2', 'D2', 'D2 (JDIGITAL pin 3)', { a: ['2'] }),
      io('D1', 'D1 TX', 'D1 / TX, serial out (JDIGITAL pin 2)', { fn: 'uart_tx', a: ['1', 'TX'] }),
      io('D0', 'D0 RX', 'D0 / RX, serial in (JDIGITAL pin 1)', { fn: 'uart_rx', a: ['0', 'RX'] }),
    ],
    links: [['GND', 'GND.2', 'GND.3'], ['5V', 'IOREF'], ['A4', 'SDA'], ['A5', 'SCL']],
  });

  /* Arduino Nano (A000005).
     Datasheet: https://docs.arduino.cc/resources/datasheets/A000005-datasheet.pdf
       ("7-15V unregulated external power supply (pin 30)", "5V regulated external power supply (pin 27)").
     Full pinout sheet: https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf
       (the two header rows, SDA on A4, SCL on A5, SPI on D10 to D13, PWM pins,
       "MAXIMUM current per I/O pin is 20mA", "MAXIMUM current per +3.3V pin is 50mA", "VIN 7-12 V input to the board").
     Pins are numbered 1 to 30 round the board from D1/TX; that puts 5V on pin 27 and VIN on pin 30, as the datasheet says.
     Drawn with the USB socket at the top. */
  defBoard('arduino_nano', {
    name: 'Arduino Nano', title: 'Arduino Nano', maker: 'Arduino', logic: 5, gpioMaxmA: 20,
    src: 'https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf', tags: 'arduino nano atmega328p board microcontroller',
    left: [
      io('D13', 'D13 SCK', 'D13 / SCK, SPI clock (pin 16)', { num: 16, fn: 'spi_sck', a: ['13', 'SCK'] }),
      pw('3V3', '3V3', '3V3, 3.3 V output, 50 mA at most (pin 17)', 3.3, 'out', { num: 17, mA: 50 }),
      ref('AREF', 'AREF', 'AREF, analogue reference (pin 18)', { num: 18 }),
      io('A0', 'A0', 'A0, analogue input (pin 19)', { num: 19 }),
      io('A1', 'A1', 'A1, analogue input (pin 20)', { num: 20 }),
      io('A2', 'A2', 'A2, analogue input (pin 21)', { num: 21 }),
      io('A3', 'A3', 'A3, analogue input (pin 22)', { num: 22 }),
      io('A4', 'A4 SDA', 'A4 / SDA, I2C data (pin 23)', { num: 23, fn: 'i2c_sda', a: ['SDA'] }),
      io('A5', 'A5 SCL', 'A5 / SCL, I2C clock (pin 24)', { num: 24, fn: 'i2c_scl', a: ['SCL'] }),
      io('A6', 'A6', 'A6, analogue input (pin 25)', { num: 25 }),
      io('A7', 'A7', 'A7, analogue input (pin 26)', { num: 26 }),
      pw('5V', '5V', '5V supply (pin 27)', 5, 'both', { num: 27 }),
      ctl('RESET.2', 'RESET', 'RESET (pin 28)', { num: 28 }),
      gnd('GND.2', 'GND (pin 29)', { num: 29 }),
      pw('VIN', 'VIN', 'VIN, supply input 7–12 V (pin 30)', null, 'in', { num: 30, vmin: 7, vmax: 12 }),
    ],
    right: [
      io('D12', 'D12 CIPO', 'D12 / CIPO (MISO), SPI data in (pin 15)', { num: 15, fn: 'spi_miso', a: ['12', 'CIPO', 'MISO'] }),
      io('D11', '~D11 COPI', 'D11 / COPI (MOSI), SPI data out, PWM (pin 14)', { num: 14, fn: 'spi_mosi', pwm: true, a: ['11', 'COPI', 'MOSI'] }),
      io('D10', '~D10 SS', 'D10 / SS, SPI chip select, PWM (pin 13)', { num: 13, fn: 'spi_cs', pwm: true, a: ['10', 'SS'] }),
      io('D9', '~D9', 'D9, PWM (pin 12)', { num: 12, pwm: true, a: ['9'] }),
      io('D8', 'D8', 'D8 (pin 11)', { num: 11, a: ['8'] }),
      io('D7', 'D7', 'D7 (pin 10)', { num: 10, a: ['7'] }),
      io('D6', '~D6', 'D6, PWM (pin 9)', { num: 9, pwm: true, a: ['6'] }),
      io('D5', '~D5', 'D5, PWM (pin 8)', { num: 8, pwm: true, a: ['5'] }),
      io('D4', 'D4', 'D4 (pin 7)', { num: 7, a: ['4'] }),
      io('D3', '~D3', 'D3, PWM (pin 6)', { num: 6, pwm: true, a: ['3'] }),
      io('D2', 'D2', 'D2 (pin 5)', { num: 5, a: ['2'] }),
      gnd('GND', 'GND (pin 4)', { num: 4 }),
      ctl('RESET', 'RESET', 'RESET (pin 3)', { num: 3 }),
      io('D0', 'D0 RX', 'D0 / RX, serial in (pin 2)', { num: 2, fn: 'uart_rx', a: ['0', 'RX'] }),
      io('D1', 'D1 TX', 'D1 / TX, serial out (pin 1)', { num: 1, fn: 'uart_tx', a: ['1', 'TX'] }),
    ],
    links: [['GND', 'GND.2'], ['RESET', 'RESET.2']],
  });

  /* Raspberry Pi 40-pin GPIO header (the same on the boards that have it).
     Source: https://www.raspberrypi.com/documentation/computers/raspberry-pi.html (GPIO and the 40-pin header):
       pin table (3V3 on 1 and 17, 5V on 2 and 4, GND on 6, 9, 14, 20, 25, 30, 34, 39, GPIO numbers and typical functions),
       "Raspberry Pi GPIO pins operate at 3.3 V and aren't 5 V tolerant",
       "An individual GPIO pin can supply up to 16 mA", "all GPIO pins combined can supply a maximum total current of 50 mA".
     Pin ids are the physical pin numbers; GPIO17, GP17 or BCM17 also find pin 11. Odd pins down the left, pin 1 at the top. */
  const RPI = {
    1: pw('1', '3V3', '3V3, 3.3 V output (pin 1)', 3.3, 'out', { a: ['3V3'] }), 2: pw('2', '5V', '5V, 5 V output or input (pin 2)', 5, 'both', { a: ['5V'] }),
    4: pw('4', '5V', '5V, 5 V output or input (pin 4)', 5, 'both'), 17: pw('17', '3V3', '3V3, 3.3 V output (pin 17)', 3.3, 'out'),
  };
  [6, 9, 14, 20, 25, 30, 34, 39].forEach((n) => { RPI[n] = gnd(String(n), `GND (pin ${n})`, n === 6 ? { a: ['GND'] } : {}); });
  [[3, 2, 'SDA', 'I2C data', 'i2c_sda'], [5, 3, 'SCL', 'I2C clock', 'i2c_scl'], [7, 4, 'GPCLK0', 'clock output'], [8, 14, 'TXD', 'serial out', 'uart_tx'],
    [10, 15, 'RXD', 'serial in', 'uart_rx'], [11, 17], [12, 18, '', 'PCM clock'], [13, 27], [15, 22], [16, 23], [18, 24],
    [19, 10, 'MOSI', 'SPI data out', 'spi_mosi'], [21, 9, 'MISO', 'SPI data in', 'spi_miso'], [22, 25], [23, 11, 'SCLK', 'SPI clock', 'spi_sck'],
    [24, 8, 'CE0', 'SPI chip select 0', 'spi_cs'], [26, 7, 'CE1', 'SPI chip select 1', 'spi_cs'], [27, 0, 'ID_SD', 'HAT ID EEPROM, keep free'], [28, 1, 'ID_SC', 'HAT ID EEPROM, keep free'],
    [29, 5], [31, 6], [32, 12, 'PWM0', 'PWM output', 'pwm'], [33, 13, 'PWM1', 'PWM output', 'pwm'], [35, 19, '', 'PCM frame sync'], [36, 16], [37, 26],
    [38, 20, '', 'PCM data in'], [40, 21, '', 'PCM data out']].forEach(([n, g, short, what, fn]) => {
    RPI[n] = io(String(n), `GPIO${g}${short ? ' ' + short : ''}`, `GPIO${g}${short ? ' / ' + short : ''}${what ? ', ' + what : ''} (pin ${n})`, { a: [`GPIO${g}`, `GP${g}`, `BCM${g}`].concat(short ? [short] : []), ...(fn ? { fn } : {}), ...(n === 27 || n === 28 ? { avoid: true } : {}) });
  });
  Object.keys(RPI).forEach((n) => { RPI[n].num = +n; });
  defBoard('rpi_header', {
    name: 'Raspberry Pi 40-pin GPIO header', title: 'Raspberry Pi', line2: '40-pin GPIO header', maker: 'Raspberry Pi', logic: 3.3, gpioMaxmA: 16,
    limitText: 'Raspberry Pi says its GPIO pins work at 3.3 V and are not 5 V tolerant.',
    src: 'https://www.raspberrypi.com/documentation/computers/raspberry-pi.html', tags: 'raspberry pi rpi gpio header 40 pin hat bcm',
    left: Array.from({ length: 20 }, (_, i) => RPI[i * 2 + 1]),
    right: Array.from({ length: 20 }, (_, i) => RPI[i * 2 + 2]),
    links: [['1', '17'], ['2', '4'], ['6', '9', '14', '20', '25', '30', '34', '39']],
  });

  /* ESP32-DevKitC V4 (Espressif).
     Header blocks J2 and J3: https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html
       (also: power the board from one source only, GPIO6 to 11 go to the flash, IO16 and IO17 only on WROOM and SOLO-1 boards).
     Input voltage limit (VIH at most VDD + 0.3 V): ESP32-WROOM-32E datasheet,
       https://documentation.espressif.com/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf
     Espressif gives no fixed per-pin current limit in these documents, so no GPIO load check is made. */
  const espIO = (hdr, num, g, extra = '', o = {}) => io(`IO${g}`, `IO${g}`, `IO${g} / GPIO${g}${extra ? ', ' + extra : ''} (${hdr} pin ${num})`, { num, hdr, a: [`GPIO${g}`], ...o });
  const flash = (hdr, num, id, g) => io(id, id, `${id} / GPIO${g}, used by the flash memory: leave free (${hdr} pin ${num})`, { num, hdr, avoid: true, a: [`GPIO${g}`, `IO${g}`] });
  const ESP_LIMIT = 'Espressif gives the input high voltage as at most VDD + 0.3 V, so about 3.6 V on a 3.3 V supply.';
  defBoard('esp32_devkitc', {
    name: 'ESP32-DevKitC V4', title: 'ESP32-DevKitC V4', line2: 'J2 left, J3 right', maker: 'Espressif', logic: 3.3, limitText: ESP_LIMIT,
    src: 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html', tags: 'esp32 espressif devkitc wroom wifi bluetooth board microcontroller',
    left: [
      pw('3V3', '3V3', '3V3, 3.3 V supply (J2 pin 1)', 3.3, 'both', { num: 1, hdr: 'J2' }),
      ctl('EN', 'EN', 'EN, reset (CHIP_PU) (J2 pin 2)', { num: 2, hdr: 'J2' }),
      io('VP', 'VP', 'VP / GPIO36, input (J2 pin 3)', { num: 3, hdr: 'J2', dir: 'in', a: ['GPIO36', 'IO36'] }),
      io('VN', 'VN', 'VN / GPIO39, input (J2 pin 4)', { num: 4, hdr: 'J2', dir: 'in', a: ['GPIO39', 'IO39'] }),
      espIO('J2', 5, 34, 'input', { dir: 'in' }), espIO('J2', 6, 35, 'input', { dir: 'in' }), espIO('J2', 7, 32), espIO('J2', 8, 33),
      espIO('J2', 9, 25, 'DAC_1'), espIO('J2', 10, 26, 'DAC_2'), espIO('J2', 11, 27), espIO('J2', 12, 14), espIO('J2', 13, 12),
      gnd('GND', 'GND (J2 pin 14)', { num: 14, hdr: 'J2' }),
      espIO('J2', 15, 13), flash('J2', 16, 'D2', 9), flash('J2', 17, 'D3', 10), flash('J2', 18, 'CMD', 11),
      pw('5V', '5V', '5V, 5 V supply (J2 pin 19)', 5, 'both', { num: 19, hdr: 'J2' }),
    ],
    right: [
      gnd('GND.2', 'GND (J3 pin 1)', { num: 1, hdr: 'J3' }),
      espIO('J3', 2, 23), espIO('J3', 3, 22),
      io('TX', 'TX', 'TX / GPIO1, U0TXD serial out (J3 pin 4)', { num: 4, hdr: 'J3', fn: 'uart_tx', a: ['GPIO1', 'IO1', 'U0TXD'] }),
      io('RX', 'RX', 'RX / GPIO3, U0RXD serial in (J3 pin 5)', { num: 5, hdr: 'J3', fn: 'uart_rx', a: ['GPIO3', 'IO3', 'U0RXD'] }),
      espIO('J3', 6, 21),
      gnd('GND.3', 'GND (J3 pin 7)', { num: 7, hdr: 'J3' }),
      espIO('J3', 8, 19), espIO('J3', 9, 18), espIO('J3', 10, 5),
      espIO('J3', 11, 17, 'only on boards with an ESP32-WROOM or ESP32-SOLO-1 module'), espIO('J3', 12, 16, 'only on boards with an ESP32-WROOM or ESP32-SOLO-1 module'),
      espIO('J3', 13, 4), espIO('J3', 14, 0, 'boot'), espIO('J3', 15, 2), espIO('J3', 16, 15),
      flash('J3', 17, 'D1', 8), flash('J3', 18, 'D0', 7), flash('J3', 19, 'CLK', 6),
    ],
    links: [['GND', 'GND.2', 'GND.3']],
  });

  /* ESP32-S3-DevKitC-1 v1.1 (Espressif).
     Header blocks J1 and J3: https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide.html
       (v1.1 has the RGB LED on GPIO38, the first version on GPIO48; GPIO35 to 37 are used inside boards with octal flash or PSRAM;
       power the board from one source only).
     Input voltage limit: ESP32-S3-WROOM-1 datasheet, https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf
     Pin ids are the numbers printed on the board (the GPIO numbers); GPIO4 or IO4 also find pin 4. */
  const s3 = (hdr, num, g, extra = '', o = {}) => io(String(g), `GPIO${g}`, `GPIO${g}${extra ? ', ' + extra : ''} (${hdr} pin ${num})`, { num, hdr, a: [`GPIO${g}`, `IO${g}`], ...o });
  const S3_INSIDE = 'used inside boards with octal flash or PSRAM';
  defBoard('esp32_s3_devkitc1', {
    name: 'ESP32-S3-DevKitC-1 v1.1', title: 'ESP32-S3-DevKitC-1', line2: 'v1.1 · J1 left, J3 right', maker: 'Espressif', logic: 3.3, limitText: ESP_LIMIT,
    src: 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide.html', tags: 'esp32 s3 espressif devkitc wroom wifi bluetooth usb board microcontroller',
    left: [
      pw('3V3', '3V3', '3V3, 3.3 V supply (J1 pin 1)', 3.3, 'both', { num: 1, hdr: 'J1' }),
      pw('3V3.2', '3V3', '3V3, 3.3 V supply (J1 pin 2)', 3.3, 'both', { num: 2, hdr: 'J1' }),
      ctl('RST', 'RST', 'RST, reset (EN) (J1 pin 3)', { num: 3, hdr: 'J1' }),
      s3('J1', 4, 4), s3('J1', 5, 5), s3('J1', 6, 6), s3('J1', 7, 7), s3('J1', 8, 15), s3('J1', 9, 16), s3('J1', 10, 17), s3('J1', 11, 18),
      s3('J1', 12, 8), s3('J1', 13, 3), s3('J1', 14, 46), s3('J1', 15, 9), s3('J1', 16, 10), s3('J1', 17, 11), s3('J1', 18, 12), s3('J1', 19, 13), s3('J1', 20, 14),
      pw('5V', '5V', '5V, 5 V supply (J1 pin 21)', 5, 'both', { num: 21, hdr: 'J1' }),
      gnd('G', 'G, ground (J1 pin 22)', { num: 22, hdr: 'J1', text: 'G' }),
    ],
    right: [
      gnd('G.2', 'G, ground (J3 pin 1)', { num: 1, hdr: 'J3', text: 'G' }),
      io('TX', 'TX', 'TX / GPIO43, UART0 serial out (J3 pin 2)', { num: 2, hdr: 'J3', fn: 'uart_tx', a: ['GPIO43', 'IO43', '43', 'U0TXD'] }),
      io('RX', 'RX', 'RX / GPIO44, UART0 serial in (J3 pin 3)', { num: 3, hdr: 'J3', fn: 'uart_rx', a: ['GPIO44', 'IO44', '44', 'U0RXD'] }),
      s3('J3', 4, 1), s3('J3', 5, 2), s3('J3', 6, 42), s3('J3', 7, 41), s3('J3', 8, 40), s3('J3', 9, 39), s3('J3', 10, 38, 'RGB LED on v1.1'),
      s3('J3', 11, 37, S3_INSIDE), s3('J3', 12, 36, S3_INSIDE), s3('J3', 13, 35, S3_INSIDE),
      s3('J3', 14, 0), s3('J3', 15, 45), s3('J3', 16, 48), s3('J3', 17, 47), s3('J3', 18, 21),
      s3('J3', 19, 20, 'USB D+', { fn: 'usb_dp' }), s3('J3', 20, 19, 'USB D−', { fn: 'usb_dm' }),
      gnd('G.3', 'G, ground (J3 pin 21)', { num: 21, hdr: 'J3', text: 'G' }),
      gnd('G.4', 'G, ground (J3 pin 22)', { num: 22, hdr: 'J3', text: 'G' }),
    ],
    links: [['G', 'G.2', 'G.3', 'G.4'], ['3V3', '3V3.2']],
  });

  /* Boards left out: Raspberry Pi Pico and Pico 2. Their pin order is published as a drawing; the text of the
     datasheets names only a few pins by number, so the full order could not be confirmed from an official source. */

  /* ---------------- Supplies and modules ---------------- */
  lib.dc_supply = {
    id: 'dc_supply', name: 'DC supply (USB, adaptor or bench)', cat: 'Electronics', prefix: 'PS', w: 60, h: 40,
    tags: 'power supply psu usb adaptor adapter plug-in bench 5v 12v',
    props: [{ k: 'volts', l: 'Voltage', d: '5V' }, { k: 'amps', l: 'Current it can give', d: '' }, { k: 'what', l: 'Text inside', d: 'USB' }],
    sub: '{volts} {amps}',
    pins: [{ id: '+', x: 60, y: 10, n: '+ output', k: 'pwr', dir: 'out' }, { id: '-', x: 60, y: 30, n: '− (0 V)', k: 'gnd' }],
    shapes: [R(0, 0, 44, 40, { rx: 3 }), T(22, 19, '{what}', { size: 8, weight: 700 }), T(22, 31, 'DC', { size: 7, color: '#4a524d' }), L(44, 10, 60, 10), L(44, 30, 60, 30), T(52, 7, '+', { size: 8 }), T(52, 27, '−', { size: 8 })],
  };
  lib.dc_converter = {
    id: 'dc_converter', name: 'Buck / boost converter module', cat: 'Electronics', prefix: 'U', w: 100, h: 60, partial: true,
    tags: 'buck boost converter step down step up regulator module dc-dc',
    props: [{ k: 'vout', l: 'Output voltage', d: '5V' }, { k: 'amps', l: 'Output current rating', d: '' }, { k: 'kind', l: 'Type', d: 'Buck', type: 'select', options: [['Buck', 'Buck (steps down)'], ['Boost', 'Boost (steps up)'], ['Buck-boost', 'Buck-boost']] }],
    sub: '{vout} {amps}',
    pins: [
      { id: 'IN+', x: 0, y: 20, n: 'Input +', k: 'pwr', dir: 'in' }, { id: 'IN-', x: 0, y: 40, n: 'Input −', k: 'gnd' },
      { id: 'OUT+', x: 100, y: 20, n: 'Output +', k: 'pwr', dir: 'out' }, { id: 'OUT-', x: 100, y: 40, n: 'Output −', k: 'gnd' },
    ],
    shapes: [R(10, 0, 80, 60, { rx: 3 }), L(0, 20, 10, 20), L(0, 40, 10, 40), L(90, 20, 100, 20), L(90, 40, 100, 40),
      T(14, 23, 'IN+', { size: 6, anchor: 'start' }), T(14, 43, 'IN−', { size: 6, anchor: 'start' }), T(86, 23, 'OUT+', { size: 6, anchor: 'end' }), T(86, 43, 'OUT−', { size: 6, anchor: 'end' }),
      T(50, 14, 'DC-DC', { size: 8, weight: 700 }), T(50, 54, '{kind}', { size: 6.5, color: '#4a524d' })],
  };
  lib.relay_module = {
    id: 'relay_module', name: 'Relay module (1 channel)', cat: 'Electronics', prefix: 'K', w: 100, h: 80, partial: true,
    tags: 'relay module board arduino raspberry pi opto 5v',
    props: [{ k: 'rating', l: 'Contact rating', d: '' }, { k: 'mA', l: 'Current it draws (mA)', d: '' }], sub: '{rating}', derive: mAprops,
    pins: [
      { id: 'VCC', x: 0, y: 20, n: 'VCC, module supply', k: 'pwr', dir: 'in' }, { id: 'GND', x: 0, y: 40, n: 'GND', k: 'gnd' }, { id: 'IN', x: 0, y: 60, n: 'IN, control input', k: 'io', dir: 'in' },
      { id: 'COM', x: 100, y: 20, n: 'COM, common contact', k: 'sw' }, { id: 'NO', x: 100, y: 40, n: 'NO, normally open', k: 'sw' }, { id: 'NC', x: 100, y: 60, n: 'NC, normally closed', k: 'sw' },
    ],
    shapes: [R(10, 0, 80, 80, { rx: 3 }), ...[20, 40, 60].flatMap((y) => [L(0, y, 10, y), L(90, y, 100, y)]),
      T(14, 23, 'VCC', { size: 7, anchor: 'start', weight: 700 }), T(14, 43, 'GND', { size: 7, anchor: 'start', weight: 700 }), T(14, 63, 'IN', { size: 7, anchor: 'start' }),
      T(86, 23, 'COM', { size: 7, anchor: 'end' }), T(86, 43, 'NO', { size: 7, anchor: 'end' }), T(86, 63, 'NC', { size: 7, anchor: 'end' }),
      T(50, 76, 'RELAY', { size: 7, weight: 700 })],
  };
  lib.module_i2c = {
    id: 'module_i2c', name: 'I2C sensor / module', cat: 'Electronics', prefix: 'U', partial: true,
    tags: 'i2c sensor module breakout display oled sda scl',
    props: [{ k: 'text', l: 'Text inside', d: 'I2C SENSOR' }, { k: 'part', l: 'Part', d: '' }, { k: 'mA', l: 'Current it draws (mA)', d: '' },
      { k: 'side', l: 'Pins on', d: 'left', type: 'select', options: [['left', 'Left'], ['right', 'Right']] }],
    sub: '{part}', derive: mAprops,
    gen(p) {
      const w = 100, h = 120, right = p.side === 'right', x = right ? w : 0;
      const list = [['VCC', 'VCC, supply', { k: 'pwr', dir: 'in' }], ['GND', 'GND', { k: 'gnd' }], ['SDA', 'SDA, I2C data', { k: 'io', fn: 'i2c_sda' }], ['SCL', 'SCL, I2C clock', { k: 'io', fn: 'i2c_scl' }]];
      const shapes = [R(10, 0, 80, h, { rx: 3 }), T(50, 20, p.text || '', { size: 8, weight: 700 })], pins = [];
      list.forEach(([id, n, o], i) => {
        const y = 40 + i * 20;
        shapes.push(right ? L(90, y, 100, y) : L(0, y, 10, y), T(right ? 86 : 14, y + 3, id, { size: 7, anchor: right ? 'end' : 'start', weight: i < 2 ? 700 : 400 }));
        pins.push({ id, x, y, n, ...o });
      });
      return { w, h, pins, shapes };
    },
  };
  // the connector part searches for these words too
  lib.conn.tags += ' jst xh ph sh rcy dupont molex kk micro-fit mini-fit xt30 xt60 xt90 barrel usb-c m8 m12 screw terminal';

  /* How the boards and parts above behave in a circuit: boards are loads fed on their supply pins and returned
     on GND. A DC supply limits its own current, and its − is the 0 V reference (it counts as ground). */
  const OWN = {
    dc_supply: (r) => ({ links: [], switched: null, kind: 'source', states: null, source: '+', ret: '-', limited: true, zero: ['-'], vout: volts(r.props.volts) }),
    dc_converter: (r) => ({ links: [['IN-', 'OUT-']], switched: null, kind: 'converter', states: null, input: 'IN+', output: 'OUT+', ret: 'IN-', vout: volts(r.props.vout) }),
    relay_module: () => ({ links: [], kind: 'switch', states: ['Off', 'On'], switched: (s) => (s ? [['COM', 'NO']] : [['COM', 'NC']]), ret: 'GND', power: ['VCC'] }),
    module_i2c: () => ({ links: [], switched: null, kind: 'load', states: null, power: ['VCC'], earth: ['GND'] }),
  };
  const baseBehaviour = Loom.behaviour;
  Loom.behaviour = function (doc, p) {
    const d = lib[p.type];
    if (d && d.board && Loom.partDef(doc, p.type) === d) {
      const pins = d.pins;
      return { links: d.board.pairs, switched: null, kind: 'load', states: null, power: pins.filter((x) => x.k === 'pwr' && x.dir !== 'out').map((x) => x.id), earth: pins.filter((x) => x.k === 'gnd').map((x) => x.id) };
    }
    if (OWN[p.type] && Loom.partDef(doc, p.type) === lib[p.type]) return OWN[p.type](Loom.resolved(doc, p));
    return baseBehaviour(doc, p);
  };

  /* ---------------- What each wire carries ---------------- */
  const SIGNALS = [
    { id: '', name: 'Not set' },
    { id: 'power', name: 'Power' }, { id: 'ground', name: 'Ground (0 V)' },
    { id: 'digital', name: 'Digital' }, { id: 'analogue', name: 'Analogue' }, { id: 'pwm', name: 'PWM' },
    { id: 'i2c_sda', name: 'I2C SDA' }, { id: 'i2c_scl', name: 'I2C SCL' },
    { id: 'spi_mosi', name: 'SPI MOSI (COPI)' }, { id: 'spi_miso', name: 'SPI MISO (CIPO)' }, { id: 'spi_sck', name: 'SPI SCK' }, { id: 'spi_cs', name: 'SPI CS' },
    { id: 'uart_tx', name: 'UART TX' }, { id: 'uart_rx', name: 'UART RX' },
    { id: 'can_h', name: 'CAN H' }, { id: 'can_l', name: 'CAN L' },
    { id: 'rs485_a', name: 'RS-485 A' }, { id: 'rs485_b', name: 'RS-485 B' },
    { id: 'usb_dp', name: 'USB D+' }, { id: 'usb_dm', name: 'USB D−' },
    { id: 'onewire', name: '1-Wire' }, { id: 'shield', name: 'Shield / screen' },
  ];
  const signalName = (id) => (SIGNALS.find((s) => s.id === id) || { name: id || '' }).name;
  // separate lines of a bus: two of these on one connection is a mistake
  const LINES = ['i2c_sda', 'i2c_scl', 'spi_mosi', 'spi_miso', 'spi_sck', 'spi_cs', 'can_h', 'can_l', 'rs485_a', 'rs485_b', 'usb_dp', 'usb_dm'];
  const OPPOSITE = { i2c_sda: 'i2c_scl', i2c_scl: 'i2c_sda', can_h: 'can_l', can_l: 'can_h', usb_dp: 'usb_dm', usb_dm: 'usb_dp' };

  /* ---------------- Connector series ----------------
     Ratings and wire sizes are given only where the maker's data was checked; the source is in each note.
     Part numbers are for finding the right parts: check with the maker before ordering. */
  const range = (a, b, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
  const base = { pin: '', socket: '', sealed: false, rating: '', housing: () => '' };
  Loom.addSeries([
    { ...base, id: 'jst_xh', name: 'JST XH (2.5 mm)', ways: range(1, 16).concat([20]), rating: '3 A (AWG 22), 250 V; wire AWG 30–22 (0.05–0.33 mm²)',
      note: 'Crimp housing XHP-n with SXH-001T-P0.6 contacts (check with the maker).', src: 'https://www.jst-mfg.com/product/pdf/eng/eXH.pdf' },
    { ...base, id: 'jst_ph', name: 'JST PH (2.0 mm)', ways: range(2, 16), rating: '2 A (AWG 24), 100 V; wire AWG 32–24',
      note: 'Crimp housing PHR-n. Contacts SPH-002T-P0.5S for AWG 30–24 or SPH-004T-P0.5S for AWG 32–28 (check with the maker).', src: 'https://www.jst-mfg.com/product/pdf/eng/ePH.pdf' },
    { ...base, id: 'jst_sh', name: 'JST SH (1.0 mm)', ways: range(2, 16).concat([20]), rating: '1 A (AWG 28), 50 V; wire AWG 32–28 (0.032–0.081 mm²)',
      note: 'Crimp housing SHR-nnV-S (the -B version for 16 and 20 ways), contact SSH-003T-P0.2-H (check with the maker).', src: 'https://www.jst-mfg.com/product/pdf/eng/eSH.pdf' },
    { ...base, id: 'jst_rcy', name: 'JST RCY (2-way)', ways: [2], rating: '3 A (AWG 22), 250 V; wire AWG 28–22 (0.08–0.33 mm²)',
      note: 'Receptacle housing SYR-02T takes SYM-001T-P0.6 pin contacts; plug housing SYP-02T-1 takes SYF-001T-P0.6 socket contacts (check with the maker).', src: 'https://www.jst-mfg.com/product/pdf/eng/eRCY.pdf' },
    { ...base, id: 'dupont', name: 'Dupont-style 2.54 mm housing', ways: null,
      note: 'A common name for 2.54 mm crimp housings made by many firms, not one series. Ratings vary: check with the maker.' },
    { ...base, id: 'kk254', name: 'Molex KK 254 (2.54 mm)', ways: range(1, 36), rating: 'Up to 4.0 A; wire AWG 30–22',
      note: 'Housing and terminal part numbers: check with the maker.', src: 'https://www.molex.com/en-us/products/connectors/wire-to-board-connectors/kk-connectors' },
    { ...base, id: 'microfit3', name: 'Molex Micro-Fit 3.0 (3.0 mm)', ways: range(2, 12).concat(range(14, 24, 2)), rating: 'Up to 10.5 A, 600 V; wire AWG 30–18',
      note: 'Single-row receptacle 43645 (2 to 12 ways), dual-row receptacle 43025 (2 to 24 ways), female crimp terminal 43030 (check with the maker).', src: 'https://www.molex.com/content/dam/molex/molex-dot-com/en_us/pdf/datasheets/987650-5984.pdf' },
    { ...base, id: 'minifit_jr', name: 'Molex Mini-Fit Jr. (4.2 mm)', ways: null, rating: 'Mini-Fit family: up to 9.0 A, 600 V',
      note: 'Molex lists Mini-Fit Jr. receptacle 5557 and plug 5559 (check with the maker for the housing and terminal for your wire size).', src: 'https://www.molex.com/content/dam/molex/molex-dot-com/en_us/pdf/datasheets/987651-8272.pdf' },
    { ...base, id: 'xt30', name: 'XT30 (2-way)', ways: [2], note: 'Ratings vary between versions and makers: check with the maker. Note which cavity is + on your drawing.' },
    { ...base, id: 'xt60', name: 'XT60 (2-way)', ways: [2], note: 'Ratings vary between versions and makers: check with the maker. Note which cavity is + on your drawing.' },
    { ...base, id: 'xt90', name: 'XT90 (2-way)', ways: [2], note: 'Ratings vary between versions and makers: check with the maker. Note which cavity is + on your drawing.' },
    { ...base, id: 'barrel_5521', name: 'DC barrel 5.5 × 2.1 mm', ways: [2], cavities: () => [{ id: 'C', name: 'Centre pin' }, { id: 'S', name: 'Sleeve (outside)' }],
      note: 'Centre positive is common but not universal: check the polarity mark on your adaptor.' },
    { ...base, id: 'usbc_power', name: 'USB-C (power only)', ways: [2], cavities: () => [{ id: 'VBUS', name: 'VBUS' }, { id: 'GND', name: 'GND' }],
      note: 'Power only. A real USB-C connector has several VBUS and GND contacts; they are shown here as one of each.' },
    { ...base, id: 'm8', name: 'M8 sensor connector', ways: [3, 4],
      cavities: (n) => (n === 3 ? [{ id: '1', name: '1 brown, + supply' }, { id: '3', name: '3 blue, 0 V' }, { id: '4', name: '4 black, signal' }] : null),
      note: '3-pin M8 uses pins 1, 3 and 4; the colours are those Beckhoff gives for its sensor cables. Cable colours can differ: check with the maker. No colours are given for 4-pin.', src: 'https://infosys.beckhoff.com/content/1033/epp1xxx/7882204811.html' },
    { ...base, id: 'm12a', name: 'M12 A-coded sensor connector', ways: [4, 5],
      cavities: (n) => (n === 5 ? [['1', 'brown'], ['2', 'white'], ['3', 'blue'], ['4', 'black'], ['5', 'grey']].map(([id, c]) => ({ id, name: `${id} ${c}` })) : null),
      note: 'Colours for 5-pin from Baumer M12 cable data. Some makers use green-yellow for the fifth core: check with the maker. No colours are given for 4-pin.', src: 'https://media.baumer.com/mamfile_1604486.pdf' },
    { ...base, id: 'screw_50', name: 'Screw terminal, 5.0 mm pitch', ways: null, note: 'Ratings vary: check with the maker. 5.08 mm pitch is a different size, so check which one you have.' },
    { ...base, id: 'screw_35', name: 'Screw terminal, 3.5 mm pitch', ways: null, note: 'Ratings vary: check with the maker. 3.81 mm pitch is a different size, so check which one you have.' },
  ]);

  /* ---------------- Pin roles ---------------- */
  const WIRING = new Set(['conn', 'connector', 'plug', 'terminal_block', 'splice', 'net_label', 'offpage', 'busbar', 'grommet', 'can_term']);
  /* The role of a pin: board and module pins carry it; for other parts it is read from the pin name. */
  function pinInfo(it, pn) {
    if (pn.k) return pn;
    if (WIRING.has(it.p.type) || ['earth', 'wiring', 'protect'].includes(it.b.kind)) return null;
    const toks = (String(pn.id) + ' ' + String(pn.n || '')).toUpperCase().split(/[\s/,()]+/).map((t) => t.replace(/^\+/, '')).filter(Boolean);
    const has = (re) => toks.find((t) => re.test(t));
    if (has(/^(GND|0V|VSS|AGND|DGND|GROUND)$/)) return { k: 'gnd' };
    const p = has(/^(VCC|VDD|VIN|VBUS|VSYS|VBAT|V\+|5V|3V3|3\.3V|12V|24V)$/);
    if (p) return { k: 'pwr', dir: 'in', v: /^(\d|3\.3V)/.test(p) ? volts(p) : null };
    if (has(/^(U\d)?TX(D|O)?\d?$/)) return { k: 'io', fn: 'uart_tx' };
    if (has(/^(U\d)?RX(D|I)?\d?$/)) return { k: 'io', fn: 'uart_rx' };
    if (has(/^(I2C_?)?SDA\d?$/)) return { k: 'io', fn: 'i2c_sda' };
    if (has(/^(I2C_?)?SCL\d?$/)) return { k: 'io', fn: 'i2c_scl' };
    if (has(/^CAN[_-]?H(I|IGH)?$/)) return { k: 'io', fn: 'can_h' };
    if (has(/^CAN[_-]?L(O|OW)?$/)) return { k: 'io', fn: 'can_l' };
    return null;
  }
  const refOf = (it) => it.p.label || (Loom.partDef(it.v, it.p.type) || {}).name || it.p.type;
  function pinLabel(it, pn) {
    const r = refOf(it);
    if (pn.k && pn.text) return `${r} ${pn.text}${pn.num != null ? ` (${pn.hdr ? pn.hdr + ' ' : ''}pin ${pn.num})` : ''}`;
    if (pn.k) return `${r} ${pn.id}`;
    return `${r} ${pn.n && pn.n.length <= 14 ? pn.n : pn.id}`;
  }
  /* Supply outputs of a part: [{ pin, volts, rating (mA), dir, battery }]. */
  function driversOf(it, sv) {
    const t = it.p.type, d = Loom.partDef(it.v, t) || {}, pr = Loom.resolved(it.v, it.p).props || {};
    if (d.board && lib[t] === d) return d.pins.filter((x) => x.k === 'pwr' && (x.dir === 'out' || x.dir === 'both')).map((x) => ({ pin: x.id, volts: x.v, rating: x.mA || null, dir: x.dir }));
    if (t === 'dc_supply') return [{ pin: '+', volts: volts(pr.volts), rating: mAof(pr.amps), dir: 'out' }];
    if (t === 'dc_converter') return [{ pin: 'OUT+', volts: volts(pr.vout), rating: mAof(pr.amps), dir: 'out' }];
    if (t === 'regulator') return [{ pin: 'OUT', volts: regulatorVolts(pr.part), rating: null, dir: 'out' }];
    if (t === 'battery' || t === 'battery_aux') return [{ pin: '+', volts: volts(pr.volts) || sv, rating: null, dir: 'out', battery: true }];
    return [];
  }
  // current a part draws in mA, from its own mA field or its amps or watts; null when not known
  function partmA(it) {
    const pr = Loom.resolved(it.v, it.p).props || {}, m = mAfield(pr.mA);
    if (m != null) return m;
    const I = Loom.partCurrent(it.v, it.p);
    return I > 0 ? +(I * 1000).toFixed(1) : null;
  }
  const HEAVY = new Set(['motor', 'pump', 'fan', 'compressor', 'winch', 'horn', 'lamp', 'headlamp', 'led_bar', 'beacon', 'heater', 'solenoid', 'relay4', 'relay5', 'timer_relay', 'relay_6ra', 'wiper_motor', 'starter_motor', 'speaker']);
  const isCanPin = (id) => /^CAN[_\s-]?(H|L)(I|IGH|O|OW)?$/i.test(String(id));
  const isElectronics = (project) => ['electronics', 'mixed'].includes(((project && project.settings) || {}).projectType);

  /* ---------------- Checks ---------------- */
  /* Mistakes that the drawing shows plainly: supplies at different voltages joined, too much voltage on a pin,
     TX to TX, SDA to SCL, CAN H to CAN L, a pin driving a heavy load, boards sharing a signal but not a ground.
     Returns [{ level, text, sheetId, part | wire }]. */
  function electronicsChecks(d) {
    const project = projectOf(d), out = [], said = new Set();
    if (!project || !Array.isArray(project.sheets)) return out;
    const many = project.sheets.length > 1, where = (s) => (many ? s.name + ': ' : '');
    const add = (level, it, text, wire) => { const t = where(it.sheet) + text; if (said.has(t)) return; said.add(t); out.push(wire ? { level, wire: wire.id, sheetId: it.sheet.id, text: t } : { level, part: it.p.id, sheetId: it.sheet.id, text: t }); };
    const sv = volts((project.settings || {}).volts) || 12;
    const B = Loom.buildNet(project, { switches: 'open', relays: 'open', protect: true });
    const root = (it, pin) => B.uf.find(key(it.sheet, it.p.id, pin)), earth = B.uf.find(Loom.EARTH);
    const views = Loom.views(project), netWires = new Map();
    views.forEach((v) => v.wires.forEach((w) => { const r = B.uf.find(key(v.sheet, w.from.part, w.from.pin)); if (!netWires.has(r)) netWires.set(r, []); netWires.get(r).push({ v, w }); }));
    // every pin on a wired net, once per part (a part drawn on two sheets is one part)
    const nets = new Map(), seen = new Set(), parts = new Map(), drivers = new Map();
    B.inv.forEach((it) => {
      const pk = Loom.partKey(it.p);
      if (!parts.has(pk)) {
        parts.set(pk, it);
        driversOf(it, sv).forEach((dv) => { const r = root(it, dv.pin); if (!drivers.has(r)) drivers.set(r, []); drivers.get(r).push({ ...dv, it, pk, pn: Loom.resolved(it.v, it.p).pins.find((x) => x.id === dv.pin) }); });
      }
      Loom.resolved(it.v, it.p).pins.forEach((pn) => {
        const r = root(it, pn.id), sk = pk + '|' + pn.id;
        if (!netWires.has(r) || seen.has(sk)) return;
        seen.add(sk);
        if (!nets.has(r)) nets.set(r, []);
        nets.get(r).push({ it, pn, pk, info: pinInfo(it, pn) });
      });
    });
    const boardOf = (it) => { const d = lib[it.p.type]; return d && d.board && Loom.partDef(it.v, it.p.type) === d ? d.board : null; };
    const gndRoots = (it) => Loom.resolved(it.v, it.p).pins.filter((pn) => { const i = pinInfo(it, pn); return i && i.k === 'gnd'; }).map((pn) => root(it, pn.id));
    const lbl = (x) => pinLabel(x.it, x.pn || { id: x.pin });
    const pairs = new Set();

    nets.forEach((list, r) => {
      const D = drivers.get(r) || [], outs = D.filter((x) => x.dir === 'out' && x.volts > 0), ws = netWires.get(r) || [];
      const fixed = D.filter((x) => x.volts > 0);
      // supplies at different voltages joined
      const hi = outs.reduce((a, b) => (!a || b.volts > a.volts ? b : a), null), lo = outs.reduce((a, b) => (!a || b.volts < a.volts ? b : a), null);
      if (hi && lo && !near(hi.volts, lo.volts)) add('error', lo.it, `${lbl(hi)} (${hi.volts} V) and ${lbl(lo)} (${lo.volts} V) are wired together. Never join supplies at different voltages.`);
      else {
        const supplies = outs.filter((x) => !x.battery), parts2 = [...new Map(supplies.map((x) => [x.pk, x])).values()];
        if (parts2.length >= 2) add('warn', parts2[1].it, `${lbl(parts2[0])} and ${lbl(parts2[1])} are both supply outputs and are wired together. Feed this line from one of them only.`);
      }
      // a board's 5V or 3V3 pin wired to a supply at another voltage
      D.filter((x) => x.dir === 'both' && x.volts > 0).forEach((x) => {
        const s = outs.find((o) => o.pk !== x.pk && !near(o.volts, x.volts));
        if (s) add('error', x.it, `${lbl(x)} is a ${x.volts} V pin but is wired to ${lbl(s)} at ${s.volts} V.`);
      });
      // boards joined on their supply pins with nothing feeding them
      if (!outs.length) {
        const both = [...new Map(D.filter((x) => x.dir === 'both').map((x) => [x.pk, x])).values()];
        if (both.length >= 2) add('info', both[1].it, `${lbl(both[0])} and ${lbl(both[1])} are joined, but no supply is drawn on this line. If both boards are also plugged into USB they will feed each other: power them from one place.`);
      }
      list.forEach((x) => {
        const i = x.info;
        if (!i) return;
        // supply inputs: a stated voltage range, or a fixed voltage
        if (i.k === 'pwr' && i.dir === 'in' && outs.length) {
          const s = outs.find((o) => o.pk !== x.pk && (i.vmax ? o.volts > i.vmax * 1.001 || o.volts < i.vmin * 0.999 : i.v > 0 && !near(o.volts, i.v)));
          if (s && i.vmax) add('warn', x.it, `${lbl(x)} takes ${i.vmin}–${i.vmax} V, but it is wired to ${lbl(s)} at ${s.volts} V.`);
          else if (s) add('warn', x.it, `${lbl(x)} is a ${i.v} V input, but it is wired to ${lbl(s)} at ${s.volts} V.`);
        }
        // a signal pin wired straight to a supply above the board's logic voltage
        const bd = boardOf(x.it);
        if (bd && i.k === 'io' && bd.logic) {
          const s = fixed.find((o) => o.pk !== x.pk && o.volts > bd.logic * 1.1);
          if (s) add('error', x.it, `${lbl(x)} is a ${bd.logic} V pin, but it is wired straight to ${lbl(s)} at ${s.volts} V.${bd.limitText ? ' ' + bd.limitText : ''}`);
        }
      });
      // 5 V logic wired to 3.3 V logic
      const ios = list.filter((x) => x.info && x.info.k === 'io' && boardOf(x.it));
      ios.forEach((a) => ios.forEach((b) => {
        const la = boardOf(a.it).logic, lb = boardOf(b.it).logic;
        if (a.pk !== b.pk && la > lb * 1.1) add('warn', b.it, `${lbl(a)} (${la} V logic) is wired to ${lbl(b)} (${lb} V logic). A ${la} V signal can damage the ${lb} V board: use a level shifter.`);
      }));
      // bus roles of the pins on this line
      const byFn = (fn) => [...new Map(list.filter((x) => x.info && x.info.fn === fn).map((x) => [x.pk, x])).values()];
      const tx = byFn('uart_tx'), rx = byFn('uart_rx'), sda = byFn('i2c_sda'), scl = byFn('i2c_scl'), ch = byFn('can_h'), cl = byFn('can_l');
      if (tx.length >= 2) add('warn', tx[1].it, `${lbl(tx[0])} and ${lbl(tx[1])} are both TX (send) pins and are wired together. Serial lines cross over: TX goes to RX.`);
      if (rx.length >= 2) add('warn', rx[1].it, `${lbl(rx[0])} and ${lbl(rx[1])} are both RX (receive) pins and are wired together. Serial lines cross over: RX goes to TX.`);
      const sdaScl = sda.find((a) => scl.some((b) => b.pk !== a.pk));
      if (sdaScl) { const b = scl.find((y) => y.pk !== sdaScl.pk); add('warn', b.it, `${lbl(sdaScl)} (SDA) is wired to ${lbl(b)} (SCL). Join SDA to SDA and SCL to SCL.`); }
      const hl = ch.find((a) => cl.some((b) => b.pk !== a.pk && !(isCanPin(a.pn.id) && isCanPin(b.pn.id))));
      if (hl) { const b = cl.find((y) => y.pk !== hl.pk); add('error', b.it, `${lbl(hl)} (CAN H) is wired to ${lbl(b)} (CAN L). Join CAN H to CAN H and CAN L to CAN L.`); }
      // what the wires on this line are marked as
      const marked = ws.filter((x) => x.w.signal);
      const pwrW = marked.find((x) => x.w.signal === 'power'), gndW = marked.find((x) => x.w.signal === 'ground');
      if (pwrW && gndW) add('warn', { sheet: gndW.v.sheet }, `${pwrW.w.name} is marked power and ${gndW.w.name} is marked ground, but they are joined. Check for a short or a wrong label.`, gndW.w);
      const lines = [...new Map(marked.filter((x) => LINES.includes(x.w.signal)).map((x) => [x.w.signal, x])).values()];
      const can = lines.some((x) => x.w.signal === 'can_h') && lines.some((x) => x.w.signal === 'can_l');
      if (lines.length >= 2) add(can ? 'error' : 'warn', { sheet: lines[1].v.sheet }, `${lines[0].w.name} (${signalName(lines[0].w.signal)}) and ${lines[1].w.name} (${signalName(lines[1].w.signal)}) are joined. They should be separate lines.`, lines[1].w);
      // a signal pin of a board driving a heavy load directly
      list.forEach((x) => {
        const bd = boardOf(x.it);
        if (!bd || !bd.gpioMaxmA || !x.info || x.info.k !== 'io') return;
        list.forEach((y) => {
          if (y.pk === x.pk || boardOf(y.it)) return;
          const b = y.it.b, def = Loom.partDef(y.it.v, y.it.p.type) || {};
          const isLoad = (b.kind === 'load' && (b.power.includes(y.pn.id) || (b.either && b.earth.includes(y.pn.id)))) || (b.kind === 'relay' && b.coil && b.coil[0] === y.pn.id);
          if (!isLoad) return;
          const mA = partmA(y.it), what = b.kind === 'relay' ? 'a relay coil' : (def.name || y.it.p.type).replace(/\s*\(.*\)$/, '').split(' / ')[0].toLowerCase();
          if (mA != null && mA > bd.gpioMaxmA) add('warn', y.it, `${refOf(y.it)} draws about ${Math.round(mA)} mA, but ${lbl(x)} can give at most ${bd.gpioMaxmA} mA (${bd.maker} figure). Drive it through a transistor, MOSFET or relay module.`);
          else if (mA == null && (HEAVY.has(y.it.p.type) || b.kind === 'relay')) add('warn', y.it, `${refOf(y.it)} is wired straight to ${lbl(x)}, which can give at most ${bd.gpioMaxmA} mA (${bd.maker} figure). ${what[0].toUpperCase() + what.slice(1)} usually needs more than that: drive it through a transistor, MOSFET or relay module.`);
        });
      });
      // two devices share a signal but not a ground
      if (r === earth || D.length || list.some((x) => x.info && (x.info.k === 'pwr' || x.info.k === 'gnd'))) return;
      const devs = [...new Map(list.filter((x) => !x.info || ['io', 'ctl'].includes(x.info.k)).map((x) => [x.pk, x])).values()].map((x) => ({ x, g: gndRoots(x.it) })).filter((z) => z.g.length);
      devs.forEach((a, i) => devs.slice(i + 1).forEach((b) => {
        if (!boardOf(a.x.it) && !boardOf(b.x.it)) return;
        const pk = [a.x.pk, b.x.pk].sort().join(' ');
        if (pairs.has(pk) || a.g.some((g) => b.g.includes(g))) return;
        pairs.add(pk);
        add('warn', b.x.it, `${refOf(a.x.it)} and ${refOf(b.x.it)} share a signal (${lbl(a.x)} to ${lbl(b.x)}) but their grounds are not joined. Wire GND to GND so the signal has a return path.`);
      }));
    });
    // each marked wire against the pins at its ends
    views.forEach((v) => v.wires.forEach((w) => {
      if (!w.signal) return;
      let told = false; // one note per wire is enough
      [w.from, w.to].forEach((e) => {
        const p = v.parts.find((x) => x.id === e.part);
        if (!p || told) return;
        const it = { v, sheet: v.sheet, p, b: Loom.behaviour(v, p) }, pn = Loom.resolved(v, p).pins.find((x) => x.id === e.pin), i = pn && pinInfo(it, pn);
        if (!i) return;
        const was = out.length;
        if (OPPOSITE[w.signal] && i.fn === OPPOSITE[w.signal]) add('warn', it, `${w.name} is marked ${signalName(w.signal)} but ends on ${pinLabel(it, pn)}, which is ${signalName(i.fn)}.`, w);
        else if (w.signal === 'ground' && i.k === 'pwr') add('warn', it, `${w.name} is marked ground but ends on ${pinLabel(it, pn)}, a supply pin.`, w);
        else if (w.signal === 'power' && i.k === 'gnd') add('warn', it, `${w.name} is marked power but ends on ${pinLabel(it, pn)}, a ground pin.`, w);
        told = out.length > was;
      });
    }));
    return out;
  }
  const baseValidate = Loom.validate;
  Loom.validate = function (d) {
    const b = baseValidate(d), project = projectOf(d);
    if (!project || !Array.isArray(project.sheets) || !isElectronics(project)) return b;
    const extra = electronicsChecks(project);
    return d && d.sheet ? b.concat(extra.filter((c) => !c.sheetId || c.sheetId === d.sheet.id)) : b.concat(extra);
  };

  /* ---------------- Power budget ---------------- */
  /* One entry per supply rail: what it feeds and how many mA against the rating of what supplies it.
     A board passes on what its own outputs feed (its regulators are taken as linear), and a converter
     draws its output power from its input at an assumed 85% efficiency. */
  function electronicsPower(d) {
    const project = projectOf(d), rows = [];
    if (!project || !Array.isArray(project.sheets)) return rows;
    const sv = volts((project.settings || {}).volts) || 12;
    const B = Loom.buildNet(project, { switches: 'closed', relays: 'closed', protect: true });
    const root = (it, pin) => B.uf.find(key(it.sheet, it.p.id, pin)), earth = B.uf.find(Loom.EARTH);
    const wired = new Set();
    Loom.views(project).forEach((v) => v.wires.forEach((w) => wired.add(B.uf.find(key(v.sheet, w.from.part, w.from.pin)))));
    const parts = new Map();
    B.inv.forEach((it) => { const pk = Loom.partKey(it.p); if (!parts.has(pk)) parts.set(pk, it); });
    const rails = new Map();
    parts.forEach((it, pk) => driversOf(it, sv).forEach((dv) => {
      const r = root(it, dv.pin);
      if (r === earth || !wired.has(r)) return;
      if (!rails.has(r)) rails.set(r, []);
      rails.get(r).push({ ...dv, it, pk, pn: Loom.resolved(it.v, it.p).pins.find((x) => x.id === dv.pin) });
    }));
    const mainOf = (r) => { const ds = rails.get(r); return ds.find((x) => x.dir === 'out') || ds[0]; };
    // the pins each part draws its power through
    const inputsOf = (it) => {
      const d = lib[it.p.type], b = it.b;
      if (d && d.board && Loom.partDef(it.v, it.p.type) === d) return d.pins.filter((x) => x.k === 'pwr' && x.dir !== 'out').map((x) => x.id);
      if (it.p.type === 'relay_module') return ['VCC'];
      if (it.p.type === 'regulator') return ['IN'];
      if (b.kind === 'converter') return [b.input];
      if (b.kind === 'load') return b.either ? b.power.concat(b.earth) : b.power;
      if (b.kind === 'relay' && b.coil) return [b.coil[0]];
      return [];
    };
    const feeds = new Map();
    parts.forEach((it, pk) => {
      const done = new Set();
      inputsOf(it).forEach((pin) => {
        const r = root(it, pin);
        if (!rails.has(r) || done.has(r)) return;
        done.add(r);
        if (!feeds.has(r)) feeds.set(r, []);
        feeds.get(r).push({ it, pk, pin });
      });
    });
    const memo = new Map();
    // the rails a part supplies (the ones where it is the main supply)
    const ownRails = (pk, not) => [...rails.keys()].filter((r) => r !== not && mainOf(r).pk === pk);
    function rail(r) {
      if (memo.has(r)) return memo.get(r);
      const res = { load: 0, feeds: [], unknown: [] }, main = mainOf(r);
      memo.set(r, res); // a loop counts what it has so far
      (feeds.get(r) || []).forEach((c) => {
        if (c.pk === main.pk) return;
        const dr = draw(c, r, main.volts);
        res.load += dr.mA;
        if (dr.mA > 0 || !dr.unknown.length) res.feeds.push({ ref: refOf(c.it), mA: +dr.mA.toFixed(1), via: c.pin });
        dr.unknown.forEach((u) => { if (!res.unknown.includes(u)) res.unknown.push(u); });
      });
      return res;
    }
    function draw(c, r, vin) {
      const it = c.it, t = it.p.type, d = lib[t], unknown = [];
      let mA = 0;
      const down = ownRails(c.pk, r).map(rail);
      const sub = down.reduce((s, x) => s + x.load, 0);
      down.forEach((x) => x.unknown.forEach((u) => unknown.push(u)));
      if (d && d.board && Loom.partDef(it.v, t) === d) {
        const own = mAfield((Loom.resolved(it.v, it.p).props || {}).mA);
        if (own == null) unknown.unshift(refOf(it));
        mA = (own || 0) + sub;
      } else if (t === 'dc_converter') {
        const vout = volts((Loom.resolved(it.v, it.p).props || {}).vout);
        mA = vin > 0 && vout > 0 ? (sub * vout) / (vin * 0.85) : sub;
      } else if (t === 'regulator' || it.b.kind === 'converter') {
        mA = sub;
        if (t !== 'regulator' && !down.length) { const own = partmA(it); if (own == null) unknown.unshift(refOf(it)); else mA = own; }
      } else {
        const own = partmA(it);
        if (own == null) unknown.unshift(refOf(it)); else mA = own;
        mA += sub;
      }
      return { mA, unknown };
    }
    rails.forEach((ds, r) => {
      const main = mainOf(r), res = rail(r);
      if (!(feeds.get(r) || []).some((c) => c.pk !== main.pk)) return;
      const load = Math.round(res.load), rating = main.rating || null;
      rows.push({
        sheet: main.it.sheet.name, sheetId: main.it.sheet.id, part: main.it.p.id, supply: refOf(main.it), pin: main.pn ? (main.pn.text || main.pn.id) : main.pin,
        volts: main.volts, rating, load, pct: rating ? Math.round((load / rating) * 100) : null,
        status: !rating ? 'no rating' : load > rating ? 'over' : load > rating * 0.8 ? 'close' : 'ok',
        feeds: res.feeds, unknown: res.unknown,
      });
    });
    return rows;
  }

  /* ---------------- Reports ---------------- */
  Loom.REPORTS.push('power');
  const baseRows = Loom.reportRows;
  Loom.reportRows = function (d, kind, o = {}) {
    const project = projectOf(d);
    if (kind === 'power') {
      return [['Sheet', 'Supply', 'Pin', 'Volts', 'Rating mA', 'Load mA', 'Use %', 'Status', 'Feeds', 'No current figure']]
        .concat(electronicsPower(project).map((x) => [x.sheet, x.supply, x.pin, x.volts == null ? '' : x.volts, x.rating == null ? '' : x.rating, x.load, x.pct == null ? '' : x.pct, x.status, x.feeds.map((f) => `${f.ref} ${f.mA} mA`).join('; '), x.unknown.join(' ')]));
    }
    const rows = baseRows(d, kind, o);
    // the wire list gains a Signal column in electronics projects, or once any wire has a signal
    if (kind === 'wires' && (isElectronics(project) || Loom.views(project).some((v) => v.wires.some((w) => w.signal)))) {
      const at = rows[0].indexOf('Circuit') + 1 || rows[0].length, list = Loom.wireList(project);
      rows[0].splice(at, 0, 'Signal');
      rows.slice(1).forEach((row, i) => row.splice(at, 0, signalName((list[i] || {}).signal)));
    }
    return rows;
  };
  if (Loom.PDF_TABLES) {
    Loom.PDF_TABLES.power = { title: 'Power rails', cols: ['Sheet', 'Supply', 'Pin', 'Volts', 'Rating mA', 'Load mA', 'Use %', 'Status', 'Feeds', 'No current figure'], ref: 'Supply', sheet: 'Sheet' };
    const wc = Loom.PDF_TABLES.wires.cols;
    if (!wc.includes('Signal')) wc.splice(wc.indexOf('Circuit') + 1, 0, 'Signal');
  }

  /* ---------------- Starter circuits ---------------- */
  const tpl = Loom.defineTemplate;
  const w35 = (o) => ({ gauge: '0.35', ...o });
  tpl('arduino-i2c', 'I2C sensor on an Arduino', 'electronics', 'An I2C sensor or display on an Arduino UNO R3: 5V and GND for power, A4 (SDA) and A5 (SCL) for data. Check that your module can run at 5 V. If it is a 3.3 V part, power it from 3V3 and use a level shifter on SDA and SCL.', (a) => {
    const uno = a.part('arduino_uno_r3', 0, 0);
    const s = a.part('module_i2c', -200, 80, { props: { side: 'right', text: 'I2C SENSOR' } });
    const e = a.part('ground_signal', 140, 120);
    a.wire(uno, '5V', s, 'VCC', w35({ colour: 'red', signal: 'power', circuit: 'Sensor' }));
    a.wire(uno, 'GND', s, 'GND', w35({ colour: 'black', signal: 'ground', circuit: 'Sensor' }));
    a.wire(uno, 'A4', s, 'SDA', w35({ colour: 'blue', signal: 'i2c_sda', circuit: 'Sensor' }));
    a.wire(uno, 'A5', s, 'SCL', w35({ colour: 'yellow', signal: 'i2c_scl', circuit: 'Sensor' }));
    a.wire(uno, 'GND.3', e, 'G', w35({ colour: 'black', signal: 'ground' }));
  });
  tpl('rpi-relay', 'Relay module on a Raspberry Pi', 'electronics', 'A relay module switched by GPIO23 (pin 16), with its own 5 V supply. Check that the module switches on a 3.3 V input and does not pull its input up to 5 V, which would put 5 V on the Raspberry Pi pin.', (a) => {
    const pi = a.part('rpi_header', 0, 0);
    const k = a.part('relay_module', 320, 120);
    const ps = a.part('dc_supply', 180, 20, { props: { volts: '5V', what: 'USB' } });
    const e1 = a.part('ground_signal', 240, 60), e2 = a.part('ground_signal', 180, 240);
    const l1 = a.part('net_label', 500, 130, { label: '', props: { text: 'LOAD FEED' } });
    const l2 = a.part('net_label', 500, 150, { label: '', props: { text: 'TO LOAD' } });
    a.wire(pi, '16', k, 'IN', w35({ colour: 'yellow', signal: 'digital', circuit: 'Relay' }));
    a.wire(pi, '14', k, 'GND', w35({ colour: 'black', signal: 'ground', circuit: 'Relay' }));
    a.wire(ps, '+', k, 'VCC', w35({ colour: 'red', signal: 'power', circuit: 'Relay' }));
    a.wire(ps, '-', e1, 'G', w35({ colour: 'black', signal: 'ground' }));
    a.wire(pi, '20', e2, 'G', w35({ colour: 'black', signal: 'ground' }));
    a.wire(k, 'COM', l1, 'L', { gauge: '0.75', colour: 'brown', circuit: 'Load' });
    a.wire(k, 'NO', l2, 'L', { gauge: '0.75', colour: 'brown', tracer: 'white', circuit: 'Load' });
  });
  tpl('esp32-buck', '12 V to 5 V buck feeding an ESP32', 'electronics', 'A 12 V battery, fused, feeding a buck converter set to 5 V that powers an ESP32-DevKitC on its 5V pin. Espressif says to power the board from one source only, so do not plug in USB while it runs from the converter.', (a) => {
    const bat = a.part('battery', 0, 0, { props: { volts: '12V' } });
    const f = a.part('fuse', 100, 10, { props: { rating: '2A' } });
    const u = a.part('dc_converter', 200, 0, { props: { vout: '5V', amps: '3A', kind: 'Buck' } });
    const esp = a.part('esp32_devkitc', 380, -380);
    const e1 = a.part('ground_signal', -40, 40), e2 = a.part('ground_signal', 160, 60), e3 = a.part('ground_signal', 300, -60);
    a.wire(bat, '+', f, '1', { gauge: '0.5', colour: 'red', signal: 'power', circuit: 'Supply' });
    a.wire(f, '2', u, 'IN+', { gauge: '0.5', colour: 'red', signal: 'power', circuit: 'Supply' });
    a.wire(u, 'OUT+', esp, '5V', w35({ colour: 'red', tracer: 'white', signal: 'power', circuit: 'Supply' }));
    a.wire(bat, '-', e1, 'G', { gauge: '0.5', colour: 'black', signal: 'ground' });
    a.wire(u, 'IN-', e2, 'G', { gauge: '0.5', colour: 'black', signal: 'ground' });
    a.wire(esp, 'GND', e3, 'G', w35({ colour: 'black', signal: 'ground' }));
  });

  Object.assign(Loom, { SIGNALS, signalName, electronicsChecks, electronicsPower, pinRole: pinInfo, boardPins: (type) => (lib[type] && lib[type].board ? lib[type].pins : null) });
  return Loom;
});
