# Production Icon Inventory

Status: **Current-worktree implementation audit, 2026-08-04; recreation,
screenshot correction, and Task 00014F implementation checkpoint added
2026-08-05.** The user explicitly authorized this amendment to Frozen Spec
00003 and the production iconography implementation. It does not change the
Frozen architecture or accepted command behavior.

## Purpose And Scope

Use this file when planning a production icon cleanup or checking what a visible
symbol currently means. "Used" means renderable production source under
`src/plugins/**`, including conditional states, not only the icons visible in one
screenshot.

Included:

- shared inline SVG icons;
- local SVG and text glyphs used as controls;
- source badges, result marks, and CSS indicators that function like icons; and
- registered shared SVGs that are currently unused, because they affect cleanup.

Excluded:

- historical `wireframes/**`, generated `.build/**` and `public/assets/**`,
  tests, and Proof artifacts;
- browser-native checkbox, radio, select, progress, and file-input rendering;
- ordinary punctuation and text separators such as `/`, `-`, `·`, and `⌘F`;
  and
- decorative borders, dividers, and layout shapes with no semantic state.

## Shared Inline SVG Vocabulary In Use

The shared [`Icon` component](../../../src/plugins/app/components/icon.tsx) now
renders dependency-free 16 by 16 SVGs with a `0 0 24 24` view box,
`currentColor`, no fill, a 2px default stroke, round caps/joins, and
`aria-hidden="true"`. The surrounding control or copy owns the accessible name.

### Shell, Navigation, And Object Icons

| Icon name | What it is for | Current surfaces |
| --- | --- | --- |
| `sheet` | Open spreadsheet/file product context. | Workbench top bar. |
| `grid` | Tabular/connection identity and grid layout. | Authentication, Files, Import, Activity, view toggle, grid states. |
| `activity` | System activity/history navigation or neutral empty Activity. | Explorer/workbench headers and Activity empty state. |
| `account` | Signed-out identity fallback. | Authentication-required state. |
| `search` | Search/find and no-results state. | Files, explorer, and workbench search. |
| `folder` | PostgreSQL schema folder or Files navigation. | Folder cards and Activity back link. |
| `list` | List layout or saved-view identity. | Files view toggle and saved views. |
| `table` | PostgreSQL table/file or schema/view operation. | File cards, setup state, and Activity rows. |
| `plus` | New file or increased font size. | Files and formatting toolbar. |
| `import` | Import action or import operation. | Files and Activity rows. |
| `open` | External navigation or result link. | Explorer and Activity result/detail links. |
| `close` | Non-destructive close or dismiss. | Panels, dialogs, Activity, and Saved Views. |
| `chevron-right` | Command submenu disclosure. | Spreadsheet menus. |
| `ellipsis` | Row-specific actions. | Saved Views. |

### Formatting And Command Icons

| Icon name or family | What it is for | Current surfaces |
| --- | --- | --- |
| `undo`, `redo` | Navigate supported history. | Formatting toolbar. |
| `minus`, `plus` | Decrease or increase font size. | Formatting toolbar. |
| `bold`, `italic`, `underline` | Toggle text emphasis. | Formatting toolbar. |
| `text`, `paint-bucket` | Text or fill color; each is paired with a dynamic color rail. | Formatting toolbar. |
| `borders`, `chevron-down` | Open Borders; Chevron also discloses More. | Formatting toolbar. |
| `align-left`, `align-center`, `align-right` | Horizontal placement using five text rules. | Toolbar trigger and popover. |
| `align-top`, `align-middle`, `align-bottom` | Vertical arrow-to-rule placement. | Toolbar trigger and popover. |
| `wrap`, `clip`, `overflow` | Cell text wrapping behavior. | Toolbar trigger and popover. |
| `ellipsis-vertical` | More formatting. | Narrow formatting toolbar. |
| `check`, `mixed` | Checked or mixed command state. | Spreadsheet menus. |

### Source, Status, Result, And Operation Icons

| Icon name | What it is for | Current surfaces |
| --- | --- | --- |
| `file-spreadsheet` | Neutral CSV, XLSX, Google Sheets, or fallback source. | Import source cards and summary; format/provider remains visible text. |
| `database` | PostgreSQL destination. | Import review notice. |
| `warning` | Values-only, attributable import, or Activity recovery warning. | Import and Activity. |
| `success` | Successful import result. | Import terminal state. |
| `canceled` | Canceled import result. | Import terminal state. |
| `loader` | Active Files or Activity loading. | Explorer and Activity recovery. |
| `file-down` | Export operation kind. | Activity rows. |
| `operation` | Generic running operation kind. | Activity rows without a more specific mapping. |

## Shared SVGs Registered But Not Used

`sort`, `filter`, `clear`, `panel`, and `share` remain registered for accepted
or plausible future controls but are not rendered by production TSX. Do not
expose a new command merely to use one of these assets.

## Local Samples, Notation, And CSS State Tokens

| Mark or component | Why it remains local | Current surfaces |
| --- | --- | --- |
| Border placement component | One dotted two-by-two guide and ten selected-edge masks describe formatting results rather than reusable actions. | Borders popover. |
| Color rails and swatches | They preview effective user-selected values. | Text, fill, and border controls. |
| Border line samples | They preview solid, dashed, dotted, medium, thick, and double border treatments below a bold text-only label. | Borders popover. |
| `fx` | Typographic formula-strip cue, not an action. | Grid formula strip. |
| `1`, `2`, `3` | Numbered import progress notation. | Import steps. |
| Breadcrumb `›` | Non-interactive separator; command submenus use `chevron-right`. | Files, Import, Activity. |
| Account initials | Verified user monogram; `account` is only the fallback. | Signed-in headers. |
| Runtime, pulse, and unread dots | Compact CSS state tokens with adjacent or accessible text. | Headers, footers, and Activity. |
| Timeline node/line | One CSS-owned connected history component. | Activity detail. |
| Invalid-cell corner | Compact CSS triangle; expanded errors use `warning`. | Workbench grid. |

## Recreation Reference

The recreation plan combines the [Lucide icon catalog](https://lucide.dev/icons/)
with the visible desktop toolbar semantics in the [public Google Sheets
reference](https://docs.google.com/spreadsheets/d/1ZRfLqJ1WbaUQqVrZHEKgjbhzmtPUnhWo0jNYGguma2M/edit?usp=sharing).
Load the [2026-08-05 source capture](../../resources/2026-08-05-icon-recreation-sources.md)
for the observed toolbar order, verified Lucide names, and capture limits.
The source capture now includes user-supplied close-ups of the
[Borders](../../resources/2026-08-05-google-sheets-border-controls.png),
[horizontal alignment](../../resources/2026-08-05-google-sheets-horizontal-alignment.png),
and [vertical alignment](../../resources/2026-08-05-google-sheets-vertical-alignment.png)
popovers. Those close-ups control the placement-icon anatomy below.

Lucide owns the base geometry. The Sheets reference contributes compact
spreadsheet semantics, command grouping, typographic marks, color rails, and
border-placement previews. Do not copy Google SVG paths, logos, colors, or
brand treatment.

### Base Drawing Contract

- Draw each reusable Lucide-based icon on a `0 0 24 24` view box with no fill,
  `stroke="currentColor"`, 2px stroke, and round line caps/joins. Render normal
  toolbar icons at 16px and border-choice glyphs at about 20px. Border samples
  and alignment text/reference rules may use butt or square ends where the
  close-up requires crisp grid or text-line geometry.
- Keep one semantic name per icon. Use local composites only when a Lucide base
  cannot express the spreadsheet state, such as color rails, border placement,
  Clip, Overflow, numbered steps, or invalid-cell corners.
- Keep icons decorative inside labeled controls. Icon-only controls require an
  accessible name; tooltips remain required by Accepted Context.
- Use opacity and control styling for disabled/selected/pressed state. Do not
  redraw separate state icons or rely on color alone.
- Preserve accepted Tabular command behavior. Icon cleanup may change the mark,
  not the command, target, authorization, or interaction contract.

### Shared Icon Recreation Map

| Current name | Lucide base | Recreation description |
| --- | --- | --- |
| `sheet` | [`FileSpreadsheet`](https://lucide.dev/icons/file-spreadsheet) | Outline a document with a small internal row/column grid. Use this instead of a Google Sheets logo for the workbench mark. |
| `grid` | [`LayoutGrid`](https://lucide.dev/icons/layout-grid) | Four equal outlined tiles with consistent gutters; use for Tabular/connection identity and grid layout. |
| `activity` | [`RotateCcwClock`](https://lucide.dev/icons/rotate-ccw-clock) and [`Activity`](https://lucide.dev/icons/activity) | Split the current collision: circular-arrow clock for System activity/history navigation; pulse line for an otherwise generic running operation. |
| `account` | [`UserRound`](https://lucide.dev/icons/user-round) | Round head above a curved shoulder line; use only as the signed-out or missing-monogram fallback. |
| `search` | [`Search`](https://lucide.dev/icons/search) | Circular lens with a short lower-right handle. |
| `folder` | [`Folder`](https://lucide.dev/icons/folder) | Outlined folder with a raised tab; keep it neutral rather than provider-branded. |
| `list` | [`List`](https://lucide.dev/icons/list) | Three evenly spaced horizontal rows; use for list layout and saved-view identity. |
| `table` | [`Table2`](https://lucide.dev/icons/table-2) | Outlined table with one header rule and clear row/column divisions. |
| `plus` | [`Plus`](https://lucide.dev/icons/plus) | Equal horizontal and vertical strokes centered on the 24px canvas. |
| `import` | [`Import`](https://lucide.dev/icons/import) | Arrow entering a bounded corner/target; keep direction consistent anywhere import appears. |
| `open` | [`ExternalLink`](https://lucide.dev/icons/external-link) | Square corner plus arrow exiting upper-right. Use [`FileDown`](https://lucide.dev/icons/file-down) for export activity instead of overloading this icon. |
| `close` | [`X`](https://lucide.dev/icons/x) | Two equal diagonals crossing at center; use for every non-destructive close/dismiss control. |

### Registered Icon Recreation Map

| Registered name | Lucide base | Recreation description |
| --- | --- | --- |
| `chevron-down` | [`ChevronDown`](https://lucide.dev/icons/chevron-down) | Two strokes forming a shallow downward V. Use only where disclosure is not redundant under the command-surface contract. |
| `undo` | [`Undo2`](https://lucide.dev/icons/undo-2) | Left-turn arrow with a long return path, matching the familiar Sheets toolbar meaning. |
| `redo` | [`Redo2`](https://lucide.dev/icons/redo-2) | Mirror the Undo2 return arrow to the right. |
| `sort` | [`ArrowDownWideNarrow`](https://lucide.dev/icons/arrow-down-wide-narrow) | Down arrow paired with horizontal bars that shrink from wide to narrow. |
| `filter` | [`Funnel`](https://lucide.dev/icons/funnel) | Wide top opening narrowing into a short centered stem. |
| `clear` | [`Eraser`](https://lucide.dev/icons/eraser) | Angled eraser with a separated lower segment; reserve X for close. |
| `panel` | [`PanelRight`](https://lucide.dev/icons/panel-right) | Outer panel rectangle with a narrow right rail. |
| `share` | [`Share2`](https://lucide.dev/icons/share-2) | Three connected nodes; keep it distinct from ExternalLink. |

### Spreadsheet Toolbar Recreation Map

| Former mark or implemented family | Lucide base or composite | Recreation description |
| --- | --- | --- |
| `↶` / `↷` | [`Undo2`](https://lucide.dev/icons/undo-2) / [`Redo2`](https://lucide.dev/icons/redo-2) | Replace platform glyphs with mirrored return-arrow SVGs. Preserve disabled history state. |
| `−` / `+` | [`Minus`](https://lucide.dev/icons/minus) / [`Plus`](https://lucide.dev/icons/plus) | Use centered equal-weight strokes around the numeric font-size input. |
| `B`, `I`, `U` | [`Bold`](https://lucide.dev/icons/bold), [`Italic`](https://lucide.dev/icons/italic), [`Underline`](https://lucide.dev/icons/underline) | Use Lucide's typographic letterforms. Sheets validates the familiar letter-icon convention; retain Tabular's accepted Underline command rather than introducing Strikethrough. |
| `A` text color | [`Type`](https://lucide.dev/icons/type) plus a local color rail | Center the type glyph above a 2px horizontal swatch. The rail shows the effective text color and is not the only selected-state signal. |
| `▣` fill color | [`PaintBucket`](https://lucide.dev/icons/paint-bucket) plus a local color rail | Use the tilted bucket mark with the same rail geometry as Text color so the pair reads as one system. |
| `▦` and border grid | [`Grid2X2`](https://lucide.dev/icons/grid-2x2) as the trigger; one local guide-grid component with ten edge masks for the menu | Use a two-by-two grid. Every unselected outer or center segment is a dark dotted guide; selected segments replace the dots with a continuous solid stroke. Keep the accepted all/inner/horizontal/vertical/outer/left/top/right/bottom/none order. |
| `⌄` | [`ChevronDown`](https://lucide.dev/icons/chevron-down) | Use a compact disclosure chevron only for an actual compound trigger; omit it from the controls Context says must not show redundant chevrons. |
| `≡` / `≣` | [`TextAlignStart`](https://lucide.dev/icons/text-align-start), [`TextAlignCenter`](https://lucide.dev/icons/text-align-center), [`TextAlignEnd`](https://lucide.dev/icons/text-align-end), redrawn to the observed proportions | Use five text rules in a long-short-long-short-long rhythm. Left shares one left edge, center shares one center axis, and right shares one right edge. The pale-blue selected state belongs to the choice button, not the SVG. |
| `⇧` / `↕` / `⇩` | Local arrow-to-rule composites using [`ArrowUpToLine`](https://lucide.dev/icons/arrow-up-to-line) and [`ArrowDownToLine`](https://lucide.dev/icons/arrow-down-to-line) geometry | Top is an upward arrow below a top rule; middle is a center rule with a downward arrow above and upward arrow below, both pointing inward; bottom is a downward arrow above a bottom rule. Do not use block-alignment glyphs. |
| `↩` Wrap | [`TextWrap`](https://lucide.dev/icons/text-wrap) | Use stacked text lines with a curved return arrow. |
| `⊣` Clip | Local 24px composite | Draw two text lines terminating at a vertical cell boundary; nothing crosses the boundary and no arrow is shown. |
| `→` Overflow | Local 24px composite using [`ArrowRight`](https://lucide.dev/icons/arrow-right) geometry | Draw a text line continuing through a faint cell boundary and ending in a short right arrow. |
| `•••` More/actions | [`Ellipsis`](https://lucide.dev/icons/ellipsis) or [`EllipsisVertical`](https://lucide.dev/icons/ellipsis-vertical) | Use three equal circles. Choose one orientation per placement; the Sheets toolbar uses vertical overflow at its far edge. |
| `✓` / `—` menu state | [`Check`](https://lucide.dev/icons/check) / [`Minus`](https://lucide.dev/icons/minus) | Use Check for selected and Minus for mixed; do not reuse success-result art inside menus. |
| `›` navigation/disclosure | [`ChevronRight`](https://lucide.dev/icons/chevron-right) | Use for drill-in and submenu disclosure. Breadcrumb separators may stay typographic if they are not controls. |
| `×` Saved views close | [`X`](https://lucide.dev/icons/x) | Replace the text character with the same shared close icon used by other panels. |
| `fx` | Typographic `fx`; optional [`SquareFunction`](https://lucide.dev/icons/square-function) only for a future button | Keep the Sheets-like italic formula cue as text while it labels the formula strip; do not turn it into an icon-only action without accepted behavior. |

### Screenshot-Corrected Placement Anatomy

The placement menus use small diagrams of the result, not abstract alignment
objects. Recreate the visible geometry as follows:

| Control | Exact diagram grammar |
| --- | --- |
| Borders — All | Solid outer square plus solid center horizontal and center vertical rules, producing four visible cells. |
| Borders — Inner | Dotted outer square; solid center horizontal and center vertical rules. |
| Borders — Horizontal | Dotted outer square and center vertical guide; solid center horizontal rule only. |
| Borders — Vertical | Dotted outer square and center horizontal guide; solid center vertical rule only. |
| Borders — Outer | Solid outer square; dotted center horizontal and center vertical guides. |
| Borders — Left / Top / Right / Bottom | One corresponding outer edge is solid; every remaining outer and center segment stays dotted. |
| Borders — None | Every outer and center segment is dotted; no solid stroke appears. |
| Border accordion disclosures | Bold text-only Border visible, Border color, and Border style labels use `chevron-down` for the single expanded section and `chevron-right` for collapsed sections; Border visible is expanded initially. |
| Border color | Reuse the shared Reset, 80-color main grid, eight-color Standard row, and native Custom control used by text and background/fill color. Color circles are dynamic samples, not fixed icons. |
| Border style | The expanded section places six solid, medium, thick, dashed, dotted, and double line samples below its disclosure label. |
| Horizontal — Left / Center / Right | Five square-ended text rules in a long-short-long-short-long rhythm, anchored to the left edge, common center axis, or right edge respectively. |
| Vertical — Top | One horizontal rule at the top and one upward arrow rising from below toward that rule. |
| Vertical — Middle | One horizontal rule through the center, with a downward arrow above and an upward arrow below pointing inward toward it. |
| Vertical — Bottom | One horizontal rule at the bottom and one downward arrow descending from above toward that rule. |

Use one shared component per family: an edge-mask component for the ten Borders
choices, a five-rule component with an alignment parameter for horizontal
placement, and an arrow-to-rule component with a top/middle/bottom parameter
for vertical placement. This keeps proportions and stroke weight consistent
without treating each diagram as unrelated artwork.

### Badge And Indicator Recreation Map

| Former mark or implemented indicator | Lucide base or composite | Recreation description |
| --- | --- | --- |
| `CSV`, `XLSX`, `FILE` | [`FileSpreadsheet`](https://lucide.dev/icons/file-spreadsheet) plus visible source text | Use one neutral file-spreadsheet outline and retain the format as text. Do not squeeze four letters inside a 16px icon. |
| `G` Google Sheets source | Neutral [`FileSpreadsheet`](https://lucide.dev/icons/file-spreadsheet) unless an approved provider asset exists | Remove the improvised `G`; show `Google Sheets` as visible text. A later approved brand asset must remain separate from the Lucide set. |
| `DB` destination | [`Database`](https://lucide.dev/icons/database) | Three stacked database contours; pair with PostgreSQL destination text rather than putting `DB` inside the icon. |
| `!` warning/recovery | [`TriangleAlert`](https://lucide.dev/icons/triangle-alert) | Outlined warning triangle with centered exclamation mark. |
| Import/empty `✓` | [`CircleCheckBig`](https://lucide.dev/icons/circle-check-big) | Use for a successful outcome; an empty neutral collection should use no success icon unless the copy means all clear. |
| Canceled `×` | [`CircleX`](https://lucide.dev/icons/circle-x) | Encircle the X so canceled state cannot be confused with a close button. |
| Steps `1`, `2`, `3` | Local numbered-circle component | Use fixed-size circles with tabular numerals and explicit current/complete/upcoming states; this is progress notation, not a Lucide icon. |
| Account initials | Monogram; [`UserRound`](https://lucide.dev/icons/user-round) fallback | Keep verified initials when available and use the line icon only when a monogram cannot be formed. |
| Loading ring | [`LoaderCircle`](https://lucide.dev/icons/loader-circle) | Rotate the broken circular stroke; stop animation under reduced-motion and keep live status text. |
| Status/unread/pulse dots | Local circle tokens based on [`Circle`](https://lucide.dev/icons/circle) geometry | Centralize diameter, fill, outline, and motion; never use the dot without adjacent or accessible state text. |
| Timeline | Local circle-and-line component | Use a 7px outlined node and 1px connector with consistent spacing; no separate icon asset is required. |
| Invalid-cell corner | Local corner triangle; [`TriangleAlert`](https://lucide.dev/icons/triangle-alert) in expanded error UI | Preserve the compact red cell-corner signal, then use the full warning icon only where size and explanatory text are available. |

### Google Sheets Reference Boundaries

The visible Sheets toolbar also contains Print, Paint format, Currency,
Percent, decimal-place controls, More number formats, Merge cells, Hide menus,
Add sheet, and All sheets. If Tabular later accepts matching commands, suitable
Lucide bases include `Printer`, `PaintRoller`, `DollarSign`, `Percent`,
`DecimalsArrowLeft`, `DecimalsArrowRight`, `TableCellsMerge`, `ChevronUp`,
`SquarePlus`, and `List`.

Those observed controls are recreation references only. This cleanup must not
add them, replace Tabular's accepted four-menu command surface, or imply Google
Sheets parity.

## Production Cleanup Checkpoint

Task 00014F implements the accepted cleanup direction:

1. The shared `Icon` component is the canonical action/status vocabulary;
   dynamic color, border, and line-style samples remain local.
2. Export uses `file-down`, close and cancellation are distinct, checked/mixed
   differ from success, and command disclosure differs from breadcrumb text.
3. Platform-dependent formatting glyphs, Saved Views close/actions, loading
   rings, improvised import badges, and raw warning/result characters are gone.
4. CSV, XLSX, and Google Sheets remain visible source text beside one neutral
   `file-spreadsheet` mark; PostgreSQL uses `database`.
5. Icon-only controls retain accessible names, while every SVG stays
   decorative through `aria-hidden="true"`.
6. Task 00014G removes the redundant Border color/style label graphics, uses
   the visible `Border visible` heading, and keeps three-choice formatting
   popovers at their intrinsic width.
7. Task 00014H uses one exact ordered dynamic color palette for text,
   background/fill, and border color, then presents the three Border groups as
   a single-open accordion with Border visible expanded initially.

Remaining production decisions and gates:

1. Remove `sort`, `filter`, `clear`, `panel`, or `share` only if their future
   accepted commands do not need the registered geometry.
2. Consider promoting repeated per-surface icon dimensions into shared CSS
   size tokens during a later system-wide styling pass.
3. Retain Tasks 00014F through 00014H's passed iconography, density, palette,
   and accordion evidence; final human review remains the acceptance gate.
