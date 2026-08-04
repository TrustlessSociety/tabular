# Tabular Spreadsheet Canvas and Column Configuration

## Scope

Use this document to rebuild the PostgreSQL-backed spreadsheet canvas, the
right-side column panel, editing modes, validation, relationships, and
reordering. It describes accepted r005 visual behavior. The
[product contract](tabular-product-contract.md) supersedes its older hierarchy,
persistence, authority, and first-slice assumptions.

## Sheet anatomy

| Layer, top to bottom | Content | Behavior |
| --- | --- | --- |
| Coordinate band | A–Z spreadsheet letters | Each coordinate is a column-reorder handle. It is neutral even when the paired field header has a naming error. |
| Field-header band | User-facing column labels | Labels only; no repeated type/storage metadata. Named headers configure on double-click. |
| Body grid | Values and blank rows | A cell at rest is an output value; edit controls appear only in edit mode. |
| Row-header rail | Number sign then row numbers | Sticky above horizontal data scrolling; row headers select/reorder rows and carry row-level validation. |
| Row adder | Rows numeric input, Add Rows, capacity label | Adds logical capacity; the base sheet begins at 1,000 rows. |
| Status bar | Record, logical row, and named-column counts | Quiet system feedback, not a draft or save command. |

The reference table has seven named columns and 248 existing records. The
visible sample shows four populated rows, followed by blank rows. The wireframe
may render a bounded window, but it must communicate a **1,000-row logical
sheet** and update ARIA row count/status when rows are added.

## Selection and navigation

### Selection states

- One click selects a cell. Shift+click or Shift+arrow extends a range.
- Clicking a row number selects the row; clicking a coordinate/field header
  selects the column.
- Blue is the active selection/focus affordance. It is not an error color.
- The selected target remains visually apparent while a toolbar, popup, or
  context menu acts on it.
- Opening a menu must not alter grid measurements, sticky-header position, or
  the selected column's horizontal alignment.

### Keyboard contract

| Input | Result when no editor is active |
| --- | --- |
| Arrow keys | Move the active cell; Shift extends a range. |
| Enter, F2, or printable key | Enter cell edit mode. |
| Backspace/Delete | Clear selected cell value without shifting neighbors. |
| Command/Ctrl+C | Copy the active cell's stored value; show brief confirmation. |
| Command/Ctrl+Z | Undo the latest in-memory data or formatting command. |
| Command/Ctrl+Shift+Z or Ctrl+Y | Redo. |
| Alt+Left/Right | Reorder the active column. |
| Alt+Up/Down | Reorder the active row. |
| Shift+F10/Menu key | Open the target-appropriate context menu. |

History is an in-memory, 100-step review model. Undo/redo restores cell value,
cell error, and resulting row-validity state together. Copy is single-cell;
multi-cell clipboard/paste behavior is not specified. Reordering resets
coordinate-sensitive single-cell history rather than applying an old command to
a different visible location.

## Cell modes

A read cell always renders its **Format**, not its field editor. Double-click,
Enter, F2, or typing shows a full-cell, edge-to-edge editor matched to the
current Field. The input has no inset card, no duplicate border, and no padded
mini-form appearance.

| Field | Read/output example | Edit state | Commit rule |
| --- | --- | --- | --- |
| Text | Plain text | Text input | Enter, Tab, or click-away commits; Escape restores. |
| Number | Numeric output | Numeric input, number-aligned | Same; invalid number becomes an error after commit. |
| Email | ap@northstar.co or Email link format | Text/email input | Validate after commit, not while typing. |
| URL | Link-like or clipped output | Text/URL input | Accept the string; apply best-effort link formatting after commit. |
| Phone | Phone text | Text/tel-like input | Accept the string; apply best-effort phone formatting after commit. |
| Relation | Saved record template | Searchable related-file picker | Selecting a choice commits immediately. |
| Select | Compact badge such as Processing | Visible option menu directly below/in the cell | Show choices immediately; clicking a choice commits. |
| Price | Peso currency output | One full-width value input with non-interactive in-cell currency prefix | Commit restores currency output; prefix may not clip value. |
| Switch | Yes/No | Accessible switch | Change may commit as the field control is activated. |
| Date and time | Jul 24, 10:32 AM | Native date-time control | Commit restores compact date-time output. |

### Edit lifecycle

1. User enters edit mode and sees raw/editable value.
2. The editor stays present while the user is working. It does not turn back
   into formatted output merely because an input event occurs.
3. Enter, Tab, or click-away commits; Enter specifically returns to the
   formatted cell state. Escape cancels.
4. On valid commit, render the output Format.
5. On invalid commit after click-away/Enter/Tab, retain the raw attempted value
   in state for a future double-click correction and render a spreadsheet error
   token at rest.

An unnamed column's default is always **Text** and preserves strings such as
002; it must never inherit the nearest named column's Number editor.

Typing below a blank header retains an unnamed logical column in Tabular
metadata and stores its permanent values in the owner-enabled hidden JSON
field. It does not infer `Column B`, `column_b`, or any other named/physical
PostgreSQL column. Naming that header is the separate promotion action.

URL and Phone are deliberately loose string fields. Their formatters may trim
presentation noise, recognize a usable link/phone shape, or fall back to plain
text, but they may not silently replace the stored string. A PostgreSQL
constraint or trigger can still reject the value; Tabular must then retain it
as a correctable draft and surface the database error.

## Blank files and new columns

A New file opens directly at Untitled File with zero records, 1,000 logical
rows, and no named columns. The user creates its first columns inside the
spreadsheet:

- Double-click an empty field-header cell to reveal one edge-to-edge **column
  name** text input only.
- Click-away or Tab commits the name; Escape restores the blank header.
- A committed header becomes a named **Text** column. It can immediately accept
  values, and later double-click opens the normal Column settings panel.
- Do not open an Add column dialog, create-time builder, or partial field setup.

## Output and configuration axes

These four axes are independent and must not be collapsed into one control.

| Axis | Controls | Effect |
| --- | --- | --- |
| User-facing label | Column name | The header users see. |
| Field | Text, Number, Email, URL, Phone, Relation, Select, Price, Switch, Date and time | How people enter and validate values; chooses cell editor. |
| Format | Plain text, Email link, Clipped text, Related record, Badge, Currency, Yes/No, Date/date-time as applicable | How accepted values render at rest; does not alter stored data. |
| Constraints | Required, Unique values | Validity requirements for row acceptance. |
| Advanced PostgreSQL | PostgreSQL column name, storage type, default/value details | Physical data details, disclosed only in Advanced. |

Selecting a spreadsheet-style number/presentation command must not silently
change the Field, Format, storage type, constraints, raw stored value, or
validation behavior. A field change must refresh existing read-cell output and
future editor choice, so stale Select/Price/Switch styling never remains.

## Column settings panel

### General panel behavior

- Open by double-clicking a named field header or choosing Configure column from
  the column context menu.
- Title: Configure followed by the column name.
- Right-side panel with close control, body scrolling, and Cancel / Apply
  changes footer.
- Applying updates temporary wireframe configuration only; it does not issue a
  live PostgreSQL migration, rename, cast, or constraint change.
- In the panel label, Field, Format, constraints, and Advanced choices are
  visible in a clear, top-to-bottom form rather than abbreviated grid metadata.

### Standard field form

1. **Column name** — user-facing header label.
2. **Field** — semantic input control, followed by concise helper text that it
   controls entry and validation.
3. Any Field-specific configuration (for example Select choices or Relation
   target/template).
4. **Format** — output presentation control, followed by helper text that it
   changes display only, not stored value.
5. Any Format-specific configuration.
6. **Constraints** — Required and Unique values.
7. **Advanced** disclosure — storage and PostgreSQL identity.

### Relation: exact form contract

Relation configuration is deliberately explicit. It has **two independent
template strings** with different ownership and results.

When **Field = Relation**, show this exact sequence before Constraints:

1. **Column name**
2. **Field: Relation**
3. **File** — a searchable dropdown of every authorized eligible table file.
   Group choices by schema folder, such as Operations and Finance. Cross-folder
   selection is allowed because PostgreSQL foreign keys may cross schemas
   inside the same database; cross-database targets are unavailable.
4. **Display format** directly under File — template string used only in the
   relation picker while a cell is being edited. Example:
   {invoice_number} — {customer_name}. A matching option might read
   INV-9321 — Northstar Market.
5. **Format: Related record**
6. **Display format** directly under Format — a second, independent template
   string used to display the saved relation when the cell is not being edited.
   Example: {invoice_number}, rendering INV-9321.

Do not put the picker template under Format. Do not rename either template in a
way that hides which one is for input options versus the saved cell. A Relation
field should default Format to Related record, but the two fields remain
independently editable. Related record controls appear only while the selected
Format is Related record; Relation controls appear only while Field is Relation.

Current review examples target **Finance / Invoices**, but every current file in
Operations and Finance is eligible. This represents an ordinary same-database
relationship across folders. Remote PostgreSQL databases, federation, live
foreign keys, migration planning, and referential-integrity policy are deferred.

### Select configuration

A Select field owns its option registry in Field-specific settings. Status uses
Processing, Ready, Shipped, and Cancelled. At cell edit time the choices must
be visibly open, rather than hidden inside a compact native select that looks
like a static output badge.

### Constraints

- **Required**: a partially populated row cannot be added while this field is
  missing.
- **Unique values**: duplicate values are invalid.
- Constraints explain why a PostgreSQL row cannot be accepted; they are not
  visual formatting.

### Advanced PostgreSQL

The disclosure label is simply **Advanced**, not “Advanced PostgreSQL details.”

Within it show the lower_case PostgreSQL column name as an editable control
separate from the Column name. On Apply, normalize human input such as
Contact Email to contact_email. Preserve the friendly header as Email unless
the user separately changes it.

Advanced may also expose storage type and default value. Give a concise warning
that changing storage or PostgreSQL column name may need a cast, rename, review
of existing values, and a future migration. The wireframe does none of those
operations.

## Validation and error language

### Cell-level errors

After an invalid value is committed, the cell renders #VALUE! or #ERROR! in
black, regular-weight type. The cell gets a small red top-right triangle. It
has no persistent red border; a normal selection outline appears only when the
error cell is selected.

Selecting/focusing the invalid cell opens a floating Error popover immediately.
Hover opens it after one second and hides it promptly after leaving. The
popover has a red left border and compact red **Error** title, descriptive
message, no Fix button, and viewport-aware placement to the left or right.
Keep it above the grid and unrelated headers. The raw invalid value is retained
so editing reopens that value rather than the error token.

### Row-level errors

A row with any entered data but missing required fields or invalid cells cannot
be added to PostgreSQL. Its sticky line number is red with a corner marker and
a Row not added popover. The explanation must list **one bullet per failing
column**, for example:

- **Order ID:** required.
- **Customer:** required.
- **Email:** expects a valid email address; sd is not valid.

The row number layer must remain above horizontally scrolled error cells. When
a row explanation opens, suppress an already-open cell popover so two error
cards do not stack.

### Unnamed interior column errors

Columns can be dragged from the trailing blank A–Z area. Let the drop complete,
then validate every unnamed position before the last named column, including
multiple interior gaps. Each affected field-header cell only:

- retains the standard neutral gray header background;
- shows black regular #ERROR!;
- has one red top-right triangle;
- keeps the coordinate band neutral.

A selected/focused invalid header opens Missing column name with text such as
Name column G before this layout can be saved. The compact title is about 16px
and the popover top aligns to the top edge of the invalid header. It may not
appear automatically after dragging; hover waits one second. The active
header/popper stacking layer must cover nearby invalid headers without shifting
any header downward.

Correcting an inline header name clears that gap only; any other interior gaps
remain invalid. These errors indicate a save-time layout rule, not a physical
PostgreSQL column-order operation.

## Reordering and capacity

- Drag a named or trailing empty coordinate/header to reorder columns. Drag a
  row number to reorder rows.
- Rows/columns move first, then interior-gap validation runs.
- Carry a named column's field configuration and values with it; row movement
  renumbers visible sheet positions.
- Keyboard alternatives use the Alt+arrow commands in the selection table.
- Row ordering is shared table presentation state. Commit a row move against a
  collision-safe, Tabular-UI-hidden rank column installed with owner authority;
  never treat PostgreSQL's physical row order as the sheet order.
- Publish committed row-order changes to connected clients in real time when
  available. If rank compaction or delivery cannot complete inline, enqueue
  durable Row order maintenance and expose its queued/failed state in System
  activity.
- `__tabular_row` is the logical naming hint for the rank field, not permission
  to reuse a conflicting user column. Installation chooses a versioned,
  collision-safe physical name.
- Column reordering remains presentation metadata. It is current-tab state
  until saved in a view; a private view persists it for its owner and a shared
  view publishes it to authorized collaborators. It never changes physical
  PostgreSQL column order.
- The row-adder accepts a positive number and increases logical capacity. It
  does not add a database record by itself.
- Editing any blank logical row creates an actor-owned persistent row draft
  carrying the hidden shared-rank token for that visible position. Reload must
  restore a sparse draft or committed record at the same row number; skipped
  visual rows remain blank capacity rather than empty PostgreSQL records.

## Deferred implementation decisions

The wireframe does not settle server-side validation mapping, schema
migration/conflict handling, relation integrity, broad real-time collaboration,
locale/timezone behavior, or production recovery mechanics. Renderer,
selection, validation, and ordering ownership are governed by the accepted
product and implementation-boundary documents.
