# Vehicle locations view

The vehicle locations view records where each part is fitted, both in words and as a marker on a picture of the vehicle. It answers the question every loom raises six months later: where did I put that relay?

## Opening the view

Choose **Tools › Component locations (vehicle view)**, or **Vehicle** on the tool rail. The view fills the window: the vehicle on the left, the list of parts on the right.

**Close** (or <kbd>Esc</kbd>) goes back to the drawing.

## The picture

To start with, LoomWright shows a plain outline of a vehicle seen from above, with the front to the left and the engine bay, cab and rear marked.

For a better picture, click **Use a picture…** and choose a photo or drawing of your vehicle, ideally from above. PNG, JPEG, SVG and WebP pictures work. LoomWright saves the picture inside the project file, so it travels with the project. To keep the file small, it stores photos as JPEG no larger than 1600 pixels on the longer side; SVG drawings are kept as they are. **Use the plain outline** goes back to the outline.

## Recording where parts are

The list on the right shows every part with a reference: fuses, relays, switches, loads, connectors and so on. For each part:

- type where it lives in the box, such as `Under seat box` or `Dash centre`. LoomWright suggests places you have already typed. This is the same **Location** as in the part's Properties; see [Part data](08-part-data.md#locations).
- click **Place**, then click on the picture where it is fitted. A red marker with the reference appears there. <kbd>Esc</kbd> cancels placing.
- drag a marker to move it, or click **Move** and click the new spot.
- the remove button beside **Move** removes the marker.

The panel counts how many parts there are and how many are placed. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes changes in this view too.

Markers belong to a part's reference and type, so a part drawn on several sheets has one marker.

## Using the locations

- **Export SVG** and **Export PNG** save the picture with its markers.
- The build pack's **Component locations** section prints the picture with its markers and a table of every part's location. See [Build pack and wire labels](14-build-pack-and-labels.md).
- The parts list shows each line's locations, which helps when ordering for one area of the vehicle at a time.
