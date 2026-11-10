# Revision history and save points

LoomWright keeps two kinds of history:

- **Revisions** are versions you issue on purpose, such as when you print a drawing set to build from. They are stored in the project file, listed in the revision table on every sheet, and can be compared and gone back to.
- **Save points** are copies LoomWright keeps by itself, on this computer, as you work. They are a safety net, like the history of a word processor.

Both are in the **History** pane (the **History** button on the tool rail) and the **Revision** menu.

## Issuing a revision

Issue a revision whenever a drawing set leaves your hands: when you print it to build from, send it to someone, or finish a stage of the build.

1. Choose **Revision › Issue revision**, or **Issue revision…** in the History pane.
2. Check the **Revision** letter. LoomWright suggests the next one: A, then B, C… Z, then AA. If you number revisions instead, such as `P3`, it suggests `P4`.
3. Check the **Date** and **By**, and write a **Description** of what changed, such as `Fridge feed moved to 4 mm²`.
4. From the second revision on, the dialog lists the **Changes since** the last revision, and offers **Cloud the changes since…** (see [Revision clouds](#revision-clouds)).
5. Click **Issue revision**.

LoomWright records the whole project as it is now: every sheet, part, wire and setting. The project's revision letter and date (as shown in the title block) are set to match, the revision table on each sheet lists it, and a save point is kept.

The revision is stored in the project, so save the project afterwards.

## The History pane

At the top, under **Revision**:

- **Current revision**, how many revisions have been issued, and how many changes have been made since the last one.
- **Issue revision…** and **Compare…**.
- **Revision clouds on drawings**: see below.

Under **Issued revisions** each revision is listed, newest first, with its date, who issued it and its description, and three buttons:

- **Compare with now** shows what has changed since that revision.
- **Open copy** opens the project as it was at that revision in a new tab, to look at or print. It is a separate copy; close its tab when you are done.
- **Restore** puts the drawings back to how they were at that revision. The list of revisions is kept, so you can go forward again by restoring a later one, and **Restore** can be undone with <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

## Comparing revisions

**Revision › Compare revisions**, or **Compare…** in the History pane, compares any two revisions, or a revision and **Now (unissued)**. Choose **From** and **To**. LoomWright lists every difference in plain words: project details changed; harnesses and sheets added, removed or renamed; parts and wires added and removed; and changes to part fields and part data, and to wire ends, colours, sizes, lengths, circuits and harnesses.

**Export list (CSV)** saves the list of changes, for example to send with a revised drawing set.

## Revision clouds

On a drawing, a revision cloud is a scalloped outline drawn round what changed, so whoever builds from a revised drawing can see what is new.

Under **Revision clouds on drawings** in the History pane, pick a revision. LoomWright draws clouds round the parts and wires that have changed since it, on every sheet, on screen, in print and in exports. Choose **None** to turn them off.

When you issue a revision with **Cloud the changes since…** ticked, the drawings show clouds round what changed between the previous revision and this one.

## Save points

A save point is a copy of the whole project, kept by LoomWright in its own storage on this computer. They are kept:

- every time you save,
- every ten minutes while you have unsaved changes,
- when you issue a revision,
- when you choose **Revision › Keep a save point now** or click **Keep a save point now** in the History pane.

**Save points on this computer**, at the bottom of the History pane, lists them, newest first, with when and why each was kept. The last 40 for each project are kept; older ones are deleted.

For each save point, **Open copy** opens it in a new tab and **Restore** puts the project back to how it was then. Restoring can be undone, and keeps the project's issued revisions.

Save points are not stored in the project file. They stay on the computer where they were made, in the app's own storage (see [What LoomWright remembers between sessions](06-files-and-saving.md#what-loomwright-remembers-between-sessions)). In a browser, clearing site data deletes them. They do not replace saving your project, or keeping a backup copy of it somewhere else.
