# Wireframe Review Notes

## Round 1 — 2026-07-27 — Spreadsheet table canvas

### Changed

- Created a major revision from `r002-department-table-navigation` because the table layout, record-entry flow, validation state, and row-capacity model changed materially.
- Preserved the accepted Operations/Finance department-to-table navigation.
- Rebuilt the table screen as a spreadsheet canvas with an A–Z coordinate band, a separate field-name row, numbered body rows, four populated records, and blank editable rows within a 1,000-row logical sheet.
- Removed New record, Save record, the persistent record-form row, nested draft inputs, and inline validation copy.
- Rendered Paid values as the Yes/No output format while retaining Switch as the field/editor type in column configuration.
- Made active cell editors fill the complete cell without an inset form-control box.
- Replaced row-expanding validation with a corner marker and floating tooltip that appears on hover, focus, or selection.
- Added a bottom number input and Add Rows action that increases logical sheet capacity.
- Added named-header double-click to open the column configuration panel; unnamed headers H–Z continue to open Add column.

### Feedback applied

- Browser Comment 1: read cells use output formats rather than input controls.
- Browser Comments 2 and 3: spreadsheet cells have no nested padding treatment, and errors use a cell marker/tooltip instead of inline copy.
- Browser Comments 4 and 5: removed New record and Save record.
- Browser Comment 6: added a bottom row-count input and Add Rows.
- Browser Comment 7: exposed A–Z coordinates and a 1,000-row logical sheet with blank editable rows.
- Browser Comment 8: interpreted “Cannot double click headers” as a missing interaction and made named headers open configuration on double-click.

### Review now

- Whether the coordinate band and separate field-name row read as the right blend of spreadsheet and PostgreSQL table semantics.
- Whether Yes/No reads correctly as the Paid output format while Switch remains an editor choice.
- Whether blank rows, edge-to-edge editing, and the cell-error marker/tooltip feel spreadsheet-native.
- Whether Add Rows belongs at the visible bottom of the canvas and uses the right default amount.
- Whether named-header double-click should configure the field, as implemented, or be disabled entirely.

### Simulated or deferred behavior

- The sheet reports 1,000 logical rows but renders a bounded visible window for the wireframe; production virtualization and remote window loading remain implementation concerns.
- Cell edits, validation, column changes, and row-capacity changes are browser-only simulations and do not write to PostgreSQL.
- Blank-row promotion still depends conceptually on accepted draft and database validation boundaries, but no record-form controls are shown.

### Open questions

- Should blank H–Z field headers remain available for naming, or should only one next empty PostgreSQL column be actionable?
- Should Add Rows default to 100, 1,000, or remember the user's previous amount?

### Approval path

If Round 1 is approved, `r003-spreadsheet-table-canvas` becomes the forward table-grid direction and the next step is the next requested wireframe feedback round. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 2 — 2026-07-27 — Field-specific spreadsheet editors

### Changed

- Removed the complete All records, Filter, Sort, Fields, and record-count toolbar row so the sheet begins directly below the product top bar.
- Shortened Advanced PostgreSQL details to Advanced in the column configuration panel.
- Made Status cells reveal an edge-to-edge select input on double-click.
- Made Total cells reveal a currency-prefixed price input on double-click and restore formatted currency output after commit.
- Made Paid cells reveal an accessible switch on double-click while retaining Yes/No output at rest.
- Made Ordered at cells reveal a native date-time field on double-click and restore the compact formatted date after commit.

### Feedback applied

- Browser Comment 1: renamed the disclosure to Advanced.
- Browser Comment 2: removed the entire secondary table toolbar row.
- Browser Comments 3–6: matched each double-click editor to the column field type: Select, Price, Switch, and Date and time.

### Review now

- Whether the sheet has enough context without the removed view/filter/sort toolbar.
- Whether each double-click editor feels native to its field while still filling the spreadsheet cell.
- Whether Status should commit immediately after choosing an option, as simulated.
- Whether Price and Ordered at return to the expected output formatting after commit.

### Simulated or deferred behavior

- Field edits remain browser-only simulations and do not write to PostgreSQL.
- The Select option registry, currency/locale rules, timezone handling, and production validation remain intentionally bounded for the wireframe.
- The sheet still reports 1,000 logical rows while rendering a bounded visible window.

### Open questions

- Should a switch toggle commit immediately, or remain in edit mode until the user presses Enter, Tab, or leaves the cell?
- Should the date-time editor expose a timezone choice, or should timezone remain an Advanced column setting?

### Approval path

If Round 2 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 3 — 2026-07-27 — Persistent editors and inline column naming

### Changed

- Kept cell editors active after typing, pressing Enter, choosing a Select option, toggling a Switch, or changing a date-time value.
- Returned a cell to formatted output only after click-away or Tab; Escape still cancels the edit.
- Made editor selection follow the column’s current configured Field instead of its original hard-coded column identity.
- Added a true edge-to-edge Number input with numeric alignment when a column is changed to the Number field.
- Re-rendered existing cells after a field configuration change so old Select-pill styling does not remain on Number fields.
- Replaced the empty-header Add column dialog with a single inline column-name input.
- Made a committed inline name create a default Text column whose later double-click opens the normal configuration panel.

### Feedback applied

- Browser Comment 1: repaired the Number-field editor and stale output styling after changing field type.
- Browser Comment 2: empty headers now request only the column name inline.
- Direct request: input, Select, Switch, and date-time editors remain visible until the user leaves the cell.

### Review now

- Whether click-away is the correct boundary for restoring formatted output.
- Whether Tab should continue to commit and move away as the keyboard equivalent of click-away.
- Whether the Number editor’s right alignment and native stepper treatment read correctly.
- Whether naming an empty header as a default Text column is sufficient before optional configuration.

### Simulated or deferred behavior

- Field changes, values, and newly named columns remain in-memory wireframe state and reset on reload.
- Production schema writes, numeric validation, migrations, and concurrent edits remain deferred.
- Empty-header naming defaults to Text storage; the wireframe does not infer a field from the typed name.

### Open questions

- Should Enter insert or confirm anything inside a cell, or remain inert while the editor is active?
- Should a newly named column immediately accept values, as simulated, before its PostgreSQL column creation response returns?

### Approval path

If Round 3 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 4 — 2026-07-27 — Spreadsheet error states and Price editor repair

### Changed

- Replaced the compact validation treatment with spreadsheet-style error tokens: invalid values commit as `#VALUE!` or `#ERROR!`.
- Added a titled Error popover with a strong side accent and explanatory copy; it intentionally has no Fix action.
- Kept the invalid raw value in cell state so double-clicking the cell can reopen the original value for correction.
- Kept an error popover open immediately after click-away, with later access through selection or hover.
- Made the popover choose its left or right side according to available viewport space.
- Rebuilt the Price editor as one full-width input with an internal, non-interactive currency prefix and no nested cell outline.

### Feedback applied

- Screenshot references: errors now resemble spreadsheet error cells and explanatory cards without reproducing the Fix button.
- Direct request: validation appears after the user clicks away instead of replacing the active editor while they are typing.
- Direct request: repaired the clipped Total input and currency-prefix styling.

### Review now

- Whether `#VALUE!` communicates invalid numeric content clearly enough for non-technical users.
- Whether the Error title, message length, and side accent have the right visual weight.
- Whether the Error card should remain open longer than its current initial presentation.
- Whether the Total editor’s currency prefix and input alignment feel spreadsheet-native.

### Simulated or deferred behavior

- Error codes and messages are illustrative client-side wireframe states, not PostgreSQL responses.
- Validation, persistence, locale-aware numeric parsing, and server reconciliation remain deferred.
- There is intentionally no automated Fix action in this round.

### Open questions

- Should product validation use spreadsheet tokens such as `#VALUE!`, or a plainer table-specific token for non-technical users?
- After click-away, should the Error card stay open until another cell is selected, or close automatically and remain available on hover/selection?

### Approval path

If Round 4 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 5 — 2026-07-27 — Enter commit and invalid-row explanations

### Changed

- Removed the persistent border from unselected invalid cells; the normal selection border appears only while the error cell is selected.
- Changed Enter from “remain editing” to commit the active cell and restore its formatted read view; Tab and click-away still commit, while Escape cancels.
- Raised sticky row-number cells above horizontally scrolled data cells so error content cannot cover the line number.
- Added row-level validation for partially populated rows with missing required values or invalid cell values.
- Made an uncommittable row number red with a corner marker and a titled `Row not added` popover explaining why PostgreSQL cannot accept it.
- Made row-number focus suppress an already-open cell popover so the row and cell explanations never stack.
- Cleared the red row state automatically after all required and invalid values are corrected.

### Feedback applied

- Browser Comment 1: invalid cells no longer show a border unless selected.
- Browser Comment 2: Enter now returns the active editor to formatted cell view.
- Browser Comment 3: sticky row-number stacking now wins over horizontally scrolled error cells.
- Browser Comment 4: uncommittable rows receive a red row number and a corner explanation popover.

### Review now

- Whether the red row number is noticeable without overpowering the spreadsheet canvas.
- Whether `Row not added` and the combined missing/invalid-value explanation are clear enough for non-technical users.
- Whether Enter, Tab, click-away, and Escape now match the expected spreadsheet editing model.

### Simulated or deferred behavior

- Row acceptance is computed from illustrative client-side required and invalid states; no PostgreSQL insert is attempted.
- The red treatment is the user-requested exception to the revision’s otherwise grayscale wireframe palette.
- Production validation ordering, server error mapping, concurrent corrections, and retry behavior remain deferred.

### Open questions

- Should the row explanation list every failing field, as shown, or stop after the first issue?
- Should clicking a red row number eventually select the full row in addition to opening its explanation?

### Approval path

If Round 5 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 6 — 2026-07-27 — Text defaults and spreadsheet commands

### Changed

- Corrected unnamed columns so their default editor is always `type="text"` rather than inheriting the Order ID Number field.
- Preserved text values such as `002` exactly when committing an unnamed-column edit.
- Reworked the invalid-row popover into one bullet per failing column, with the column label emphasized and the explanation kept separate.
- Added Backspace and Delete handling to clear the selected cell while the grid is in navigation mode.
- Added Command/Ctrl+C support through both keyboard and native browser copy events, with a short Cell copied confirmation.
- Added a 100-step in-memory history for Command/Ctrl+Z undo and Command/Ctrl+Shift+Z or Ctrl+Y redo.
- Made undo and redo restore the cell value, cell error, and resulting row-validation state together.

### Feedback applied

- Browser Comment 1: unnamed columns now use Text inputs by default.
- Browser Comment 2: row failures are presented as bullet points grouped by column.
- Browser Comment 3: Backspace/Delete clears a selected cell, and copy/undo/redo keyboard commands are enabled.

### Review now

- Whether unnamed columns should continue accepting values before they receive a header name.
- Whether the column-label plus explanation bullet format is concise enough for rows with several errors.
- Whether clearing a populated PostgreSQL-backed row should remain immediately undoable before any future server commit boundary.

### Simulated or deferred behavior

- Cell history is in-memory wireframe state and resets on reload; it is not a PostgreSQL transaction log.
- Copy writes the selected cell’s stored value only; multi-cell ranges and paste are not included in this round.
- Production batching, server acknowledgement, conflict recovery, and cross-session history remain deferred.

### Open questions

- Should the next keyboard round add cut, paste, and multi-cell selection, or keep the first version single-cell only?
- Should undo be allowed after a row has already received server confirmation, or stop at that persistence boundary?

### Approval path

If Round 6 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 7 — 2026-07-27 — Reordering and red error hierarchy

### Changed

- Added drag handles to all A–Z coordinate cells, field headers, and row numbers so named columns and rendered rows can be reordered.
- Added Alt+Left/Right for column reordering and Alt+Up/Down for row reordering as accessible keyboard alternatives.
- Kept coordinate letters and row numbers positional: moving a column carries its field configuration and cell values, while moving a row renumbers the visible sheet positions.
- Blocked reorder attempts on unnamed columns and applied a persistent soft-red coordinate/header state with a red corner marker.
- Added a temporary `Column not moved` popover explaining that the column needs a name before it can be reordered.
- Changed invalid cell tokens, corner markers, popover left borders, and popover titles from gray to the shared error red while keeping an unselected error cell borderless.
- Clamped the unnamed-column popover to the visible sheet viewport at desktop and narrow widths.
- Reset single-cell undo/redo history after a row or column reorder so older coordinate snapshots cannot target the wrong visible position.
- Refreshed arrow-key cell navigation after a column reorder so it continues to follow the visual grid order.

### Feedback applied

- Browser Comment 1: cell errors now use red for the token, corner, popover left border, and Error title.
- Direct request: rows and columns can be reordered by dragging, with keyboard equivalents.
- Direct request: dragging an empty column is blocked and explained with a red missing-column-name error.

### Review now

- Whether `Column not moved` and “Add a column name” are clear enough without using PostgreSQL terminology.
- Whether the red error hierarchy is noticeable without overpowering normal spreadsheet selection.
- Whether row and column ordering should remain a saved view preference or become a shared table-display setting.

### Simulated or deferred behavior

- Reordering changes only the in-memory presentation order in this wireframe; it does not alter PostgreSQL row order or physical column order.
- HTML drag/drop handlers and keyboard alternatives are included, but no server persistence, concurrent ordering, or permission checks are attempted.
- The 28 rendered rows stand in for the 1,000-row logical canvas; reordering does not load or mutate records outside the rendered slice.

### Open questions

- Should row order be backed by an explicit sort/rank column, a personal saved view, or a shared display-order preference?
- Should column order be personal to each editor or shared with everyone viewing the table?

### Approval path

If Round 7 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 8 — 2026-07-27 — Post-drop column-gap validation

### Changed

- Allowed unnamed columns from the trailing blank area to start and complete the same drag/drop reorder used by named columns.
- Moved unnamed-column validation from drag start to after the column has been dropped into its new position.
- Added a layout validation pass that marks every unnamed position before the last named column, including multiple gaps created by moving a valid column beyond blank columns.
- Reduced each column problem from two red cells to one red field-header cell; the A–Z coordinate band remains neutral.
- Replaced `Column not moved` with `Missing column name` because the requested reorder now succeeds before validation appears.
- Kept one explanatory popover open after the drop while every other invalid gap remains red and exposes its own explanation on focus or hover.
- Revalidated all gaps after inline naming so correcting one header clears that error while any remaining unnamed gaps stay marked.
- Removed the Columns item from the table sidebar; column configuration remains available from the named header menu and double-click interaction.

### Feedback applied

- Browser Comment 1: trailing empty columns can now be dragged, the error appears after drop, only one header cell represents each error, and every empty gap between named columns is marked.
- Browser Comment 2: removed Columns from the table navigation.

### Review now

- Whether one red field-header cell per unnamed gap makes the affected positions sufficiently clear.
- Whether `Missing column name` and “Name column G before this layout can be saved” correctly describe a reorder that succeeded but cannot yet be saved.
- Whether column configuration remains discoverable enough through header double-click and the header menu after removing the sidebar item.

### Simulated or deferred behavior

- Column movement and gap validation remain in-memory presentation behavior; no layout is saved to PostgreSQL or a user preference.
- The red gaps represent a proposed save-time layout constraint, not a physical PostgreSQL column-order operation.
- Pointer drag handlers and keyboard-equivalent reordering share the same validation path; production drag previews and persistence acknowledgements remain deferred.

### Open questions

- Should a layout with unnamed interior gaps be prevented from saving, as shown, or should the application automatically collapse the gaps?
- Should the first invalid gap open automatically after every drop, or only after an unnamed column itself was moved?

### Approval path

If Round 8 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 9 — 2026-07-27 — Compact, top-aligned column errors

### Changed

- Reduced the missing-column popover title from the large heading size to the 16px interface heading size.
- Tightened the title-to-message spacing from 12px to 10px.
- Anchored the popover to the top edge of the invalid field header instead of opening beneath the header.
- Preserved the existing horizontal viewport clamping so the top alignment works at desktop and narrow widths.

### Feedback applied

- Browser Comment 1: aligned the missing-column popover with the top of the affected header.
- Direct request: reduced the oversized error title.

### Review now

- Whether the 16px red title has enough hierarchy without competing with the spreadsheet content.
- Whether the top-aligned placement makes the error feel attached to the invalid header.
- Whether the popover should keep this placement for all column-name errors.

### Simulated or deferred behavior

- This round changes only the wireframe's error-popover presentation; column movement, validation, and save behavior remain simulated in memory.
- Horizontal repositioning while the sheet is actively scrolled remains outside this presentation-only adjustment.

### Open questions

- Should every spreadsheet validation popover use the same compact 16px title, or only column-layout errors?

### Approval path

If Round 9 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 10 — 2026-07-27 — Top-right error corner

### Changed

- Rebuilt the unnamed-column error marker as an explicit 9px top-right triangle instead of relying on a border triangle whose visible face sat against the bottom edge.
- Kept the invalid field-header fill and compact error popover unchanged.

### Feedback applied

- Direct screenshot feedback: moved the closed error indicator to the top-right corner of the unnamed field header.

### Review now

- Whether the red triangle now reads as a spreadsheet-style top-right error marker.
- Whether its 9px size is noticeable without overpowering the header.

### Simulated or deferred behavior

- This remains an in-memory layout validation state; no column layout is persisted.
- The marker change is presentation-only and does not alter validation or popover behavior.

### Open questions

- None for this focused correction.

### Approval path

If Round 10 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 11 — 2026-07-27 — Restore the error header row

### Changed

- Preserved `position: sticky` on an invalid field header instead of replacing it with relative positioning.
- Removed the unintended 26px downward displacement that made the missing-column error overlap the first record row.
- Kept the top-right marker and compact popover treatment from the previous rounds.

### Feedback applied

- Direct browser feedback: reproduced the error in the in-app Browser and aligned the entire invalid header with the other field headers at the top of the record grid.

### Review now

- Whether the red invalid header now remains in the header band beside Total and Paid.
- Whether row 1 stays fully unobstructed when the popover is closed.

### Simulated or deferred behavior

- Column movement and validation remain in-memory wireframe behavior.
- This correction changes layout positioning only; it does not alter validation or save rules.

### Open questions

- None for this focused correction.

### Approval path

If Round 11 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 12 — 2026-07-27 — Selected and delayed column errors

### Changed

- Removed the automatic 3.6-second popover that appeared after column reordering.
- Made click or keyboard focus open the selected invalid header's popover immediately.
- Added a one-second delay before a popover appears from hover alone, with immediate dismissal after the pointer leaves.
- Raised the active invalid header above neighboring invalid headers so their fills and corner markers cannot paint over its popover.

### Feedback applied

- Screenshot feedback: corrected the error-popover stacking order.
- Direct request: popovers remain closed until selection, while hover follows a spreadsheet-like one-second delay.

### Review now

- Whether reordering leaves only the red header state visible without opening a popover.
- Whether click/focus feels immediate and hover feels deliberate rather than accidental.
- Whether the selected popover now covers neighboring invalid headers cleanly.

### Simulated or deferred behavior

- Timing and selection are simulated in the static wireframe with CSS focus and hover states.
- Production pointer-intent heuristics, touch long-press behavior, and persisted layout errors remain deferred.

### Open questions

- Should the production hover delay remain exactly one second or become a slightly shorter 800ms intent delay?

### Approval path

If Round 12 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.

## Round 13 — 2026-07-27 — Neutral error tokens and headers

### Changed

- Changed cell-level `#ERROR!` output from red emphasized text to black regular-weight text.
- Added `#ERROR!` to every unnamed interior column header so the failure is visible without opening its explanation.
- Returned invalid column headers to the same gray surface as valid headers while retaining the red top-right corner and red popover accent.
- Restored an empty header label when a gap is cleared and restored the real field label when the column becomes valid.

### Feedback applied

- Browser Comment 1: `#ERROR!` now uses black regular-weight text.
- Browser Comment 2: unnamed invalid headers now show `#ERROR!` on the standard gray header surface.

### Review now

- Whether cell and header `#ERROR!` values now match spreadsheet output conventions.
- Whether the red corner alone provides enough error emphasis on the neutral header surface.

### Simulated or deferred behavior

- Error tokens and header validation remain in-memory wireframe states.
- PostgreSQL error-code mapping and production accessibility announcements remain deferred.

### Open questions

- None for this focused correction.

### Approval path

If Round 13 is approved, the next step is the next requested wireframe feedback round within `r003-spreadsheet-table-canvas`. Approval does not Freeze the research spec, authorize implementation, or advance to creative design.
