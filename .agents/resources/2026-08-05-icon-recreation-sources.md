# Icon Recreation Source Capture

Captured: 2026-08-05, read-only, through the Codex in-app Browser.

This Resource File preserves the source observations used to add recreation
guidance to Spec 00003's production icon inventory. It is not a product or
behavior authority.

## Google Sheets Toolbar Reference

Source: [public Sandbox spreadsheet](https://docs.google.com/spreadsheets/d/1ZRfLqJ1WbaUQqVrZHEKgjbhzmtPUnhWo0jNYGguma2M/edit?usp=sharing)

Observed visible desktop toolbar, in order:

1. Search menus, Undo, Redo, Print, Paint format, and Zoom.
2. Currency, Percent, Decrease decimal places, Increase decimal places, and
   More number formats (`123`).
3. Font, Decrease font size, numeric font size, and Increase font size.
4. Bold, Italic, Strikethrough, Text color, Fill color, Borders, disabled Merge
   cells, disabled merge-type disclosure, and More.
5. Hide menus; below the toolbar, the name box/menu and italic `fx` formula cue.
6. At the sheet-tab bar, Add sheet and All sheets.

Visual observations:

- Icons are compact, monochrome line or typographic marks inside a dense pale
  toolbar, with separators between command groups.
- Text color uses an `A`-like mark with a color rail beneath it. Fill color uses
  a tilted fill/paint mark with the same rail treatment.
- Borders uses a small cell matrix. More uses a vertical three-dot overflow
  mark. Disabled merge controls remain recognizable through reduced contrast.
- The blank spreadsheet and toolbar were inspected in a Filipino-localized UI;
  accessible labels above are normalized to their English command meanings.

## User-Supplied Correction Screenshots

These close-ups were supplied on 2026-08-05 after the initial inventory draft.
They supersede its generic interpretation of the Borders and alignment marks:

- [Borders popover](2026-08-05-google-sheets-border-controls.png): ten
  placement diagrams use dotted two-by-two guide grids and solid selected-edge
  masks. The same popover shows an angled border-color pen over a color rail
  and a stacked border-style sample, each with its own disclosure chevron.
- [Horizontal alignment popover](2026-08-05-google-sheets-horizontal-alignment.png):
  left, center, and right each use five lines in a
  long-short-long-short-long rhythm. The selected left choice is indicated by
  the button background, not by a different icon color or fill.
- [Vertical alignment popover](2026-08-05-google-sheets-vertical-alignment.png):
  top and bottom use an arrow pointing toward a horizontal boundary rule;
  middle uses two opposing arrows pointing inward toward a center rule. The
  selected bottom choice is indicated by the button background.

The first browser pass did not open menus or popovers. These three correction
screenshots now cover the open Borders, horizontal-alignment, and
vertical-alignment popovers, including selected left and bottom choices.
Mobile, high-contrast, hover, and other alternate states remain uncaptured.
Google artwork is used only for interaction semantics, grouping, density, and
compound-icon treatment; no Google SVG paths or brand artwork were extracted.

## Lucide Reference

Source: [Lucide icon catalog](https://lucide.dev/icons/)

The catalog customizer and rendered SVG metadata exposed the standard 24 by 24
view box, no fill, `currentColor`, 2px stroke, and round line caps/joins.

Names verified in the live catalog for the recreation mapping include:

- `file-spreadsheet`, `sheet`, `layout-grid`, `rotate-ccw-clock`, `activity`,
  `user-round`, `search`, `folder`, `list`, `table`, `table-2`, `plus`,
  `import`, `external-link`, `x`, `chevron-down`, and `chevron-right`;
- `undo-2`, `redo-2`, `arrow-down-wide-narrow`, `funnel`, `eraser`,
  `panel-right`, `share-2`, `minus`, `type`, `paint-bucket`, `grid-2x2`,
  `ellipsis`, `ellipsis-vertical`, `check`, and `square-function`;
- `text-align-start`, `text-align-center`, `text-align-end`, `text-wrap`,
  `arrow-up-to-line`, and `arrow-down-to-line`; and
- `database`, `triangle-alert`, `circle-check-big`, `circle-x`,
  `loader-circle`, `circle`, `square-plus`, `printer`, `paint-roller`,
  `dollar-sign`, `percent`, `decimals-arrow-left`, `decimals-arrow-right`,
  `strikethrough`, and `table-cells-merge`.

Lucide is the geometry reference. Google Sheets is the semantic and interaction
reference. Tabular's Accepted Context remains authoritative for which commands
exist and how they behave.
