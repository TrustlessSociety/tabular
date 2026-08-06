//modules
import type { ChangeEvent } from 'react';
import { useId } from 'react';

//client
import { Icon } from '../../ui/components/icon.js';

//The import source kind contract exported for module callers
export type ImportSourceKind = 'csv' | 'xlsx' | 'google-sheets';

//The import wizard step contract exported for module callers
export type ImportWizardStep = 'choose-source' | 'preview-values' | 'import';

//The import source summary contract exported for module callers
export type ImportSourceSummary = {
  kind: ImportSourceKind,
  name: string,
  rowCount: number,
  columnCount: number,
  sizeLabel?: string,
  metadata?: string,
};

//The import mapping contract exported for module callers
export type ImportMapping = {
  id: string,
  sourceColumn: string,
  field: string,
  fieldOptions: Array<{ value: string, label: string, }>,
  storage: string,
  error?: string,
};

//The import preview contract exported for module callers
export type ImportPreview = {
  columns: string[],
  rows: string[][],
};

//The import warning contract exported for module callers
export type ImportWarning = {
  id: string,
  title: string,
  detail: string,
  count: number,
};

//The import identity contract exported for module callers
export type ImportIdentity = {
  fileName: string,
  tableName: string,
  folderId: string,
  errors?: Partial<Record<'fileName' | 'tableName' | 'folderId', string>>,
};

//The import folder option contract exported for module callers
export type ImportFolderOption = {
  id: string,
  label: string,
};

//The import summary contract exported for module callers
export type ImportSummary = {
  records: string,
  columns: string,
  warnings: string,
};

//The google source picker contract exported for module callers
export type GoogleSourcePicker = {
  connected: boolean,
  spreadsheets: Array<{ id: string, name: string, }>,
  selectedSpreadsheetId?: string,
  worksheets: string[],
  selectedWorksheet?: string,
};

//The import wizard status contract exported for module callers
export type ImportWizardStatus =
  | { kind: 'ready', }
  | { kind: 'working', message: string, }
  | { kind: 'error', title: string, message: string, }
  | {
    kind: 'progress',
    message: string,
    completedRows: number,
    totalRows: number,
    cancelable: boolean,
  }
  | { kind: 'success', title: string, message: string, }
  | { kind: 'canceled', title: string, message: string, };

//The import wizard props contract exported for module callers
export type ImportWizardProps = {
  step: ImportWizardStep,
  folderLabel: string,
  selectedSource?: ImportSourceKind,
  source?: ImportSourceSummary,
  sheetOptions?: string[],
  selectedSheet?: string,
  googlePicker?: GoogleSourcePicker,
  sourceAvailability?: Partial<Record<ImportSourceKind, {
    disabled: boolean,
    reason?: string,
  }>>,
  mappings?: ImportMapping[],
  preview?: ImportPreview,
  warnings?: ImportWarning[],
  identity?: ImportIdentity,
  folderOptions?: ImportFolderOption[],
  summary?: ImportSummary,
  targetQualifiedName?: string,
  status?: ImportWizardStatus,
  canPreview?: boolean,
  canContinue?: boolean,
  canImport?: boolean,
  onSelectSource: (source: ImportSourceKind) => void,
  onChooseFile: (source: Extract<ImportSourceKind, 'csv' | 'xlsx'>, files: FileList | null) => void,
  onConnectGoogle: () => void,
  onGoogleSpreadsheetChange?: (spreadsheetId: string) => void,
  onGoogleWorksheetChange?: (sheetName: string) => void,
  onStageGoogle?: () => void,
  onSheetChange?: (sheetName: string) => void,
  onMappingChange: (mappingId: string, field: string) => void,
  onIdentityChange: (field: 'fileName' | 'tableName', value: string) => void,
  onFolderChange: (folderId: string) => void,
  onBack: () => void,
  onCancel: () => void,
  onNext: () => void,
  onImport: () => void,
  onRetry: () => void,
  onCancelImport: () => void,
  onOpenImportedTable: () => void,
  onBackToFiles: () => void,
};

const SOURCE_OPTIONS: Array<{
  kind: ImportSourceKind,
  label: string,
  description: string,
}> = [
  {
    kind: 'csv',
    label: 'CSV',
    description: 'Upload a comma-separated file and preserve each source token.'
  },
  {
    kind: 'xlsx',
    label: 'XLSX',
    description: 'Import cached values from an Excel workbook.'
  },
  {
    kind: 'google-sheets',
    label: 'Google Sheets',
    description: 'Connect once and import the latest calculated values.'
  }
];

const STEP_OPTIONS: Array<{ id: ImportWizardStep, label: string, }> = [
  { id: 'choose-source', label: 'Choose source' },
  { id: 'preview-values', label: 'Preview values' },
  { id: 'import', label: 'Import' }
];

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

/**
 * Renders the controlled, values-only import flow without owning transport state.
 */
export function ImportWizard(props: ImportWizardProps) {
  const titleId = useId();
  const status = props.status || { kind: 'ready' };
  const mappings = props.mappings || [];
  const warnings = props.warnings || [];
  const preview = props.preview || { columns: [], rows: [] };
  const stepIndex = STEP_OPTIONS.findIndex((step) => step.id === props.step);

  return (
    <section
      className="import-wizard"
      data-step={props.step}
      data-status={status.kind}
      aria-labelledby={titleId}
    >
      <h1 className="import-wizard-sr-only" id={titleId}>Import values</h1>
      <p className="import-wizard-intro">
        Review the source, inferred fields, and value fidelity before creating a table in this folder.
      </p>

      <div className="import-wizard-layout">
        <ol className="import-wizard-steps" aria-label="Import progress">
          {STEP_OPTIONS.map((step, index) => (
            <li
              className="import-wizard-step"
              data-active={index === stepIndex}
              data-complete={index < stepIndex}
              aria-current={index === stepIndex ? 'step' : undefined}
              key={step.id}
            >
              <span className="import-wizard-step-number" aria-hidden="true">{index + 1}</span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>

        <section className="import-wizard-panel">
          {props.step === 'choose-source' && (
            <ChooseSourceStep props={props} status={status} />
          )}
          {props.step === 'preview-values' && (
            <PreviewValuesStep
              props={props}
              status={status}
              mappings={mappings}
              preview={preview}
              warnings={warnings}
            />
          )}
          {props.step === 'import' && (
            <ImportStep props={props} status={status} />
          )}
        </section>
      </div>
    </section>
  );
}

/**
 * Renders source selection, file handoff, and the values-only contract.
 */
function ChooseSourceStep(props: {
  props: ImportWizardProps,
  status: ImportWizardStatus,
}) {
  const { props: wizard, status } = props;
  const isWorking = status.kind === 'working';
  const canPreview = wizard.canPreview ?? wizard.canContinue ?? Boolean(wizard.source);

  return (
    <>
      <header className="import-wizard-panel-header">
        <h2>Choose a source</h2>
        <p>This is a one-time cutover. Tabular will not keep the source synchronized.</p>
      </header>

      <div className="import-wizard-panel-body">
        <StatusNotice status={status} />
        <fieldset className="import-source-fieldset" disabled={isWorking}>
          <legend className="import-wizard-sr-only">Import source</legend>
          <div className="import-source-grid">
            {SOURCE_OPTIONS.map((option) => {
              const availability = wizard.sourceAvailability?.[option.kind];
              const reasonId = `import-source-${option.kind}-reason`;
              return (
                <label
                  className="import-source-card"
                  data-selected={wizard.selectedSource === option.kind}
                  data-disabled={Boolean(availability?.disabled)}
                  key={option.kind}
                >
                  <input
                    type="radio"
                    name="import-source"
                    value={option.kind}
                    checked={wizard.selectedSource === option.kind}
                    disabled={Boolean(availability?.disabled)}
                    aria-describedby={availability?.reason ? reasonId : undefined}
                    onChange={() => wizard.onSelectSource(option.kind)}
                  />
                  <span className="import-source-icon" aria-hidden="true"><Icon name="file-spreadsheet" /></span>
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                  {availability?.reason && (
                    <small id={reasonId}>{availability.reason}</small>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        {wizard.source && <SourceSummary source={wizard.source} />}
        {wizard.selectedSource && (
          <SourceAction
            selectedSource={wizard.selectedSource}
            disabled={isWorking || Boolean(wizard.sourceAvailability?.[wizard.selectedSource]?.disabled)}
            hasSource={Boolean(wizard.source)}
            onChooseFile={wizard.onChooseFile}
            onConnectGoogle={wizard.onConnectGoogle}
            googlePicker={wizard.googlePicker}
            onGoogleSpreadsheetChange={wizard.onGoogleSpreadsheetChange}
            onGoogleWorksheetChange={wizard.onGoogleWorksheetChange}
            onStageGoogle={wizard.onStageGoogle}
          />
        )}

        <div className="import-wizard-notice" role="note" aria-label="Values only">
          <span className="import-wizard-notice-icon" aria-hidden="true"><Icon name="warning" /></span>
          <span>
            <strong>Values only.</strong> Formulas, formatting, comments, notes, hyperlinks, and workbook behavior are not recreated.
          </span>
        </div>
      </div>

      <footer className="import-wizard-panel-footer">
        <button type="button" className="import-button import-button-secondary" onClick={wizard.onCancel}>
          Cancel
        </button>
        {status.kind === 'error' ? (
          <button type="button" className="import-button import-button-primary" onClick={wizard.onRetry}>
            Choose source
          </button>
        ) : (
          <button
            type="button"
            className="import-button import-button-primary"
            disabled={!canPreview || isWorking}
            onClick={wizard.onNext}
          >
            {isWorking ? 'Reading source…' : 'Preview values'}
          </button>
        )}
      </footer>
    </>
  );
}

/**
 * Renders mapping controls, exact-value samples, and attributable warnings.
 */
function PreviewValuesStep(props: {
  props: ImportWizardProps,
  status: ImportWizardStatus,
  mappings: ImportMapping[],
  preview: ImportPreview,
  warnings: ImportWarning[],
}) {
  const { props: wizard, status, mappings, preview, warnings } = props;
  const isWorking = status.kind === 'working';
  const canReview = wizard.canContinue ?? mappings.length > 0;

  return (
    <>
      <header className="import-wizard-panel-header">
        <h2>Preview values and fields</h2>
        <p>Confirm how source columns will become PostgreSQL columns.</p>
      </header>

      <div className="import-wizard-panel-body">
        <StatusNotice status={status} />
        {wizard.source && <SourceSummary source={wizard.source} ready={canReview} />}

        {wizard.source?.kind === 'xlsx' && (wizard.sheetOptions?.length || 0) > 1 && (
          <label className="import-field import-sheet-field">
            <span>Worksheet</span>
            <select
              name="import-worksheet"
              value={wizard.selectedSheet || wizard.sheetOptions?.[0]}
              disabled={isWorking}
              onChange={(event) => wizard.onSheetChange?.(event.target.value)}
            >
              {wizard.sheetOptions?.map((sheet) => (
                <option value={sheet} key={sheet}>{sheet}</option>
              ))}
            </select>
            <small>Choose exactly one worksheet. Formulas contribute cached values only.</small>
          </label>
        )}

        {mappings.length ? (
          <div className="import-mapping-wrap">
            <table className="import-mapping-table">
              <caption className="import-wizard-sr-only">Column mapping</caption>
              <thead>
                <tr>
                  <th scope="col">Source column</th>
                  <th scope="col">Field</th>
                  <th scope="col">PostgreSQL storage</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => {
                  const errorId = `mapping-${mapping.id}-error`;
                  return (
                    <tr key={mapping.id}>
                      <th scope="row" data-label="Source column">{mapping.sourceColumn}</th>
                      <td data-label="Field">
                        <label className="import-wizard-sr-only" htmlFor={`mapping-${mapping.id}`}>
                          Field mapping for {mapping.sourceColumn}
                        </label>
                        <select
                          id={`mapping-${mapping.id}`}
                          name={`mapping-${mapping.id}`}
                          value={mapping.field}
                          disabled={isWorking}
                          aria-invalid={Boolean(mapping.error)}
                          aria-describedby={mapping.error ? errorId : undefined}
                          onChange={(event) => wizard.onMappingChange(mapping.id, event.target.value)}
                        >
                          {mapping.fieldOptions.map((option) => (
                            <option value={option.value} key={option.value}>{option.label}</option>
                          ))}
                        </select>
                        {mapping.error && <small id={errorId} role="alert">{mapping.error}</small>}
                      </td>
                      <td className="import-storage" data-label="PostgreSQL storage" translate="no">
                        {mapping.storage}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="import-wizard-empty">No source columns are ready to map.</p>
        )}

        {preview.columns.length ? (
          <div className="import-preview-wrap" tabIndex={0} role="region" aria-label="Source value preview">
            <table className="import-preview-table">
              <caption className="import-wizard-sr-only">Sample source values</caption>
              <thead>
                <tr>{preview.columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={`preview-row-${rowIndex}`}>
                    {preview.columns.map((column, columnIndex) => (
                      <td key={`${column}-${columnIndex}`}>{row[columnIndex] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="import-wizard-empty">No sample values are available.</p>
        )}

        {warnings.length > 0 && (
          <ul className="import-warning-list" aria-label="Import warnings">
            {warnings.map((warning) => (
              <li key={warning.id}>
                <span className="import-wizard-notice-icon" aria-hidden="true"><Icon name="warning" /></span>
                <span><strong>{warning.title}</strong> {warning.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="import-wizard-panel-footer">
        <button
          type="button"
          className="import-button import-button-secondary"
          disabled={isWorking}
          onClick={wizard.onBack}
        >
          Back
        </button>
        {status.kind === 'error' ? (
          <button type="button" className="import-button import-button-primary" onClick={wizard.onRetry}>
            Revise mapping
          </button>
        ) : (
          <button
            type="button"
            className="import-button import-button-primary"
            disabled={!canReview || isWorking}
            onClick={wizard.onNext}
          >
            {isWorking ? 'Preparing preview…' : 'Review import'}
          </button>
        )}
      </footer>
    </>
  );
}

/**
 * Renders identity review, transactional progress, and terminal results.
 */
function ImportStep(props: {
  props: ImportWizardProps,
  status: ImportWizardStatus,
}) {
  const { props: wizard, status } = props;

  if (status.kind === 'progress') {
    return (
      <ProgressState
        source={wizard.source}
        status={status}
        onCancel={wizard.onCancelImport}
      />
    );
  }

  if (status.kind === 'success' || status.kind === 'canceled') {
    return (
      <ResultState
        status={status}
        onRetry={wizard.onRetry}
        onOpenImportedTable={wizard.onOpenImportedTable}
        onBackToFiles={wizard.onBackToFiles}
      />
    );
  }

  const identity = wizard.identity;
  const folders = wizard.folderOptions || [];
  const summary = wizard.summary;
  const isWorking = status.kind === 'working';
  const canImport = wizard.canImport ?? Boolean(identity && summary && wizard.targetQualifiedName);

  return (
    <>
      <header className="import-wizard-panel-header">
        <h2>Ready to import</h2>
        <p>Tabular will create one table and commit the reviewed values-only records.</p>
      </header>

      <div className="import-wizard-panel-body">
        <StatusNotice status={status} />
        {identity ? (
          <div className="import-identity-grid">
            <IdentityField
              label="File name"
              name="import-file-name"
              value={identity.fileName}
              error={identity.errors?.fileName}
              disabled={isWorking}
              onChange={(value) => wizard.onIdentityChange('fileName', value)}
            />
            <IdentityField
              label="Table name"
              name="import-table-name"
              value={identity.tableName}
              error={identity.errors?.tableName}
              disabled={isWorking}
              technical
              onChange={(value) => wizard.onIdentityChange('tableName', value)}
            />
            <label className="import-field">
              <span>Folder</span>
              <select
                name="import-folder"
                value={identity.folderId}
                disabled={isWorking || folders.length < 2}
                aria-invalid={Boolean(identity.errors?.folderId)}
                aria-describedby={identity.errors?.folderId ? 'import-folder-error' : undefined}
                onChange={(event) => wizard.onFolderChange(event.target.value)}
              >
                {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.label}</option>)}
              </select>
              {identity.errors?.folderId && (
                <small id="import-folder-error" role="alert">{identity.errors.folderId}</small>
              )}
            </label>
          </div>
        ) : (
          <p className="import-wizard-empty">Import identity is unavailable.</p>
        )}

        {summary && (
          <section className="import-summary" aria-labelledby="import-summary-title">
            <h3 id="import-summary-title">Import summary</h3>
            <dl>
              <div><dt>Records</dt><dd>{summary.records}</dd><dd className="import-ready-badge">Ready</dd></div>
              <div><dt>Columns</dt><dd>{summary.columns}</dd><dd className="import-ready-badge">Ready</dd></div>
              <div><dt>Warnings</dt><dd>{summary.warnings}</dd><dd className="import-ready-badge">Reviewable</dd></div>
            </dl>
          </section>
        )}

        {wizard.targetQualifiedName && (
          <div className="import-wizard-notice" role="note" aria-label="PostgreSQL destination">
            <span className="import-database-icon" aria-hidden="true"><Icon name="database" /></span>
            <span>
              The {wizard.folderLabel} folder will include this table. Advanced data source:{' '}
              <strong className="import-technical" translate="no">{wizard.targetQualifiedName}</strong>.
            </span>
          </div>
        )}
      </div>

      <footer className="import-wizard-panel-footer">
        <button
          type="button"
          className="import-button import-button-secondary"
          disabled={isWorking}
          onClick={wizard.onBack}
        >
          Back
        </button>
        {status.kind === 'error' ? (
          <button type="button" className="import-button import-button-primary" onClick={wizard.onRetry}>
            Retry import
          </button>
        ) : (
          <button
            type="button"
            className="import-button import-button-primary"
            disabled={!canImport || isWorking}
            onClick={wizard.onImport}
          >
            {isWorking ? 'Preparing import…' : 'Import values'}
          </button>
        )}
      </footer>
    </>
  );
}

/**
 * Renders the selected source and its parsed dimensions.
 */
function SourceSummary(props: { source: ImportSourceSummary, ready?: boolean, }) {
  const { source } = props;
  const sourceLabel = SOURCE_OPTIONS.find((option) => option.kind === source.kind)?.label || 'File';
  const dimensions = `${NUMBER_FORMAT.format(source.rowCount)} rows · ${NUMBER_FORMAT.format(source.columnCount)} columns`;
  const metadata = props.ready && source.metadata
    ? source.metadata
    : [dimensions, source.sizeLabel].filter(Boolean).join(' · ');

  return (
    <div className="import-source-summary">
      <span className="import-source-summary-icon" aria-hidden="true"><Icon name="file-spreadsheet" /></span>
      <span className="import-source-summary-copy">
        <strong>{source.name}</strong>
        <span>{sourceLabel} · {metadata}</span>
      </span>
      {props.ready && <span className="import-ready-badge">Values ready</span>}
    </div>
  );
}

/**
 * Exposes a native file picker or the one-time Google connection action.
 */
function SourceAction(props: {
  selectedSource: ImportSourceKind,
  disabled: boolean,
  hasSource: boolean,
  onChooseFile: ImportWizardProps['onChooseFile'],
  onConnectGoogle: () => void,
  googlePicker?: GoogleSourcePicker,
  onGoogleSpreadsheetChange?: ImportWizardProps['onGoogleSpreadsheetChange'],
  onGoogleWorksheetChange?: ImportWizardProps['onGoogleWorksheetChange'],
  onStageGoogle?: ImportWizardProps['onStageGoogle'],
}) {
  if (props.selectedSource === 'google-sheets') {
    const picker = props.googlePicker;
    if (picker?.connected) {
      return (
        <div className="import-source-action import-google-picker">
          {picker.spreadsheets.length ? (
            <>
              <label className="import-field">
                <span>Google spreadsheet</span>
                <select
                  name="google-spreadsheet"
                  value={picker.selectedSpreadsheetId || ''}
                  disabled={props.disabled}
                  onChange={(event) => props.onGoogleSpreadsheetChange?.(event.target.value)}
                >
                  <option value="" disabled>Select a spreadsheet</option>
                  {picker.spreadsheets.map((entry) => (
                    <option value={entry.id} key={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </label>
              <label className="import-field">
                <span>Worksheet</span>
                <select
                  name="google-worksheet"
                  value={picker.selectedWorksheet || ''}
                  disabled={props.disabled || !picker.selectedSpreadsheetId || !picker.worksheets.length}
                  onChange={(event) => props.onGoogleWorksheetChange?.(event.target.value)}
                >
                  <option value="" disabled>Select a worksheet</option>
                  {picker.worksheets.map((sheet) => <option value={sheet} key={sheet}>{sheet}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="import-button import-button-primary"
                disabled={props.disabled || !picker.selectedSpreadsheetId || !picker.selectedWorksheet}
                onClick={props.onStageGoogle}
              >
                Use Google Sheet
              </button>
            </>
          ) : (
            <p className="import-wizard-empty">No Google spreadsheets are available to this connection.</p>
          )}
          <button
            type="button"
            className="import-button import-button-secondary"
            disabled={props.disabled}
            onClick={props.onConnectGoogle}
          >
            Connect another account
          </button>
        </div>
      );
    }
    return (
      <div className="import-source-action">
        <button
          type="button"
          className="import-button import-button-secondary"
          disabled={props.disabled}
          onClick={props.onConnectGoogle}
        >
          {props.hasSource ? 'Choose another sheet' : 'Connect Google Sheets'}
        </button>
      </div>
    );
  }

  const fileSource = props.selectedSource;
  const isCsv = fileSource === 'csv';
  return (
    <div className="import-source-action">
      <label className="import-button import-button-secondary import-file-control">
        <span>{props.hasSource ? 'Choose another file' : `Choose ${isCsv ? 'CSV' : 'XLSX'} file`}</span>
        <input
          type="file"
          name="import-source-file"
          accept={isCsv ? '.csv,text/csv' : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
          disabled={props.disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            props.onChooseFile(fileSource, event.currentTarget.files);
          }}
        />
      </label>
    </div>
  );
}

/**
 * Associates a controlled identity input with its recoverable validation error.
 */
function IdentityField(props: {
  label: string,
  name: string,
  value: string,
  error?: string,
  disabled: boolean,
  technical?: boolean,
  onChange: (value: string) => void,
}) {
  const errorId = `${props.name}-error`;
  return (
    <label className="import-field">
      <span>{props.label}</span>
      <input
        className={props.technical ? 'import-technical' : undefined}
        type="text"
        name={props.name}
        value={props.value}
        disabled={props.disabled}
        autoComplete="off"
        spellCheck={!props.technical}
        aria-invalid={Boolean(props.error)}
        aria-describedby={props.error ? errorId : undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.error && <small id={errorId} role="alert">{props.error}</small>}
    </label>
  );
}

/**
 * Announces asynchronous and recoverable errors without replacing retained input.
 */
function StatusNotice(props: { status: ImportWizardStatus, }) {
  if (props.status.kind === 'error') {
    return (
      <div className="import-status import-status-error" role="alert">
        <strong>{props.status.title}</strong>
        <span>{props.status.message}</span>
      </div>
    );
  }

  if (props.status.kind === 'working') {
    return (
      <div className="import-status" role="status" aria-live="polite">
        <strong>Working</strong>
        <span>{props.status.message}</span>
      </div>
    );
  }

  return null;
}

/**
 * Announces transactional progress and preserves the safe cancellation boundary.
 */
function ProgressState(props: {
  source?: ImportSourceSummary,
  status: Extract<ImportWizardStatus, { kind: 'progress', }>,
  onCancel: () => void,
}) {
  const maximum = Math.max(1, props.status.totalRows);
  const current = Math.min(maximum, Math.max(0, props.status.completedRows));
  return (
    <>
      <header className="import-wizard-panel-header">
        <h2>{props.status.cancelable ? 'Importing values' : 'Finishing import'}</h2>
        <p>Tabular is validating typed values and preparing one transaction.</p>
      </header>
      <div className="import-wizard-panel-body import-progress" role="status" aria-live="polite">
        {props.source && <SourceSummary source={props.source} />}
        <strong>{props.status.message}</strong>
        <progress aria-label="Import progress" max={maximum} value={current} />
        <span>{NUMBER_FORMAT.format(current)} of {NUMBER_FORMAT.format(props.status.totalRows)} rows prepared</span>
      </div>
      <footer className="import-wizard-panel-footer import-progress-footer">
        <button
          type="button"
          className="import-button import-button-secondary"
          disabled={!props.status.cancelable}
          title={props.status.cancelable ? undefined : 'The transaction is finishing and can no longer be canceled.'}
          onClick={props.onCancel}
        >
          {props.status.cancelable ? 'Cancel import' : 'Finishing import…'}
        </button>
      </footer>
    </>
  );
}

/**
 * Renders stable success or canceled outcomes and their explicit next actions.
 */
function ResultState(props: {
  status: Extract<ImportWizardStatus, { kind: 'success' | 'canceled', }>,
  onRetry: () => void,
  onOpenImportedTable: () => void,
  onBackToFiles: () => void,
}) {
  const isSuccess = props.status.kind === 'success';
  return (
    <section className="import-result" role="status" aria-live="polite">
      <span className="import-result-icon" aria-hidden="true"><Icon name={isSuccess ? 'success' : 'canceled'} /></span>
      <h2>{props.status.title}</h2>
      <p>{props.status.message}</p>
      <div className="import-result-actions">
        {isSuccess ? (
          <button type="button" className="import-button import-button-primary" onClick={props.onOpenImportedTable}>
            Open imported table
          </button>
        ) : (
          <button type="button" className="import-button import-button-primary" onClick={props.onRetry}>
            Start a new import
          </button>
        )}
        <button type="button" className="import-button import-button-secondary" onClick={props.onBackToFiles}>
          Back to files
        </button>
      </div>
    </section>
  );
}
