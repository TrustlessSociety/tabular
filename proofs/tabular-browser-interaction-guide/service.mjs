import { one, rows } from '../lib/database.mjs';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(value) {
  if (!IDENTIFIER.test(value)) throw new Error(`unsafe-identifier:${value}`);
  return `"${value}"`;
}

export function normalizeIdentifier(value) {
  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (!normalized) return 'untitled_file';
  return /^[a-z_]/.test(normalized) ? normalized : `_${normalized}`;
}

function formatCell(column, value) {
  if (value == null || value === '') return '';
  if (column.format_type === 'currency') {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 2
    }).format(Number(value));
  }
  if (column.format_type === 'yes-no') return value ? 'Yes' : 'No';
  if (column.format_type === 'date-time') {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  }
  return String(value);
}

function validateValue(column, value) {
  if (column.required && (value == null || String(value).trim() === '')) {
    return `${column.label} is required.`;
  }
  if (value == null || String(value).trim() === '') return null;
  if (column.field_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `${value} is not a valid email address.`;
  }
  if ((column.field_type === 'number' || column.field_type === 'price') && !Number.isFinite(Number(value))) {
    return `${value} is not a valid number.`;
  }
  return null;
}

export async function setupBrowserGuide(db) {
  await db.exec(`
    CREATE SCHEMA operations;
    CREATE SCHEMA finance;
    CREATE SCHEMA tabular;

    CREATE TABLE finance.invoices (
      id bigint PRIMARY KEY,
      invoice_number text UNIQUE NOT NULL,
      customer_name text NOT NULL,
      total numeric(12, 2) NOT NULL
    );
    INSERT INTO finance.invoices VALUES
      (1, 'INV-9321', 'Northstar Market', 12500.00),
      (2, 'INV-9322', 'Lumen Workshop', 8840.50);

    CREATE TABLE operations.customer_orders (
      id bigint PRIMARY KEY,
      order_id text UNIQUE NOT NULL,
      customer text NOT NULL,
      email text NOT NULL,
      status text NOT NULL,
      total numeric(12, 2) NOT NULL,
      paid boolean NOT NULL DEFAULT false,
      ordered_at timestamptz NOT NULL,
      invoice_id bigint REFERENCES finance.invoices(id) ON DELETE NO ACTION,
      version bigint NOT NULL DEFAULT 1
    );
    INSERT INTO operations.customer_orders VALUES
      (1, 'ORD-1048', 'Northstar Market', 'ap@northstar.co', 'Processing', 12500.00, true, '2026-07-24T02:32:00Z', 1, 1),
      (2, 'ORD-1049', 'Lumen Workshop', 'ops@lumen.ph', 'Ready', 8840.50, false, '2026-07-24T04:15:00Z', 2, 1),
      (3, 'ORD-1050', 'Mosaic Foods', 'orders@mosaic.ph', 'Shipped', 21990.00, true, '2026-07-24T05:05:00Z', NULL, 1),
      (4, 'ORD-1051', 'Arc & Field', 'team@arcfield.ph', 'Cancelled', 3990.00, false, '2026-07-24T06:40:00Z', NULL, 1);

    CREATE TABLE tabular.files (
      id text PRIMARY KEY,
      schema_name text NOT NULL,
      table_name text NOT NULL,
      display_name text NOT NULL,
      table_name_overridden boolean NOT NULL DEFAULT false,
      kind text NOT NULL DEFAULT 'table',
      edited_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(schema_name, table_name)
    );
    INSERT INTO tabular.files VALUES
      ('customer-orders', 'operations', 'customer_orders', 'Customer orders', false, 'table', now()),
      ('inventory', 'operations', 'inventory', 'Inventory', false, 'table', now()),
      ('vendors', 'operations', 'vendors', 'Vendors', false, 'table', now()),
      ('stock-movements', 'operations', 'stock_movements', 'Stock movements', false, 'table', now()),
      ('purchase-requests', 'operations', 'purchase_requests', 'Purchase requests', false, 'table', now()),
      ('invoices', 'finance', 'invoices', 'Invoices', false, 'table', now()),
      ('expenses', 'finance', 'expenses', 'Expenses', false, 'table', now()),
      ('budgets', 'finance', 'budgets', 'Budgets', false, 'table', now());

    CREATE TABLE tabular.column_metadata (
      file_id text NOT NULL REFERENCES tabular.files(id) ON DELETE CASCADE,
      column_id text NOT NULL,
      position integer NOT NULL,
      label text,
      field_type text NOT NULL,
      format_type text NOT NULL,
      required boolean NOT NULL DEFAULT false,
      unique_values boolean NOT NULL DEFAULT false,
      pg_name text,
      storage_type text NOT NULL DEFAULT 'text',
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY(file_id, column_id)
    );
    INSERT INTO tabular.column_metadata VALUES
      ('customer-orders', 'order_id', 1, 'Order ID', 'text', 'plain', true, true, 'order_id', 'text', '{}'),
      ('customer-orders', 'customer', 2, 'Customer', 'text', 'plain', true, false, 'customer', 'text', '{}'),
      ('customer-orders', 'email', 3, 'Email', 'email', 'email-link', true, false, 'email', 'text', '{}'),
      ('customer-orders', 'status', 4, 'Status', 'select', 'badge', true, false, 'status', 'text', '{"options":["Processing","Ready","Shipped","Cancelled"]}'),
      ('customer-orders', 'total', 5, 'Total', 'price', 'currency', true, false, 'total', 'numeric(12,2)', '{"currency":"PHP"}'),
      ('customer-orders', 'paid', 6, 'Paid', 'switch', 'yes-no', true, false, 'paid', 'boolean', '{}'),
      ('customer-orders', 'ordered_at', 7, 'Ordered at', 'date-time', 'date-time', true, false, 'ordered_at', 'timestamptz', '{}'),
      ('customer-orders', 'future_h', 8, NULL, 'text', 'plain', false, false, NULL, 'text', '{}'),
      ('customer-orders', 'future_i', 9, NULL, 'text', 'plain', false, false, NULL, 'text', '{}'),
      ('customer-orders', 'future_j', 10, NULL, 'text', 'plain', false, false, NULL, 'text', '{}');

    CREATE TABLE tabular.presentation_state (
      session_id text NOT NULL,
      file_id text NOT NULL,
      state jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY(session_id, file_id)
    );
    INSERT INTO tabular.presentation_state VALUES
      ('browser-proof', 'customer-orders', '{"logicalRows":1000,"viewMode":"list","zoom":100,"frozenRows":0,"frozenColumns":0,"formats":{}}');

    CREATE TABLE tabular.drafts (
      file_id text NOT NULL,
      row_key text NOT NULL,
      patch jsonb NOT NULL,
      errors jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(file_id, row_key)
    );

    CREATE TABLE tabular.actions (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id text NOT NULL,
      file_id text NOT NULL,
      action_type text NOT NULL,
      forward jsonb NOT NULL,
      inverse jsonb NOT NULL,
      status text NOT NULL DEFAULT 'applied',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE tabular.selection_action_plans (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id text NOT NULL,
      file_id text NOT NULL REFERENCES tabular.files(id) ON DELETE CASCADE,
      operation text NOT NULL,
      row_ids jsonb NOT NULL,
      column_ids jsonb NOT NULL,
      cell_count integer NOT NULL,
      status text NOT NULL DEFAULT 'planned',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE tabular.import_runs (
      id text PRIMARY KEY,
      schema_name text NOT NULL,
      table_name text NOT NULL,
      file_name text NOT NULL,
      source_kind text NOT NULL,
      state text NOT NULL,
      warnings jsonb NOT NULL,
      fingerprint text NOT NULL
    );
  `);
}

export class BrowserGuideService {
  constructor(db, sessionId = 'browser-proof') {
    this.db = db;
    this.sessionId = sessionId;
  }

  async hierarchy() {
    const files = await rows(
      this.db,
      `SELECT schema_name, count(*)::integer AS file_count
       FROM tabular.files GROUP BY schema_name ORDER BY schema_name DESC`
    );
    return {
      connection: { id: 'acme', label: 'Acme Inc.' },
      database: { id: 'company', label: 'company' },
      schemas: files.map((entry) => ({
        id: entry.schema_name,
        label: entry.schema_name[0].toUpperCase() + entry.schema_name.slice(1),
        fileCount: entry.file_count
      }))
    };
  }

  async files(schemaName = null) {
    return rows(
      this.db,
      `SELECT f.id, f.schema_name, f.table_name, f.display_name, f.kind,
              f.edited_at,
              count(c.column_id) FILTER (WHERE c.label IS NOT NULL)::integer AS column_count,
              CASE WHEN f.id = 'customer-orders' THEN 248
                   WHEN f.id = 'invoices' THEN 126
                   WHEN f.id = 'q3-orders' THEN 248 ELSE 0 END AS record_count
       FROM tabular.files f
       LEFT JOIN tabular.column_metadata c ON c.file_id = f.id
       WHERE ($1::text IS NULL OR f.schema_name = $1)
       GROUP BY f.id
       ORDER BY f.display_name`,
      [schemaName]
    );
  }

  async state(fileId = 'customer-orders') {
    const file = await one(this.db, 'SELECT * FROM tabular.files WHERE id = $1', [fileId]);
    if (!file) throw new Error('file-not-found');
    const columns = await rows(
      this.db,
      `SELECT * FROM tabular.column_metadata
       WHERE file_id = $1 ORDER BY position`,
      [fileId]
    );
    const presentation = await one(
      this.db,
      `SELECT state FROM tabular.presentation_state
       WHERE session_id = $1 AND file_id = $2`,
      [this.sessionId, fileId]
    );
    let records = [];
    if (file.id === 'customer-orders') {
      records = await rows(
        this.db,
        `SELECT id, order_id, customer, email, status, total::float8 AS total,
                paid, ordered_at, invoice_id, version
         FROM operations.customer_orders ORDER BY id LIMIT 40`
      );
    } else if (file.id === 'invoices') {
      records = await rows(this.db, 'SELECT * FROM finance.invoices ORDER BY id LIMIT 40');
    } else if (file.id === 'q3-orders') {
      records = await rows(this.db, 'SELECT * FROM operations.q3_orders ORDER BY id LIMIT 40');
    }
    const drafts = await rows(
      this.db,
      `SELECT row_key, patch, errors FROM tabular.drafts
       WHERE file_id = $1 ORDER BY row_key`,
      [fileId]
    );
    const relationOptions = await rows(
      this.db,
      `SELECT id, invoice_number, customer_name,
              invoice_number || ' — ' || customer_name AS picker_label
      FROM finance.invoices ORDER BY invoice_number`
    );
    const history = await one(
      this.db,
      `SELECT count(*) FILTER (WHERE status = 'applied')::integer AS undo_count,
              count(*) FILTER (WHERE status = 'undone')::integer AS redo_count
       FROM tabular.actions WHERE session_id = $1 AND file_id = $2`,
      [this.sessionId, fileId]
    );
    return {
      file,
      columns,
      records: records.map((record) => ({
        ...record,
        display: Object.fromEntries(
          columns
            .filter((column) => column.pg_name)
            .map((column) => [column.column_id, formatCell(column, record[column.pg_name])])
        )
      })),
      drafts,
      relationOptions,
      history,
      presentation: presentation?.state ?? { logicalRows: 1000, formats: {} }
    };
  }

  async renameFile(fileId, displayName) {
    const current = await one(this.db, 'SELECT * FROM tabular.files WHERE id = $1', [fileId]);
    const nextTable = current.table_name_overridden
      ? current.table_name
      : normalizeIdentifier(displayName);
    const updated = await one(
      this.db,
      `UPDATE tabular.files
       SET display_name = $2, table_name = $3, edited_at = now()
       WHERE id = $1 RETURNING *`,
      [fileId, displayName.trim() || 'Untitled File', nextTable]
    );
    await this.recordAction(fileId, 'rename-file', updated, current);
    return updated;
  }

  async updateTableSettings(fileId, input) {
    const current = await one(this.db, 'SELECT * FROM tabular.files WHERE id = $1', [fileId]);
    const tableName = normalizeIdentifier(input.tableName || input.displayName);
    const updated = await one(
      this.db,
      `UPDATE tabular.files
       SET display_name = $2, schema_name = $3, table_name = $4,
           table_name_overridden = true, edited_at = now()
       WHERE id = $1 RETURNING *`,
      [fileId, input.displayName, input.folder, tableName]
    );
    await this.recordAction(fileId, 'table-settings', updated, current);
    return updated;
  }

  async updateColumn(fileId, columnId, input) {
    const current = await one(
      this.db,
      'SELECT * FROM tabular.column_metadata WHERE file_id = $1 AND column_id = $2',
      [fileId, columnId]
    );
    const config = {
      ...(current.config ?? {}),
      ...(input.options ? { options: input.options } : {}),
      ...(input.relation ? { relation: input.relation } : {}),
      proposedPgName: normalizeIdentifier(input.pgName || input.label),
      proposedStorageType: input.storageType || current.storage_type
    };
    const updated = await one(
      this.db,
      `UPDATE tabular.column_metadata
       SET label = $3, field_type = $4, format_type = $5,
           required = $6, unique_values = $7, config = $8::jsonb
       WHERE file_id = $1 AND column_id = $2 RETURNING *`,
      [
        fileId,
        columnId,
        input.label,
        input.fieldType,
        input.formatType,
        Boolean(input.required),
        Boolean(input.uniqueValues),
        JSON.stringify(config)
      ]
    );
    await this.recordAction(fileId, 'column-settings', updated, current);
    return updated;
  }

  async editCell(fileId, rowKey, columnId, value, expectedVersion = null) {
    const file = await one(this.db, 'SELECT * FROM tabular.files WHERE id = $1', [fileId]);
    const column = await one(
      this.db,
      `SELECT * FROM tabular.column_metadata
       WHERE file_id = $1 AND column_id = $2`,
      [fileId, columnId]
    );
    if (!file || !column) throw new Error('cell-target-not-found');
    const error = validateValue(column, value);
    const numericRow = Number(rowKey);
    if (!Number.isInteger(numericRow)) {
      return this.saveDraft(fileId, String(rowKey), columnId, value, error);
    }
    if (error) {
      await this.saveDraft(fileId, String(rowKey), columnId, value, error);
      return { status: 'invalid', token: '#VALUE!', rawValue: value, error };
    }
    if (file.id !== 'customer-orders' || !column.pg_name) {
      return this.saveDraft(fileId, String(rowKey), columnId, value, null);
    }
    const current = await one(
      this.db,
      `SELECT ${quoteIdentifier(column.pg_name)} AS value, version
       FROM operations.customer_orders WHERE id = $1`,
      [numericRow]
    );
    if (expectedVersion != null && current.version !== expectedVersion) {
      return {
        status: 'conflict',
        expectedVersion,
        actualVersion: current.version
      };
    }
    let typedValue = value;
    if (column.field_type === 'price' || column.field_type === 'number') typedValue = Number(value);
    if (column.field_type === 'switch') typedValue = value === true || value === 'true';
    const updated = await one(
      this.db,
      `UPDATE operations.customer_orders
       SET ${quoteIdentifier(column.pg_name)} = $2, version = version + 1
       WHERE id = $1 RETURNING id, version, ${quoteIdentifier(column.pg_name)} AS value`,
      [numericRow, typedValue]
    );
    await this.db.query(
      'DELETE FROM tabular.drafts WHERE file_id = $1 AND row_key = $2',
      [fileId, String(rowKey)]
    );
    await this.recordAction(
      fileId,
      'edit-cell',
      { rowId: numericRow, columnId, value: typedValue },
      { rowId: numericRow, columnId, value: current.value }
    );
    return {
      status: 'committed',
      rowId: numericRow,
      columnId,
      value: updated.value,
      displayValue: formatCell(column, updated.value),
      version: updated.version
    };
  }

  async saveDraft(fileId, rowKey, columnId, value, directError) {
    const existing = await one(
      this.db,
      'SELECT patch, errors FROM tabular.drafts WHERE file_id = $1 AND row_key = $2',
      [fileId, rowKey]
    );
    const patch = { ...(existing?.patch ?? {}), [columnId]: value };
    const columns = await rows(
      this.db,
      `SELECT column_id, label, required FROM tabular.column_metadata
       WHERE file_id = $1 AND label IS NOT NULL`,
      [fileId]
    );
    const errors = {};
    for (const column of columns) {
      if (column.required && (patch[column.column_id] == null || String(patch[column.column_id]).trim() === '')) {
        errors[column.column_id] = `${column.label} is required.`;
      }
    }
    if (directError) errors[columnId] = directError;
    await this.db.query(
      `INSERT INTO tabular.drafts(file_id, row_key, patch, errors)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT(file_id, row_key) DO UPDATE
       SET patch = excluded.patch, errors = excluded.errors, updated_at = now()`,
      [fileId, rowKey, JSON.stringify(patch), JSON.stringify(errors)]
    );
    return {
      status: Object.keys(errors).length ? 'draft-invalid' : 'draft',
      rowKey,
      patch,
      errors
    };
  }

  async setPresentation(fileId, patch) {
    const existing = await one(
      this.db,
      `SELECT state FROM tabular.presentation_state
       WHERE session_id = $1 AND file_id = $2`,
      [this.sessionId, fileId]
    );
    const next = { ...(existing?.state ?? {}), ...patch };
    await this.db.query(
      `INSERT INTO tabular.presentation_state(session_id, file_id, state)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT(session_id, file_id) DO UPDATE SET state = excluded.state`,
      [this.sessionId, fileId, JSON.stringify(next)]
    );
    await this.recordAction(
      fileId,
      'presentation',
      { fileId, state: next },
      { fileId, state: existing?.state ?? {} }
    );
    return next;
  }

  async addRows(fileId, amount) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 10_000) throw new Error('invalid-row-count');
    const current = await this.state(fileId);
    return this.setPresentation(fileId, {
      logicalRows: Number(current.presentation.logicalRows ?? 1000) + amount
    });
  }

  async prepareRangeAction(fileId, operation, rowIds, columnIds) {
    if (operation !== 'clear') throw new Error('unsupported-range-operation');
    if (!Array.isArray(rowIds) || !Array.isArray(columnIds)) {
      throw new Error('invalid-range-targets');
    }
    const uniqueRows = [...new Set(rowIds.map(String))];
    const uniqueColumns = [...new Set(columnIds.map(String))];
    if (!uniqueRows.length || !uniqueColumns.length) throw new Error('empty-range-targets');
    const cellCount = uniqueRows.length * uniqueColumns.length;
    if (cellCount > 10_000) throw new Error('range-action-too-large');

    const current = await this.state(fileId);
    const logicalRowCount = Number(current.presentation.logicalRows ?? current.records.length);
    const knownRowIds = new Set(Array.from({ length: logicalRowCount }, (_, index) =>
      index < current.records.length ? `record:${current.records[index].id}` : `logical:${index + 1}`
    ));
    if (uniqueRows.some((rowId) => !knownRowIds.has(rowId))) {
      throw new Error('range-row-not-found');
    }
    const knownColumns = await rows(
      this.db,
      'SELECT column_id FROM tabular.column_metadata WHERE file_id = $1',
      [fileId]
    );
    const knownColumnIds = new Set(knownColumns.map((column) => column.column_id));
    if (uniqueColumns.some((columnId) => !knownColumnIds.has(columnId))) {
      throw new Error('range-column-not-found');
    }

    const plan = await one(
      this.db,
      `INSERT INTO tabular.selection_action_plans
        (session_id, file_id, operation, row_ids, column_ids, cell_count)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       RETURNING id, status, operation, cell_count`,
      [
        this.sessionId,
        fileId,
        operation,
        JSON.stringify(uniqueRows),
        JSON.stringify(uniqueColumns),
        cellCount
      ]
    );
    return {
      ...plan,
      rowCount: uniqueRows.length,
      columnCount: uniqueColumns.length
    };
  }

  async reorderColumn(fileId, columnId, targetPosition) {
    return this.db.transaction(async (tx) => {
      const ordered = await rows(
        tx,
        `SELECT column_id, position, label FROM tabular.column_metadata
         WHERE file_id = $1 ORDER BY position`,
        [fileId]
      );
      const currentIndex = ordered.findIndex((column) => column.column_id === columnId);
      if (currentIndex < 0) throw new Error('column-not-found');
      const [moved] = ordered.splice(currentIndex, 1);
      const nextIndex = Math.max(0, Math.min(ordered.length, targetPosition - 1));
      ordered.splice(nextIndex, 0, moved);
      for (let index = 0; index < ordered.length; index += 1) {
        await tx.query(
          `UPDATE tabular.column_metadata SET position = $3
           WHERE file_id = $1 AND column_id = $2`,
          [fileId, ordered[index].column_id, index + 1]
        );
      }
      const lastNamed = ordered.reduce(
        (last, column, index) => (column.label ? index : last),
        -1
      );
      return {
        order: ordered.map((column) => column.column_id),
        gaps: ordered
          .slice(0, lastNamed)
          .map((column, index) => (!column.label ? index + 1 : null))
          .filter(Boolean)
      };
    });
  }

  async createBlankFile(schemaName = 'operations') {
    const baseId = `untitled-${Date.now()}`;
    const tableName = normalizeIdentifier(`untitled_file_${String(Date.now()).slice(-5)}`);
    await this.db.exec(`CREATE TABLE ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)} (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY)`);
    const file = await one(
      this.db,
      `INSERT INTO tabular.files(id, schema_name, table_name, display_name)
       VALUES ($1, $2, $3, 'Untitled File') RETURNING *`,
      [baseId, schemaName, tableName]
    );
    await this.setPresentation(file.id, { logicalRows: 1000, formats: {} });
    for (let index = 0; index < 10; index += 1) {
      await this.db.query(
        `INSERT INTO tabular.column_metadata
          (file_id, column_id, position, label, field_type, format_type)
         VALUES ($1, $2, $3, NULL, 'text', 'plain')`,
        [file.id, `future_${index + 1}`, index + 1]
      );
    }
    return file;
  }

  async importValues(input) {
    const tableName = normalizeIdentifier(input.tableName);
    const fileId = normalizeIdentifier(input.fileName).replaceAll('_', '-');
    const fingerprint = `fixture:${input.sourceKind}:q3-orders:248:6`;
    return this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO tabular.import_runs
          (id, schema_name, table_name, file_name, source_kind, state, warnings, fingerprint)
         VALUES ($1, $2, $3, $4, $5, 'staged', $6::jsonb, $7)`,
        [
          `import-${fileId}`,
          input.folder,
          tableName,
          input.fileName,
          input.sourceKind,
          JSON.stringify([
            { coordinate: 'F12', message: 'Cached formula value imported; formula not recreated.' }
          ]),
          fingerprint
        ]
      );
      await tx.exec(`
        CREATE TABLE ${quoteIdentifier(input.folder)}.${quoteIdentifier(tableName)} (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          order_id text,
          customer text,
          email text,
          status text,
          total numeric(12,2),
          paid boolean
        );
        INSERT INTO ${quoteIdentifier(input.folder)}.${quoteIdentifier(tableName)}
          (order_id, customer, email, status, total, paid)
        SELECT
          'Q3-' || lpad(sequence::text, 3, '0'),
          CASE sequence WHEN 1 THEN 'Northstar Market' WHEN 2 THEN 'Lumen Workshop'
            ELSE 'Imported customer ' || sequence END,
          'orders+' || sequence || '@example.test',
          CASE sequence % 3 WHEN 0 THEN 'Ready' WHEN 1 THEN 'Processing' ELSE 'Shipped' END,
          CASE sequence WHEN 1 THEN 12500.00 WHEN 2 THEN 8840.50 ELSE 1000.00 + sequence END,
          sequence % 2 = 0
        FROM generate_series(1, 248) AS sequence;
      `);
      const file = await one(
        tx,
        `INSERT INTO tabular.files(id, schema_name, table_name, display_name)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [fileId, input.folder, tableName, input.fileName]
      );
      const importedColumns = [
        ['order_id', 'Order ID', 'text', 'plain', true, true, 'text'],
        ['customer', 'Customer', 'text', 'plain', true, false, 'text'],
        ['email', 'Email', 'email', 'email-link', false, false, 'text'],
        ['status', 'Status', 'select', 'badge', false, false, 'text'],
        ['total', 'Total', 'price', 'currency', false, false, 'numeric(12,2)'],
        ['paid', 'Paid', 'switch', 'yes-no', false, false, 'boolean']
      ];
      for (let index = 0; index < importedColumns.length; index += 1) {
        const [columnId, label, fieldType, formatType, required, uniqueValues, storageType] = importedColumns[index];
        await tx.query(
          `INSERT INTO tabular.column_metadata
            (file_id, column_id, position, label, field_type, format_type,
             required, unique_values, pg_name, storage_type, config)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $2, $9, $10::jsonb)`,
          [
            file.id, columnId, index + 1, label, fieldType, formatType,
            required, uniqueValues, storageType,
            JSON.stringify(columnId === 'status'
              ? { options: ['Processing', 'Ready', 'Shipped'] }
              : columnId === 'total' ? { currency: 'PHP' } : {})
          ]
        );
      }
      for (let index = importedColumns.length; index < 10; index += 1) {
        await tx.query(
          `INSERT INTO tabular.column_metadata
            (file_id, column_id, position, label, field_type, format_type)
           VALUES ($1, $2, $3, NULL, 'text', 'plain')`,
          [file.id, `future_${index + 1}`, index + 1]
        );
      }
      await tx.query(
        `INSERT INTO tabular.presentation_state(session_id, file_id, state)
         VALUES ($1, $2, $3::jsonb)`,
        [this.sessionId, file.id, JSON.stringify({ logicalRows: 1000, formats: {} })]
      );
      await tx.query(
        `UPDATE tabular.import_runs SET state = 'committed'
         WHERE id = $1`,
        [`import-${fileId}`]
      );
      return { status: 'committed', file, fingerprint, importedRows: 248, warnings: 1 };
    });
  }

  async recordAction(fileId, actionType, forward, inverse) {
    await this.db.query(
      `INSERT INTO tabular.actions
        (session_id, file_id, action_type, forward, inverse)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [this.sessionId, fileId, actionType, JSON.stringify(forward), JSON.stringify(inverse)]
    );
    await this.db.query(
      `DELETE FROM tabular.actions
       WHERE session_id = $1 AND file_id = $2 AND id NOT IN (
         SELECT id FROM tabular.actions
         WHERE session_id = $1 AND file_id = $2
         ORDER BY id DESC LIMIT 100
       )`,
      [this.sessionId, fileId]
    );
  }

  async applyActionPayload(tx, actionType, payload) {
    if (actionType === 'edit-cell') {
      const column = await one(
        tx,
        `SELECT pg_name FROM tabular.column_metadata
         WHERE file_id = 'customer-orders' AND column_id = $1`,
        [payload.columnId]
      );
      await tx.query(
        `UPDATE operations.customer_orders
         SET ${quoteIdentifier(column.pg_name)} = $2, version = version + 1
         WHERE id = $1`,
        [payload.rowId, payload.value]
      );
      return;
    }
    if (actionType === 'rename-file' || actionType === 'table-settings') {
      await tx.query(
        `UPDATE tabular.files SET
           schema_name = $2, table_name = $3, display_name = $4,
           table_name_overridden = $5, kind = $6, edited_at = now()
         WHERE id = $1`,
        [
          payload.id,
          payload.schema_name,
          payload.table_name,
          payload.display_name,
          payload.table_name_overridden,
          payload.kind
        ]
      );
      return;
    }
    if (actionType === 'presentation') {
      await tx.query(
        `INSERT INTO tabular.presentation_state(session_id, file_id, state)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT(session_id, file_id) DO UPDATE SET state = excluded.state`,
        [this.sessionId, payload.fileId, JSON.stringify(payload.state)]
      );
      return;
    }
    throw new Error(`undo-not-demonstrated:${actionType}`);
  }

  async undo(fileId) {
    return this.db.transaction(async (tx) => {
      const action = await one(
        tx,
        `SELECT * FROM tabular.actions
         WHERE session_id = $1 AND file_id = $2 AND status = 'applied'
           AND action_type IN ('edit-cell', 'rename-file', 'table-settings', 'presentation')
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [this.sessionId, fileId]
      );
      if (!action) return { status: 'noop' };
      await this.applyActionPayload(tx, action.action_type, action.inverse);
      await tx.query("UPDATE tabular.actions SET status = 'undone' WHERE id = $1", [action.id]);
      return { status: 'undone', actionType: action.action_type, actionId: action.id };
    });
  }

  async redo(fileId) {
    return this.db.transaction(async (tx) => {
      const action = await one(
        tx,
        `SELECT * FROM tabular.actions
         WHERE session_id = $1 AND file_id = $2 AND status = 'undone'
           AND action_type IN ('edit-cell', 'rename-file', 'table-settings', 'presentation')
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [this.sessionId, fileId]
      );
      if (!action) return { status: 'noop' };
      await this.applyActionPayload(tx, action.action_type, action.forward);
      await tx.query("UPDATE tabular.actions SET status = 'applied' WHERE id = $1", [action.id]);
      return { status: 'redone', actionType: action.action_type, actionId: action.id };
    });
  }

  async actionSummary(fileId = 'customer-orders') {
    return one(
      this.db,
      `SELECT count(*)::integer AS total,
              count(*) FILTER (WHERE status = 'applied')::integer AS applied
       FROM tabular.actions WHERE file_id = $1`,
      [fileId]
    );
  }
}
