import { one, rows } from '../lib/database.mjs';

export const ROW_COUNT = 100_000;
export const COLUMN_COUNT = 200;
export const COLUMN_IDS = Array.from(
  { length: COLUMN_COUNT },
  (_, index) => `c${String(index + 1).padStart(3, '0')}`
);

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function setupGridProof(db) {
  const columns = COLUMN_IDS.map(
    (column) => `${quoteIdentifier(column)} text`
  ).join(',\n');
  await db.exec(`
    CREATE SCHEMA workspace;
    CREATE SCHEMA tabular;
    CREATE TABLE workspace.grid_rows (
      id bigint PRIMARY KEY,
      sort_value bigint NOT NULL,
      group_name text NOT NULL,
      version bigint NOT NULL DEFAULT 1,
      ${columns}
    );
    CREATE INDEX grid_rows_window_idx
      ON workspace.grid_rows(group_name, sort_value, id);
    CREATE TABLE tabular.grid_state (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      revision bigint NOT NULL
    );
    INSERT INTO tabular.grid_state(singleton, revision) VALUES (true, 1);
    CREATE TABLE tabular.grid_actions (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      revision bigint NOT NULL,
      edits jsonb NOT NULL
    );
    INSERT INTO workspace.grid_rows
      (id, sort_value, group_name, c001, c002, c200)
    SELECT value, value,
           CASE WHEN value % 2 = 0 THEN 'even' ELSE 'odd' END,
           'row-' || value,
           (value * 10)::text,
           'edge-' || value
    FROM generate_series(1, ${ROW_COUNT}) AS value;
  `);
}

export class GridContract {
  constructor(db) {
    this.db = db;
  }

  validateColumns(columns) {
    if (
      columns.length === 0 ||
      columns.length > 20 ||
      columns.some((column) => !COLUMN_IDS.includes(column))
    ) {
      throw new Error('invalid-column-window');
    }
  }

  async readWindow({
    columns,
    limit = 40,
    filter = null,
    cursor = null
  }) {
    this.validateColumns(columns);
    if (limit < 1 || limit > 40) throw new Error('invalid-row-window');
    const revision = (
      await one(this.db, 'SELECT revision FROM tabular.grid_state')
    ).revision;
    if (cursor && cursor.revision !== revision) {
      return {
        status: 'stale-window',
        expectedRevision: cursor.revision,
        actualRevision: revision
      };
    }
    const conditions = [];
    const parameters = [];
    if (filter) {
      parameters.push(filter);
      conditions.push(`group_name = $${parameters.length}`);
    }
    if (cursor) {
      parameters.push(cursor.sortValue, cursor.id);
      conditions.push(
        `(sort_value, id) > ($${parameters.length - 1}, $${parameters.length})`
      );
    }
    parameters.push(limit);
    const projection = [
      'id',
      'sort_value',
      'group_name',
      'version',
      ...columns.map(quoteIdentifier)
    ].join(', ');
    const result = await rows(
      this.db,
      `SELECT ${projection}
       FROM workspace.grid_rows
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY sort_value, id
       LIMIT $${parameters.length}`,
      parameters
    );
    const last = result.at(-1);
    return {
      status: 'ok',
      revision,
      rows: result,
      cursor: last
        ? {
            revision,
            sortValue: last.sort_value,
            id: last.id
          }
        : null
    };
  }

  async insertBeforeFirst() {
    return this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO workspace.grid_rows
          (id, sort_value, group_name, c001)
         VALUES (200001, -1, 'even', 'inserted')`
      );
      const state = await one(
        tx,
        `UPDATE tabular.grid_state
         SET revision = revision + 1
         RETURNING revision`
      );
      return state.revision;
    });
  }

  async batchEdit(expectedRevision, edits) {
    try {
      const result = await this.db.transaction(async (tx) => {
        const state = await one(
          tx,
          'SELECT revision FROM tabular.grid_state FOR UPDATE'
        );
        if (state.revision !== expectedRevision) {
          return {
            status: 'conflict',
            expectedRevision,
            actualRevision: state.revision
          };
        }
        for (const edit of edits) {
          const keys = Object.keys(edit.patch);
          this.validateColumns(keys);
          const assignments = keys
            .map(
              (column, index) =>
                `${quoteIdentifier(column)} = $${index + 3}`
            )
            .join(', ');
          const updated = await rows(
            tx,
            `UPDATE workspace.grid_rows
             SET ${assignments}, version = version + 1
             WHERE id = $1 AND version = $2
             RETURNING id, version`,
            [
              edit.rowId,
              edit.rowVersion,
              ...keys.map((key) => edit.patch[key])
            ]
          );
          if (updated.length !== 1) throw new Error(`stale-row:${edit.rowId}`);
        }
        const next = await one(
          tx,
          `UPDATE tabular.grid_state
           SET revision = revision + 1
           RETURNING revision`
        );
        await tx.query(
          `INSERT INTO tabular.grid_actions(revision, edits)
           VALUES ($1, $2::jsonb)`,
          [next.revision, JSON.stringify(edits)]
        );
        return {
          status: 'committed',
          revision: next.revision,
          editedRows: edits.length
        };
      });
      return result;
    } catch (error) {
      if (error.message.startsWith('stale-row:')) {
        return { status: 'conflict', reason: error.message };
      }
      throw error;
    }
  }
}

export class LogicalGridState {
  constructor(rowCount, columnCount, mountedRows = 12, mountedColumns = 8) {
    this.rowCount = rowCount;
    this.columnCount = columnCount;
    this.mountedRows = mountedRows;
    this.mountedColumns = mountedColumns;
    this.active = { row: 0, column: 0 };
    this.anchor = { ...this.active };
    this.base = { row: 0, column: 0 };
  }

  move(rowDelta, columnDelta) {
    this.active = {
      row: Math.max(
        0,
        Math.min(this.rowCount - 1, this.active.row + rowDelta)
      ),
      column: Math.max(
        0,
        Math.min(this.columnCount - 1, this.active.column + columnDelta)
      )
    };
    return this.active;
  }

  jump(row, column) {
    this.active = {
      row: Math.max(0, Math.min(this.rowCount - 1, row)),
      column: Math.max(0, Math.min(this.columnCount - 1, column))
    };
    return this.active;
  }

  isMounted() {
    return (
      this.active.row >= this.base.row &&
      this.active.row < this.base.row + this.mountedRows &&
      this.active.column >= this.base.column &&
      this.active.column < this.base.column + this.mountedColumns
    );
  }

  ensureMounted() {
    if (!this.isMounted()) {
      this.base = {
        row: Math.min(
          this.active.row,
          Math.max(0, this.rowCount - this.mountedRows)
        ),
        column: Math.min(
          this.active.column,
          Math.max(0, this.columnCount - this.mountedColumns)
        )
      };
    }
    return this.base;
  }
}

export function identityPolicy(keyColumns) {
  if (keyColumns.length === 0) {
    return { mode: 'read-only', reason: 'no-stable-key' };
  }
  return {
    mode: 'editable',
    key: keyColumns.length === 1 ? 'single' : 'composite',
    columns: keyColumns
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function serializeClipboard(selection) {
  const tsv = selection.rows
    .map((row) => row.map((cell) => String(cell.value)).join('\t'))
    .join('\n');
  const html = `<table>${selection.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(cell.value)}</td>`)
          .join('')}</tr>`
    )
    .join('')}</table>`;
  const internal = JSON.stringify({
    version: 1,
    columns: selection.columns,
    rows: selection.rows
  });
  return {
    'text/plain': tsv,
    'text/html': html,
    'application/x-tabular+json': internal
  };
}
