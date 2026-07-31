# Browser QA

## Environment

- Date: 2026-07-27
- Entry point: `http://127.0.0.1:4175/workflows.html`
- Browser surface: Codex in-app browser
- Wide check: 1280 × 720
- Narrow check: 390 × 844

## Round 1 checks

### Static checks

- `lib/app.js` and `lib/icons.js` passed `node --check`.
- `specs.md` stayed within the 500-line Agent File limit at 494 lines.
- All five HTML files and their document-relative local references resolved.
- No root-relative links, trailing whitespace, TODOs, visible annotation labels, or review prose were found in rendered source files.

### Spreadsheet structure and outputs

- The grid exposed 26 coordinate headers whose text joined to `ABCDEFGHIJKLMNOPQRSTUVWXYZ`.
- The named field headers were Order ID, Customer, Email, Status, Total, Paid, and Ordered at.
- The grid reported 1,000 logical rows, rendered a bounded 28-row review window, and included 24 blank visible rows after four populated records.
- The populated Paid cells rendered `Yes`, `No`, `Yes`, and `Yes`; no `.switch-visual` input control remained in the rendered grid.
- No New record or Save record button existed in the rendered DOM.

### Spreadsheet interactions

- Double-clicking Order ID opened `Configure Order ID` with Number field, Plain text format, `bigint` storage, and Required selected.
- Double-clicking blank cell B5 opened a cell editor with zero cell padding, no input border or radius, and an input height matching the 34px cell height.
- Committing `Pine & Co.` into B5 left the value in the cell without a record-form row.
- Committing blank C5 after B5 contained data created one invalid cell with a corner marker and absolutely positioned `Email is required` tooltip.
- The invalid cell and its peer row remained the same 34px height, proving the error did not expand the row.
- Filling the bottom row-count input with 250 and activating Add Rows changed logical capacity from 1,000 to 1,250 and updated the status and toast.
- The linked `?state=error` route restored the spreadsheet cell-error state with C5 selected.

### Responsive behavior

- At 1280 × 720, the page had no document-level horizontal overflow and the sheet showed its own two-axis scrolling area.
- At 390 × 844, the page still had no document-level horizontal overflow; the sheet retained horizontal and vertical scrolling and the Add Rows controls remained visible.
- The mobile navigation opened with its backdrop and closed again without changing spreadsheet state.

### Browser health

- No console warnings or errors were recorded through default, header-panel, blank-cell editing, validation, Add Rows, linked error, workflow-index, and mobile-navigation checks.

Evidence:

- `table-desktop.jpg`
- `table-cell-error.jpg`
- `table-mobile.jpg`

## Round 2 checks

### Toolbar and configuration copy

- The rendered table contained no `.table-toolbar`; the spreadsheet canvas begins directly beneath the product top bar.
- Double-clicking Order ID still opened Configure Order ID, and its disclosure label read Advanced.

### Field-specific editors

- Double-clicking blank Status cell D5 opened a 33px edge-to-edge `select` with Processing, Ready, Shipped, and Cancelled options; choosing Ready committed Ready output.
- Double-clicking blank Total cell E5 opened a 33px currency-prefixed Price input with zero cell padding; committing 1640 restored `₱1,640.00` output.
- Double-clicking blank Paid cell F5 opened an accessible checkbox with `role="switch"`; activating its track committed Yes output.
- Double-clicking blank Ordered at cell G5 opened a 33px `datetime-local` input; committing `2026-07-25T10:40` restored `Jul 25, 10:40 AM` output.

### Responsive behavior

- At 1280 × 720, the sheet showed the full product top bar, field bands, rows, and Add Rows controls without document overflow.
- At 390 × 844, the document still had no horizontal overflow; the sheet retained its own two-axis scroll and the row-adder remained visible.

Evidence:

- `table-round-2-desktop.jpg`
- `table-round-2-switch.jpg`

## Round 3 checks

### Persistent edit lifecycle

- After Total was reconfigured from Price to Number, double-clicking E1 exposed a 33px `type="number"` editor with zero cell padding, right alignment, and the parsed value `1280.00`.
- Filling the Number editor with 2500 and pressing Enter left the Number editor active; clicking another cell committed and restored `₱2,500.00` output.
- Choosing Shipped in blank Status cell D5 left the Select editor active; click-away committed the Shipped pill.
- Toggling blank Paid cell F5 left the Switch editor active; click-away committed Yes output.
- Filling blank Ordered at cell G5 and pressing Enter left the `datetime-local` editor active; click-away restored `Jul 25, 10:40 AM` output.

### Inline empty-header naming

- Double-clicking empty header H opened one edge-to-edge input labelled Name column H with no dialog or context panel.
- Filling Shipping note and pressing Enter kept the header input active.
- Clicking outside committed Shipping note as `column-h`, marked all 28 rendered H cells as named-column cells, and updated the status to 8 named columns.
- Double-clicking the committed Shipping note header opened Configure Shipping note with Text field, Plain text format, and text storage.

### Responsive behavior

- At 390 × 844, inline header naming stayed within the 148px field header, the document had no horizontal overflow, and the sheet retained its own two-axis scroll.

Evidence:

- `table-round-3-number.jpg`
- `table-round-3-header-name.jpg`

## Round 4 checks

### Spreadsheet-style errors

- Entering `GRAND TOTAL` in blank Total cell E5 kept the Price editor active after Enter; click-away committed `#VALUE!` and opened a titled Error popover.
- The popover explained that Total expects a number and preserved `GRAND TOTAL` as the raw value for the next edit.
- The rendered Error popover contained no button or link labelled Fix.
- The popover flipped to the left of Total cell E5 at 1280 × 720; its measured bounds were 586–906px inside the 1280px viewport.
- The dedicated error-state URL rendered Email as `#ERROR!` with the message “Email is required before this row can be saved.” and no active editor.

### Total editor styling and lifecycle

- Double-clicking Total E5 produced a 147px input within a 148px cell, with zero cell padding and no cell box shadow while editing.
- The peso prefix was absolutely positioned inside the editor and the single input used 25px left padding, preventing the prior clipped-caret treatment.
- Filling `1280.00` and pressing Enter left one editor active with the value intact.
- Clicking another cell committed the value and restored formatted `₱1,280.00` output.

Evidence:

- `table-round-4-error.jpg`
- `table-round-4-price.jpg`

## Round 5 checks

### Enter commit and cell selection

- Filling Total E5 with `439.99` and pressing Enter removed the editor and restored formatted `₱439.99` output.
- Committing invalid Email C5 as `ops` produced `#ERROR!`; while selected it retained the standard 2px selection inset.
- Selecting another cell removed Email’s selection and left its computed box shadow as `none` while preserving the error token and corner marker.

### Sticky row number and row validation

- With the sheet horizontally scrolled 360px, the sticky row-number element remained the top element at the row-header coordinates; the error cell no longer covered line 5.
- Row 5 received `data-row-invalid="true"`, a red foreground, a soft red background, and an accessible explanation after required Customer was missing and Email was invalid.
- Focusing row 5 opened one fully visible `Row not added` popover and closed the cell-level popover, preventing stacked explanations.
- The row explanation reported `Customer is required` and the invalid Email value; it contained no Fix action.
- Entering Customer and a valid Email removed both the cell error and row error, restored the normal row-number color, and removed the row tooltip.
- At 390 × 844, the document had no horizontal overflow, the sheet retained its own horizontal scroll, and the 318px row tooltip remained fully inside the viewport with no cell popover underneath it.

Evidence:

- `table-round-5-validation.jpg`
- `table-round-5-row-error.jpg`

## Round 6 checks

### Text defaults and row-error grouping

- Double-clicking unnamed H5 produced an editor with `data-editor-type="text"` and native `type="text"`.
- Entering `002` and pressing Enter preserved both stored and displayed values as `002` rather than coercing them to a number.
- Invalid Email C5 with missing Order ID and Customer produced exactly three row bullets labelled Order ID, Customer, and Email.
- The bullet details rendered at normal weight, the column labels remained emphasized, and the popover stayed fully inside the desktop viewport.

### Clear, copy, undo, and redo

- Backspace on selected Customer B4 cleared `Luna Home` and immediately marked row 4 invalid because Customer is required.
- Ctrl+Z restored `Luna Home` and cleared the row error; Ctrl+Shift+Z cleared the value and restored the row error; a second undo returned the grid to its initial state.
- Ctrl+C on selected Customer B4 triggered the native copy path and displayed `Cell copied · Luna Home`.
- The implemented handlers also accept Command+C, Command+Z, Command+Shift+Z, Delete, and Ctrl+Y.
- At 390 × 844, the three-bullet row popover measured 318px, stayed fully inside the viewport, and the document retained no horizontal overflow while the sheet remained independently scrollable.

Evidence:

- `table-round-6-row-errors.jpg`
- `table-round-6-commands.jpg`

## Round 7 checks

### Row and column reordering

- The table rendered 52 draggable column handles across the 26 coordinates and 26 field headers, plus 28 draggable row-number handles.
- Alt+Right on Order ID moved its header and `1084` value from A to B while Customer and `Northstar Market` moved to A; Alt+Left restored the initial order.
- Alt+Down on row 1 moved record `1084` below record `1083`, renumbered the visible positions to 1 and 2, and Alt+Up restored the initial order.
- After a column reorder, ArrowRight moved the selected cell from visual column A to visual column B rather than following the pre-reorder DOM snapshot.
- Reorder confirmations explicitly say `Display order only` and no external write was attempted.

### Red cell and unnamed-column errors

- Invalid Email C5 rendered a red `#ERROR!` token, red corner marker, 6px red popover left border, and red Error title.
- Selecting another cell removed the invalid cell’s box shadow while preserving its red token and corner marker.
- Alt+Right on unnamed column H kept H in place, marked its coordinate and field header red, and opened `Column not moved` with “Add a column name before reordering column H.”
- The blocked-column popover used a 6px red left border and red title, contained no Fix action, and remained inside the 1168 × 964 viewport.
- At 390 × 844, the blocked-column popover measured 304px wide with bounds 78–382px, the document had no horizontal overflow, and the sheet retained independent horizontal scrolling.

Evidence:

- `table-round-7-cell-error.jpg`
- `table-round-7-column-error.jpg`

## Round 8 checks

### Empty-column movement and gap validation

- All 52 coordinate/header drag handles remained draggable, including the 19 initially unnamed trailing columns.
- Moving empty column H left into G completed the reorder, moved Ordered at to H, then marked only field header G invalid and opened `Missing column name`.
- The G coordinate cell stayed neutral, leaving exactly one red cell for the single missing column name.
- Moving Ordered at from G to J created three interior gaps and marked exactly field headers G, H, and I invalid; no coordinate cell received an error state.
- Each invalid header received its own `Missing column name` popover, while only the first gap opened automatically after the drop.
- Naming gap G as Notes cleared G and left only H and I invalid, while the summary increased to 8 named columns.

### Navigation and responsive behavior

- The table sidebar no longer contains Columns; Records and Changes remain visible.
- At 390 × 844, three interior header gaps remained marked, the open 304px popover stayed within bounds 8–312px, the document had no horizontal overflow, and the sheet retained horizontal scrolling.
- JavaScript keyboard reordering exercised the same post-drop layout validation function used by pointer drop handling.

Evidence:

- `table-round-8-empty-drop.jpg`
- `table-round-8-column-gaps.jpg`

## Round 9 checks

### Error title and header alignment

- The missing-column popover title computed to 16px with 10px spacing below it.
- At 1168 × 964, the popover top measured 109px while the invalid field header top measured 110px, producing the intended 1px overlap without document overflow.
- The desktop popover remained clamped inside the visible sheet area with bounds 856–1160px.
- At 390 × 844, the title remained 16px, the top alignment remained -1px, and the popover stayed within the viewport at 78–382px.
- The narrow document had no horizontal overflow while the sheet retained independent horizontal scrolling.

Evidence:

- `table-round-9-error-popover.jpg`
- `table-round-9-narrow-error-popover.jpg`

## Round 10 checks

### Top-right error marker

- The unnamed-column marker now computes to a 9px × 9px red shape at `top: 0` and `right: 0` on the invalid field header.
- The marker uses an explicit top-right triangular clip and remains visible after the temporary popover closes.
- At 1168 × 964, the closed state showed one red top-right corner on field header F with no document overflow.
- At 390 × 844, the marker retained the same dimensions and position, the document had no horizontal overflow, and the sheet remained independently scrollable.
- Opening the narrow popover still produced the 16px title, -1px header alignment, and viewport-safe bounds of 78–382px.

Evidence:

- `table-round-10-top-error-marker.jpg`

## Round 11 checks

### Invalid-header row alignment

- In the in-app Browser, the invalid header previously computed as `position: relative` with `top: 26px`, placing it at 110–148px while row 1 occupied 122–156px.
- After preserving sticky positioning, field header F occupies 84–122px and its first record cell starts exactly at 122px, with no overlap.
- The coordinate band remains at 58–84px, so the invalid header now stays in the normal field-header band.
- At 390 × 844, the header and first record retain the same 122px shared boundary, the document has no horizontal overflow, and the sheet remains independently scrollable.
- The top-right marker remains at `top: 0; right: 0`, while the open popover remains aligned 1px above the corrected header and inside the narrow viewport.

Evidence:

- `table-round-11-aligned-error-header.jpg`

## Round 12 checks

### Selection, hover delay, and stacking

- Moving Ordered at from G to J created invalid headers G, H, and I with zero visible popovers and no automatic-open attributes.
- Clicking invalid header G opened its popover immediately and raised the selected header to z-index 60 while neighboring invalid headers remained at z-index 32.
- With the selected popover overlapping header H, the popover remained visually above H's red fill and corner marker.
- The hover-only rule uses a one-second transition delay; the focus rule overrides that delay with zero seconds for immediate selected-state feedback.
- At 390 × 844, all three errors remained closed after reordering; selecting G opened one viewport-safe popover at 8–312px with no document overflow and independent sheet scrolling.

Evidence:

- `table-round-12-selected-popover.jpg`

## Round 13 checks

### Neutral error output

- Cell-level `#ERROR!` computed to `rgb(43, 43, 43)` at font weight 400 while the popover retained its red accent and title.
- Moving Ordered at to J created header errors G, H, and I, each showing `#ERROR!` at weight 400 with the same `rgb(246, 246, 246)` background as the valid Paid header.
- Each invalid header retained the red top-right corner and remained closed until selected.
- At 390 × 844, all three neutral error headers retained the same text, weight, and background with zero visible popovers, no document overflow, and independent sheet scrolling.

Evidence:

- `table-round-13-column-errors.jpg`
- `table-round-13-cell-error.jpg`
