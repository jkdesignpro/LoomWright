# Part data

Besides its electrical fields, every part can carry the information you need to buy it and find it again on the vehicle: a part number, a supplier, a price and where it is fitted. LoomWright gathers these into the parts list, the build pack and the vehicle locations view.

## Entering part data

Select a part. The **Part data** section of the Properties pane has four fields:

| Field | What to put in it |
| --- | --- |
| Part number | The maker's or supplier's part number, such as `DT06-2S` or a relay's catalogue number. |
| Supplier | Where you buy it. |
| Unit cost | The price of one, in the currency set under **Build** in the drawing settings. |
| Location | Where it is fitted, such as `Engine bay, left` or `Under seat box`. |

Earth symbols, splices, off-sheet references, net labels, text notes and group boxes have no part data, because they are not things you buy. (An earth stud, which you do fit, has.)

As you type a supplier or a location, LoomWright suggests the ones you have already used in the project.

For a **Connector (series)**, the housing part number LoomWright suggests is used as the part number unless you type your own.

> Part numbers that LoomWright fills in for you, such as connector housings and terminals, are a starting point. Check them against the maker's catalogue before ordering.

## The parts list and costs

The **Parts & costs** tab in the Lists pane lists everything you need to buy:

- Parts are grouped when they are the same component with the same value, part number and supplier: three 10 A blade fuses from one supplier make one line with a quantity of 3.
- A part drawn on several sheets with the same reference, such as a fuse box, is counted once.
- Each line shows the quantity, component, value, part number, supplier, unit price, line total, the references (such as `F1, F2`) and the locations.

Under the table are the totals for parts, for cable and for both, and how many lines still have no price. **Reports › Export parts and costs (CSV)** saves the list for a spreadsheet.

## Cable prices

Cable is priced by the metre, by size. Open the **Cable totals** tab in the Lists pane. Under the table, **Price per metre** has a box for each size used in the project; type the price you pay.

The cable totals then show, for each size, colour and insulation:

- how many wires and how many metres the drawing uses,
- **Buy (+15%)**: the metres to buy, with 15% added for waste and mistakes,
- the cost of that length.

**Missing lengths** counts wires of that kind with no length. Fill those in, or the totals come out short. The cable cost is included in the total on the **Parts & costs** tab.

## The currency symbol

Prices are plain numbers; LoomWright does not convert currencies. The **Currency symbol** under **Build** in the drawing settings (click an empty part of the sheet) is the symbol written in front of them. It starts as £.

## Locations

The **Location** field says where a part lives on the vehicle. It appears in the parts list and the build pack, and you can type it in the vehicle view as well, where you can also mark each part on a picture of the vehicle. See [Vehicle locations view](16-vehicle-locations.md).

Using the same wording for the same place, such as always `Under seat box`, keeps the parts list tidy.

Location is also one of the things **Edit › Find** can search.
