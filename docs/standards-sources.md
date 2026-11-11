# Where the mains checks come from

LoomWright's household and factory checks are **planning guidance**. They are built from
selected rules of BS 7671:2018+A4:2026 (household) and selected recommendations of
BS EN 60204-1 (machinery and control panels), as published by the IET, NICEIC, SELECT,
makers and other sources listed below.

They are not the standards themselves. LoomWright does not hold a licensed copy of either
standard, many table values come from published reproductions, and only a small part of each
standard is checked. Passing every check does **not** mean an installation meets BS 7671,
BS EN 60204-1 or the Building Regulations. A qualified electrician must design, install,
test and certify the work. See the Disclaimer chapter of the user manual.

Rules were last reviewed on 10 November 2026. If you find a figure that is wrong or out of
date, please open an issue with the source.

## What is checked

Each finding in the Checks list carries a rule code. The code says where the rule comes from.

### Household (BS 7671 guidance)

| Code | What it looks at | Sources |
|---|---|---|
| A1-RING-CABLE, A1-RING-CLOSED, A1-RING-AREA | Ring final circuits: 2.5 mm² all the way round on 30 or 32 A, a closed loop, up to 100 m² of floor | S7, S9, S41 |
| A1-RING-SPURS-UNFUSED, A1-RING-SPURS-COUNT | One single or twin socket per unfused spur; no more spurs than points on the ring | S7, S8 |
| A1-RING-FIXED-LOADS, A1-DEDICATED | Showers, immersion heaters, cookers, EV chargers and similar loads on their own circuit | S9, S10 |
| A2-RCD-SOCKETS, A2-RCD-LIGHTING, A2-RCD-BATH, A2-RCD-OUTDOOR | 30 mA RCD protection for sockets, domestic lighting, bathrooms and outdoor sockets | S3, S4, S10, S23 |
| A2-RCD-TYPE, A2-RCD-EV, A2-RCD-INV | RCD type: not Type AC for electronic loads; DC fault protection for EV charge points | S4, S5, S38, S39 |
| A2-AFDD | Arc fault detection for socket circuits in higher-risk residential buildings | S4, S5 |
| A2-SPD | Surge protection | S3, S4 |
| A2-CU-CASE | Non-combustible consumer unit case in homes | S3 |
| A2-RCD-FRONTEND | All circuits on one RCD | S10 |
| A3-ZS | Earth fault loop impedance against the maximum for the breaker (Cmin × U0 ÷ Ia) | S12, S13, S14, S43 |
| A3-TT-RCD, A3-TT-RA | TT supplies: RCD protection and RA × IΔn ≤ 50 V | S12, S25 |
| A4-VD, A4-LEN | Voltage drop: 3 % lighting, 5 % other (higher for private supplies) | S17, S18, S19 |
| A5-IB-IN, A5-CCC, A5-INSULATION, A5-SIZE | Design current, breaker rating and derated cable rating (Ca, Cg, Ci) | S15, S16, S21, S22, S11 |
| A6-BATH-SOCKET, A6-BATH-ZONE | Sockets 2.5 m from bathroom zones; IP ratings in zones 0, 1 and 2 | S23 |
| A7-MAIN-BOND, A7-CPC-ADIABATIC | Main protective bonding sizes on PME; earth conductor size against the fault current | S24, S26, S20 |
| A8-COLOURS, A8-MIXED | Harmonised cable colours and the mixed-colours warning notice | S27 |
| A9-PARTP | Notifiable work in England and Wales, and the Scotland and Northern Ireland equivalents | S28, S29, S30, S31 |
| A10-G98, A10-STRINGFUSE, A10-DC-CABLE, A10-BATT-LOFT | Solar PV and home batteries: G98/G99, string fuses, DC cable rating, battery locations | S32, S33, S34, S35, S36, S37 |
| C-DIVERSITY | Estimated maximum demand with the household diversity method | S65 |
| B4-13A, B2-B-CURVE-MOTOR | Workshop machines on 13 A plugs; motor starting on Type B breakers | S55 to S60, S50 |

### Factory and control panels (BS EN 60204-1 guidance)

| Code | What it looks at | Sources |
|---|---|---|
| B1-COLOURS | Green-and-yellow only for protective earth; black power, red AC control, blue DC control | S27, S44, S45 |
| B1-ESTOP | Emergency stops are stop category 0 or 1 | S47 |
| B1-PB | Start buttons never red, stop buttons never green | S46 |
| B1-CTRL-XFMR | AC control circuits fed from a control transformer | S48 |
| B2-FLC | Full-load current estimated from typical 400 V motor data | S49 |
| B2-OVERLOAD | Overload setting near full-load current (0.58 × for star-delta) | S50, S53 |
| B2-CONTACTOR | Contactor AC-3 rating against motor current; AC-4 for inching | S52 |
| B2-DOL-START | Starting current of larger direct-on-line motors | S51 |
| B2-VFD-RCD | RCD type for variable speed drives | S38, S50 |

### Loads library

Appliance and machine ratings are typical published figures (S61 to S64) or one maker's
data sheet for an example machine (S55 to S60). Always use the rating plate of the equipment
you are wiring.

## Known limits

- **Table values.** Cable ratings (Table 4D5), correction factors (Tables 4B1, 4C1, 52.2),
  maximum Zs and k values come from published reproductions, not a licensed copy of BS 7671.
  The 4 mm² Method 103 figure differs between sources.
- **Three-phase circuits** are not worked out for cable rating, voltage drop or Zs.
- **Domestic lighting RCD rule.** The exact wording of the current regulation was not checked.
- **Bathroom IPX5** where water jets are used is not checked.
- **BS EN 60204-1 Table 5** (minimum conductor sizes) and the indicator lamp colour table are
  not checked.
- **Diversity** uses the older IET On-Site Guide table.
- **Appliance figures**, inrush multiples and power factors are typical only. No reliable
  typical figure was found for air conditioners.
- **Not covered at all**: the risk assessment and safety functions a machine needs
  (BS EN ISO 12100, 13849-1, 13850, 62061), switchgear assemblies (BS EN 61439), periodic
  inspection, and the duties of the Electricity at Work Regulations 1989, PUWER 1998 and the
  Supply of Machinery (Safety) Regulations 2008.

## Sources

Primary or authoritative sources are marked ★.

### Household wiring

- [S3] ★ IET, "18th Edition changes": https://electrical.theiet.org/bs-7671/18th-edition-resources/18th-edition-changes
- [S4] ★ NICEIC, "Understanding BS 7671:2018 + Amendment 4:2026": https://niceic.com/amendment-four/
- [S5] ★ SELECT, "2026 Amendment 4 – What's New": https://select.org.uk/common/uploaded%20files/Technical/FreeDownloads/2026_Amendment_4_Whats_New.pdf
- [S7] TLC Direct, ring final circuit: https://www.tlc-direct.co.uk/Book/6.3.2.htm
- [S8] Professional Electrician, unfused spurs off a ring final circuit: https://professional-electrician.com/?p=49529
- [S9] SparkyFacts, typical circuits for domestic use: https://www.sparkyfacts.co.uk/toolboxguide/Typical%20Circuits%20For%20Domestic%20Use.pdf
- [S10] ★ Electrical Safety First, Wiring Regulations Advisory Group Q&A: https://electricalsafetyfirst.org.uk/professional-resources/wiring-regulations/new-rewired-and-similar-installations
- [S11] ★ IET, cables concealed in a wall or partition: https://electrical.theiet.org/media/1619/requirements-for-cables-concealed-in-a-wall-or-partition-a-brief-overview.pdf
- [S12] ★ IET, maximum Zs values: https://electrical.theiet.org/media/1442/maximum-zs-values.pdf
- [S13] ★ IET Wiring Matters (March 2023), maximum earth fault loop impedance: https://electrical.theiet.org/wiring-matters/years/2023/94-march-2023/determining-the-maximum-earth-fault-loop-impedance-for-protective-devices-to-bs-en-60898-bs-en-60947-2/
- [S14] ★ IET Wiring Matters (September 2018), ENA ER P23: https://electrical.theiet.org/wiring-matters/years/2018/72-september-2018/earth-fault-loop-impedance-revision-of-ena-engineering-recommendation-p23/
- [S15] Eland Cables, Table 4D5 reproduction: https://elandcables.com/media/3hoka0mu/table-4d5.pdf
- [S16] TradeCalculator, cable ampacity table: https://tradecalculator.co.uk/reference/cable-ampacity-table/
- [S17] ★ IET, Appendix 4 of BS 7671: https://electrical.theiet.org/media/1617/appendix-4-of-bs-7671.pdf
- [S18] eTools, IEC 60364-5-52 voltage drop: https://sites.google.com/view/etoolsbox/electrical/voltage-drop-iec
- [S19] myCableEngineering, voltage drop to BS 7671: https://mycableengineering.com/?p=731
- [S20] TLC Direct, conductor resistance: https://tlc-direct.co.uk/Figures/Tab5.5.htm
- [S21] ElectriciansForums, thermal derating factors: https://www.electriciansforums.net/threads/thermal-derating-factors.10451
- [S22] TLC Direct, thermal insulation correction: https://tlc-direct.co.uk/Book/4.3.6.htm
- [S23] ★ SELECT, locations containing a bath or shower: https://select.org.uk/common/uploaded%20files/Technical/FreeDownloads/30269_PG_BathOrShower.pdf
- [S24] Voltimum/NICEIC, main bonding conductors: https://content.voltimum.com/uk/138094/20070222450695082006042825847608ng_main_bonding_conductors.pdf
- [S25] ★ Electricity North West, Electrolink 1: https://www.enwl.co.uk/globalassets/get-connected/cic/icpsidnos/g81-policy/policy-library-documents/design-and-planning/electrolink-1-20.01.11.pdf
- [S26] Voltimum/NICEIC, cpc sizes of twin and earth cable: https://www.voltimum.co.uk/news/q-day-cpc-sizes-twin-earth-cable-there
- [S27] ★ IET, harmonised colours and alphanumeric marking: https://electrical.theiet.org/media/1720/harmonised-colours-and-alphanumeric-marketing.pdf
- [S28] ★ IET, Part P (England and Wales): https://electrical.theiet.org/bs-7671/building-regulations/part-p-england-and-wales/
- [S29] ★ IET, Part P (Scotland and Northern Ireland): https://electrical.theiet.org/bs-7671/building-regulations/part-p-scotland-and-northern-ireland/
- [S30] ★ Electrical Safety First, building regulations: https://www.electricalsafetyfirst.org.uk/guides-and-advice/building-regulations/
- [S31] DIYWiki, Part P: https://wiki.diyfaq.org.uk/index.php/Part_P
- [S32] Arkance/MEPworx, sizing PV cables and fuses: https://ukcommunity.arkance.world/hc/en-us/articles/21548089087890-MEPworx-Wiring-Sizing-PV-Cables-Fuses
- [S33] Open Exam Prep, PV string overcurrent rule: https://open-exam-prep.com/study-guides/uk-city-guilds-2922-l3-solar-pv/dc-ratings-protection/string-overcurrent-rule
- [S34] Open Exam Prep, G98, G99 and G100: https://open-exam-prep.com/study-guides/uk-city-guilds-2922-l3-solar-pv/capacity-grid-connection/g98-g99-g100
- [S35] ★ MCS, PAS 63100:2024 statement: https://mcscertified.com/?p=7021
- [S36] Duracell Energy, BSI PAS on home batteries: https://duracellenergy.com/en/news/bsi-provides-best-practice-recommendations-for-home-battery-installs/
- [S37] Plug In Solar Explained, BS 7671 Amendment 4: https://www.pluginsolarexplained.co.uk/bs-7671-amendment-4/
- [S38] ★ IET Wiring Matters (March 2020), Section 722: https://electrical.theiet.org/wiring-matters/years/2020/79-march-2020/bs-76712018plusa1/
- [S39] ★ IET Wiring Matters (September 2023), EV Code of Practice: https://electrical.theiet.org/wiring-matters/years/2023/97-september-2023/fifth-edition-of-the-iet-code-of-practice-for-electric-vehicle-charging-equipment-installation/
- [S41] ★ IET Wiring Matters (March 2022), ring final circuit test: https://electrical.theiet.org/wiring-matters/years/2022/89-march-2022/resistance-readings-for-step-3-of-the-ring-final-circuit-test/
- [S43] ★ BEAMA, circuit breaker selection for LED lighting: https://www.beama.org.uk/static/b40aa7b9-f1c4-487a-a8f172067978517b/BEAMA-Guide-to-Circuit-breaker-Selection-for-LED-Lighting.pdf
- [S65] TLC Direct, diversity (On-Site Guide reproduction): https://www.tlc-direct.co.uk/Figures/Tab6.2.htm

### Factory, machinery and control panels

- [S44] Rowse Automation, control panel wiring colour codes: https://www.rowse-automation.co.uk/blog/post/control-panel-wiring-colour-codes
- [S45] IET engx attachment, EN 60204-1 conductor colours: https://engx.theiet.org/cfs-file/__key/telligent-evolution-components-attachments/00-04-00-00-00-02-12-30/infoplc_5F00_net_5F00_tinfo12.pdf
- [S46] ★ Schneider Electric, pushbutton and pilot light colours: https://blog.se.com/industry/machine-and-process-management/2022/08/25/how-to-choose-the-right-pushbuttons-pilot-lights-color-for-your-machine-interface
- [S47] Machinery Safety 101, emergency stop categories: https://machinerysafety101.com/series/emergency-stop/
- [S48] IET engx, 230 V control circuit: https://engx.theiet.org/f/wiring-and-regulations/31616/230v-control-circuit
- [S49] ★ Omron, EN 60947 rated currents of three-phase motors: https://www.manualslib.com/manual/346738/Omron-En-60947.html?page=21
- [S50] ★ Schneider Electric, Electrical Installation Guide, motor control: https://www.electrical-installation.org/enwiki/Motor_control_systems
- [S51] ★ ABB, motor starting solutions: https://library.e.abb.com/public/86d98d43ec394d63841658bf28be428c/1SFC100125C0346_en_A_Solution%20Guide_%20Motor%20Starting%20Solutions.pdf
- [S52] ★ Lovato Electric, contactor utilisation categories: https://academy.lovatoelectric.com/faq-items/what-is-the-utilization-category-of-a-contactor/?lang=en
- [S53] ★ Schneider Electric FAQ, star-delta overload setting: https://www.se.com/uk/en/faqs/FA136856
- [S113] ★ Electricity at Work Regulations 1989: https://www.legislation.gov.uk/uksi/1989/635/contents/made
- [S116] ★ PUWER 1998: https://www.legislation.gov.uk/uksi/1998/2306/contents/made
- [S117] ★ HSE, PUWER overview: https://www.hse.gov.uk/work-equipment-machinery/puwer-overview.htm
- [S118] ★ GOV.UK, Supply of Machinery (Safety) Regulations 2008: https://www.gov.uk/government/publications/supply-of-machinery-safety-regulations-2008/supply-of-machinery-safety-regulations-2008-great-britain

### Loads

- [S55] ★ R-Tech, I-MIG 180 owner's manual: https://r-techwelding2.justapplications.co.uk/media/attachment/file/m/i/mig180_mig_welder_owners_manual_2017-10.pdf
- [S56] ★ Warco, WM250V lathe: https://www.warco.co.uk/products/wm-250v-lathe-inverter-drive-variable-speed
- [S57] ★ Warco, WM18 mill: https://warco.co.uk/products/wm18-milling-machine-variable-speed-r8
- [S58] Greenvill, Record Power BS350S bandsaw: https://www.greenvill.co.uk/products/record-power-bs350s-bandsaw
- [S59] World of Power, SIP Airmate TN3/150-SRB compressor: https://worldofpower.co.uk/sip-airmate-tn3-150-srb-trade-belt-drive-air-compressor-150-litre-13cfm-06290.html
- [S60] ★ Hypertherm, Powermax30 AIR: https://www.hypertherm.com/hypertherm/powermax/powermax30-air
- [S61] ★ National Energy Action, how much electrical items cost to run: https://nea.org.uk/wp-content/uploads/2024/10/How-much-do-electrical-items-cost-to-run-no-print-marks.pdf
- [S62] ★ National Energy Action, what uses watt: https://www.nea.org.uk/wp-content/uploads/2021/07/advice_leaflet_what_uses_watt.pdf
- [S63] Bath & West Community Energy, appliance demand: https://www.bwce.coop/wp-content/uploads/2020/08/Appliance-Electricity-Demand.pdf
- [S64] ★ Mitsubishi Electric, Ecodan PUZ-WM85VAA: https://www.mitsubishi-electric.co.nz/materials/hotwater/brochures/puz-wm85vaa-bs_pi_sheet.pdf
