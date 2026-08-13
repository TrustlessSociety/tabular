//modules
import { useEffect, useMemo, useRef, useState } from 'react';

//client
import type { ImportEntryPageProps } from '../../explorer/helpers/contracts.js';
import type {
  ImportMapping,
  ImportSourceKind,
  ImportWizardStatus,
  ImportWizardStep
} from '../components/import-wizard.js';
import type { BrowserImportOperation, GoogleSpreadsheetChoice } from '../events/actions.js';
import { Icon } from '../../app/components/icon.js';
import { ImportWizard } from '../components/import-wizard.js';
import {
  dispatchImportMutation,
  listGoogleSpreadsheets,
  listGoogleWorksheets,
  loadGoogleImportAvailability,
  loadImportOperation,
  stageGoogleImport,
  startGoogleOAuth,
  uploadImportSource
} from '../events/actions.js';

const STORAGE_OPTIONS = [
  ['text', 'Text'],
  ['bigint', 'Integer'],
  ['numeric', 'Decimal'],
  ['boolean', 'True / false'],
  ['date', 'Date'],
  ['time', 'Time'],
  ['timestamptz', 'Date and time'],
  ['jsonb', 'JSON']
] as const;

/**
 * Render the import page component.
 */
export function ImportPage(props: ImportEntryPageProps) {
  const folder = props.snapshot.folders.find((entry) => entry.slug === props.route.folder)
    || props.snapshot.folders[0]!;
  const [step, setStep] = useState<ImportWizardStep>('choose-source');
  const [selectedSource, setSelectedSource] = useState<ImportSourceKind>('csv');
  const [operation, setOperation] = useState<BrowserImportOperation>();
  const [mapping, setMapping] = useState<BrowserImportOperation['mapping']>([]);
  const [mappingErrors, setMappingErrors] = useState<Record<string, string>>({});
  const [identity, setIdentity] = useState({ fileName: '', tableName: '' });
  const [status, setStatus] = useState<ImportWizardStatus>({ kind: 'ready' });
  const [googleAvailability, setGoogleAvailability] = useState<{
    disabled: boolean,
    reason?: string,
  }>({ disabled: true, reason: 'Checking Google credentials…' });
  const [googlePicker, setGooglePicker] = useState<{
    connected: boolean,
    spreadsheets: GoogleSpreadsheetChoice[],
    selectedSpreadsheetId?: string,
    worksheets: string[],
    selectedWorksheet?: string,
  }>({ connected: false, spreadsheets: [], worksheets: [] });
  const pollVersion = useRef(0);

  useEffect(() => {
    let active = true;
    void loadGoogleImportAvailability().then((result) => {
      if (!active) return;
      setGoogleAvailability(result.status === 'ok' && result.data.available
        ? { disabled: false }
        : {
          disabled: true,
          reason: result.status === 'ok'
            ? result.data.reason
            : result.error.message
        });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const google = url.searchParams.get('google');
    if (!google) return;
    url.searchParams.delete('google');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    if (google !== 'connected') {
      setSelectedSource('google-sheets');
      setStatus({
        kind: 'error',
        title: 'Google connection was not completed',
        message: 'Google denied or canceled the one-time read connection. No source values were staged.'
      });
      return;
    }
    setSelectedSource('google-sheets');
    setStatus({ kind: 'working', message: 'Loading the Google spreadsheets available to this connection…' });
    void listGoogleSpreadsheets(props.csrfToken).then(async (result) => {
      if (result.status === 'error') {
        setStatus({ kind: 'error', title: 'Google spreadsheets unavailable', message: result.error.message });
        return;
      }
      const first = result.data.files[0];
      setGooglePicker({
        connected: true,
        spreadsheets: result.data.files,
        ...(first ? { selectedSpreadsheetId: first.id } : {}),
        worksheets: []
      });
      if (!first) {
        setStatus({ kind: 'ready' });
        return;
      }
      const sheets = await listGoogleWorksheets(first.id, props.csrfToken);
      if (sheets.status === 'error') {
        setStatus({ kind: 'error', title: 'Google worksheets unavailable', message: sheets.error.message });
        return;
      }
      setGooglePicker((current) => ({
        ...current,
        worksheets: sheets.data.sheets,
        ...(sheets.data.sheets[0] ? { selectedWorksheet: sheets.data.sheets[0] } : {})
      }));
      setStatus({ kind: 'ready' });
    });
  }, []);

  useEffect(() => {
    if (!operation || !['confirmed', 'committing'].includes(operation.state)) return;
    const version = ++pollVersion.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /**
     * Return the poll result.
     */
    const poll = async () => {
      const result = await loadImportOperation(operation.id);
      if (version !== pollVersion.current) return;
      if (result.status === 'error') {
        setStatus({ kind: 'error', title: 'Import status unavailable', message: result.error.message });
        return;
      }
      setOperation(result.data);
      if (result.data.state === 'committed') {
        setStatus({
          kind: 'success',
          title: 'Import complete',
          message: `${result.data.counts.rows.toLocaleString()} rows were committed atomically to ${result.data.identity.fileName}.`
        });
        return;
      }
      if (result.data.state === 'failed') {
        setStatus({
          kind: 'error',
          title: 'Import rolled back',
          message: exposedError(result.data.error, 'No target table or partial rows were retained.')
        });
        return;
      }
      if (result.data.state === 'cancelled') {
        setStatus({
          kind: 'canceled',
          title: 'Import canceled',
          message: 'The staged source was canceled before its atomic commit.'
        });
        return;
      }
      setStatus({
        kind: 'progress',
        message: result.data.state === 'committing'
          ? 'Committing one PostgreSQL transaction'
          : 'Waiting for the isolated import worker',
        completedRows: result.data.state === 'committing' ? result.data.counts.rows : 0,
        totalRows: result.data.counts.rows,
        cancelable: false
      });
      timer = setTimeout(poll, 500);
    };
    void poll();
    return () => {
      pollVersion.current += 1;
      if (timer) clearTimeout(timer);
    };
  }, [operation?.id, operation?.state]);

  const wizardMapping = useMemo<ImportMapping[]>(() => mapping.map((entry) => ({
    id: String(entry.sourceColumn),
    sourceColumn: entry.sourceName,
    field: entry.storageType,
    fieldOptions: STORAGE_OPTIONS.map(([value, label]) => ({ value, label })),
    storage: storageLabel(entry.storageType),
    ...(mappingErrors[String(entry.sourceColumn)]
      ? { error: mappingErrors[String(entry.sourceColumn)] } : {})
  })), [mapping, mappingErrors]);

  /**
   * Return the choose file result.
   */
  const chooseFile = async (kind: 'csv' | 'xlsx', files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!folder.permissions.importFile) {
      setStatus({
        kind: 'error',
        title: 'Import unavailable',
        message: `You do not have permission to import into ${folder.displayName}.`
      });
      return;
    }
    setSelectedSource(kind);
    setStatus({ kind: 'working', message: `Reading ${file.name} within the bounded source limits…` });
    const result = await uploadImportSource({
      folderId: folder.id,
      kind,
      file,
      commandId: commandId(),
      csrfToken: props.csrfToken
    });
    if (result.status === 'error') {
      setStatus({ kind: 'error', title: 'Source could not be read', message: result.error.message });
      return;
    }
    acceptOperation(result.data);
    setStatus({ kind: 'ready' });
  };

  /**
   * Return the accept operation result.
   */
  const acceptOperation = (next: BrowserImportOperation) => {
    setOperation(next);
    setMapping(next.mapping);
    setIdentity({ fileName: next.identity.fileName, tableName: next.identity.tableName });
    setMappingErrors(issueMessages(next.issues));
  };

  /**
   * Save the review.
   */
  const saveReview = async () => {
    if (!operation) return false;
    setStatus({ kind: 'working', message: 'Validating every mapped value and destination identity…' });
    const result = await dispatchImportMutation({
      type: 'import.mapping',
      importId: operation.id,
      mapping,
      fileDisplayName: identity.fileName,
      tableName: identity.tableName
    }, props.csrfToken);
    if (result.status === 'error') {
      setStatus({ kind: 'error', title: 'Review needs attention', message: result.error.message });
      return false;
    }
    acceptOperation(result.data);
    if (result.data.counts.issues) {
      setStatus({
        kind: 'error',
        title: `${result.data.counts.issues.toLocaleString()} values need attention`,
        message: 'Choose a compatible PostgreSQL field type for every source column. No row will be silently skipped.'
      });
      const firstColumn = result.data.issues?.find((issue) => issue.columnNumber)?.columnNumber;
      if (firstColumn) requestAnimationFrame(() => {
        document.getElementById(`mapping-${firstColumn}`)?.focus();
      });
      return false;
    }
    setStatus({ kind: 'ready' });
    return true;
  };

  /**
   * Start the import.
   */
  const startImport = async () => {
    if (!operation || !await saveReview()) return;
    setStatus({ kind: 'working', message: 'Preparing a short-lived, authority-bound confirmation…' });
    const prepared = await dispatchImportMutation<{
      importId: string,
      confirmationToken: string,
      expiresAt: string,
    }>({ type: 'import.prepare-confirmation', importId: operation.id }, props.csrfToken);
    if (prepared.status === 'error') {
      setStatus({ kind: 'error', title: 'Import could not be confirmed', message: prepared.error.message });
      return;
    }
    const confirmed = await dispatchImportMutation({
      type: 'import.confirm',
      importId: operation.id,
      confirmationToken: prepared.data.confirmationToken
    }, props.csrfToken);
    if (confirmed.status === 'error') {
      setStatus({ kind: 'error', title: 'Import could not be confirmed', message: confirmed.error.message });
      return;
    }
    acceptOperation(confirmed.data);
    setStatus({
      kind: 'progress',
      message: 'Waiting for the isolated import worker',
      completedRows: 0,
      totalRows: confirmed.data.counts.rows,
      cancelable: true
    });
  };

  /**
   * Cancel the import.
   */
  const cancelImport = async () => {
    if (!operation) return;
    const result = await dispatchImportMutation({
      type: 'import.cancel', importId: operation.id
    }, props.csrfToken);
    if (result.status === 'error') {
      setStatus({ kind: 'error', title: 'Import could not be canceled', message: result.error.message });
      return;
    }
    acceptOperation(result.data);
    setStatus({
      kind: 'canceled', title: 'Import canceled', message: 'No destination table was created.'
    });
  };

  /**
   * Return the retry result.
   */
  const retry = async () => {
    if (operation?.state === 'cancelled') {
      setOperation(undefined);
      setMapping([]);
      setMappingErrors({});
      setIdentity({ fileName: '', tableName: '' });
      setStep('choose-source');
      setStatus({ kind: 'ready' });
      return;
    }
    if (operation?.state !== 'failed') {
      setStatus({ kind: 'ready' });
      return;
    }
    const result = await dispatchImportMutation({
      type: 'import.retry', importId: operation.id
    }, props.csrfToken);
    if (result.status === 'error') {
      setStatus({ kind: 'error', title: 'Retry unavailable', message: result.error.message });
      return;
    }
    acceptOperation(result.data);
    setStatus({ kind: 'ready' });
  };

  /**
   * Return the leave import result.
   */
  const leaveImport = async () => {
    if (operation && ['initiated', 'uploading', 'preview', 'ready'].includes(operation.state)) {
      const result = await dispatchImportMutation({ type: 'import.cancel', importId: operation.id }, props.csrfToken);
      if (result.status === 'error') {
        setStatus({ kind: 'error', title: 'Import could not be canceled', message: result.error.message });
        return;
      }
    }
    window.location.assign(`/pages/browse.html?folder=${folder.slug}`);
  };

  /**
   * Connect the google.
   */
  const connectGoogle = async () => {
    setStatus({ kind: 'working', message: 'Preparing a short-lived read-only Google connection…' });
    const result = await startGoogleOAuth(
      `/pages/import.html?folder=${encodeURIComponent(folder.slug)}`,
      props.csrfToken
    );
    if (result.status === 'error') {
      setStatus({ kind: 'error', title: 'Google connection could not start', message: result.error.message });
      return;
    }
    window.location.assign(result.data.authorizationUrl);
  };

  /**
   * Select the google spreadsheet.
   */
  const selectGoogleSpreadsheet = async (spreadsheetId: string) => {
    setGooglePicker((current) => {
      const { selectedWorksheet: _selectedWorksheet, ...rest } = current;
      return { ...rest, selectedSpreadsheetId: spreadsheetId, worksheets: [] };
    });
    setStatus({ kind: 'working', message: 'Loading worksheet names without reading their values…' });
    const result = await listGoogleWorksheets(spreadsheetId, props.csrfToken);
    if (result.status === 'error') {
      setStatus({ kind: 'error', title: 'Google worksheets unavailable', message: result.error.message });
      return;
    }
    setGooglePicker((current) => ({
      ...current,
      worksheets: result.data.sheets,
      ...(result.data.sheets[0] ? { selectedWorksheet: result.data.sheets[0] } : {})
    }));
    setStatus({ kind: 'ready' });
  };

  /**
   * Return the stage google result.
   */
  const stageGoogle = async () => {
    if (!googlePicker.selectedSpreadsheetId || !googlePicker.selectedWorksheet) return;
    setStatus({ kind: 'working', message: 'Reading the latest calculated values and pinning the source revision…' });
    const result = await stageGoogleImport({
      commandId: commandId(),
      folderId: folder.id,
      spreadsheetId: googlePicker.selectedSpreadsheetId,
      sheetName: googlePicker.selectedWorksheet
    }, props.csrfToken);
    if (result.status === 'error') {
      setStatus({ kind: 'error', title: 'Google Sheet could not be staged', message: result.error.message });
      return;
    }
    acceptOperation(result.data);
    setStatus({ kind: 'ready' });
  };

  const source = operation ? {
    kind: operation.source.kind,
    name: operation.source.name,
    rowCount: operation.counts.rows,
    columnCount: operation.counts.columns,
    sizeLabel: bytesLabel(operation.source.size),
    metadata: sourceMetadata(operation)
  } : undefined;
  const warningList = operation?.warnings.map((entry, index) => ({
    id: String(entry.code || index),
    title: String(entry.message || 'Source notice'),
    detail: entry.level === 'error' ? 'This issue must be resolved before import.' : 'Review this source-derived notice.',
    count: 1
  })) || [];
  const resultTable = String(operation?.result?.tableName || operation?.identity.tableName || '')
    .replaceAll('_', '-');

  return (
    <div className="explorer-shell import-page-shell">
      <header className="explorer-topbar import-focused-topbar">
        <a
          className="explorer-brand"
          href="/pages/browse.html"
          aria-label={`${props.snapshot.connection.displayName} files`}
        >
          <span className="explorer-brand-mark"><Icon name="grid" /></span>
          <strong>{props.snapshot.connection.displayName}</strong>
        </a>
        <span className="import-folder-context">{folder.displayName}</span>
        <a
          className="account-action"
          href="/auth/account"
          aria-label={`Account: ${props.identity.displayName}`}
          title={props.identity.displayName}
        >{identityInitials(props.identity.displayName)}</a>
        <button className="secondary-action import-close-action" type="button" onClick={() => void leaveImport()}>
          Close import
        </button>
      </header>
      <main className="explorer-main import-page-main">
        <nav className="explorer-crumbs" aria-label="Breadcrumb">
          <a href="/pages/browse.html">Files</a><span aria-hidden="true">›</span>
          <a href={`/pages/browse.html?folder=${folder.slug}`}>{folder.displayName}</a><span aria-hidden="true">›</span>
          <strong>Import values</strong>
        </nav>
        <ImportWizard
          step={step}
          folderLabel={folder.displayName}
          selectedSource={selectedSource}
          source={source}
          sheetOptions={operation?.source.kind === 'xlsx' && Array.isArray(operation.source.options.sheets)
            ? operation.source.options.sheets.filter((entry): entry is string => typeof entry === 'string')
            : undefined}
          selectedSheet={operation?.source.selectedSheet}
          googlePicker={googlePicker}
          sourceAvailability={{ 'google-sheets': googleAvailability }}
          mappings={wizardMapping}
          preview={{
            columns: mapping.map((entry) => entry.sourceName),
            rows: operation?.preview.map((row) => row.map((value) => value ?? '')) || []
          }}
          warnings={warningList}
          identity={operation ? {
            fileName: identity.fileName,
            tableName: identity.tableName,
            folderId: folder.id
          } : undefined}
          folderOptions={[{ id: folder.id, label: folder.displayName }]}
          summary={operation ? {
            records: `${operation.counts.rows.toLocaleString()} exact-value rows`,
            columns: `${mapping.filter((entry) => entry.include).length.toLocaleString()} mapped fields`,
            warnings: operation.counts.issues
              ? `${operation.counts.issues.toLocaleString()} blocking issues`
              : warningList.length ? `${warningList.length.toLocaleString()} reviewable notices` : 'No blocking issues'
          } : undefined}
          targetQualifiedName={operation ? `${operation.folder.name}.${identity.tableName}` : undefined}
          status={status}
          canPreview={(operation?.counts.columns || 0) > 0}
          canContinue={canReviewOperation(operation)}
          canImport={operation?.counts.issues === 0
            && Boolean(identity.fileName.trim()) && /^[a-z_][a-z0-9_]{0,62}$/.test(identity.tableName)}
          onSelectSource={(sourceKind) => {
            setSelectedSource(sourceKind);
            setOperation(undefined);
            setMapping([]);
            setMappingErrors({});
            setStatus({ kind: 'ready' });
          }}
          onChooseFile={(kind, files) => void chooseFile(kind, files)}
          onConnectGoogle={() => void connectGoogle()}
          onGoogleSpreadsheetChange={(spreadsheetId) => void selectGoogleSpreadsheet(spreadsheetId)}
          onGoogleWorksheetChange={(sheetName) => setGooglePicker((current) => ({
            ...current,
            selectedWorksheet: sheetName
          }))}
          onStageGoogle={() => void stageGoogle()}
          onSheetChange={(sheetName) => {
            if (!operation) return;
            setStatus({ kind: 'working', message: `Reading exact values from ${sheetName}…` });
            void dispatchImportMutation({
              type: 'import.sheet', importId: operation.id, sheetName
            }, props.csrfToken).then((result) => {
              if (result.status === 'error') {
                setStatus({ kind: 'error', title: 'Worksheet unavailable', message: result.error.message });
                return;
              }
              acceptOperation(result.data);
              setStatus({ kind: 'ready' });
            });
          }}
          onMappingChange={(mappingId, storageType) => {
            setMapping((current) => current.map((entry) => String(entry.sourceColumn) === mappingId
              ? { ...entry, storageType: storageType as BrowserImportOperation['mapping'][number]['storageType'] }
              : entry));
            setMappingErrors((current) => {
              const next = { ...current };
              delete next[mappingId];
              return next;
            });
            setStatus({ kind: 'ready' });
          }}
          onIdentityChange={(field, value) => {
            setIdentity((current) => ({ ...current, [field]: value }));
            setStatus({ kind: 'ready' });
          }}
          onFolderChange={() => undefined}
          onBack={() => {
            setStatus({ kind: 'ready' });
            setStep((current) => current === 'import' ? 'preview-values' : 'choose-source');
          }}
          onCancel={() => void leaveImport()}
          onNext={() => {
            if (step === 'choose-source') setStep('preview-values');
            else void saveReview().then((valid) => { if (valid) setStep('import'); });
          }}
          onImport={() => void startImport()}
          onRetry={() => void retry()}
          onCancelImport={() => void cancelImport()}
          onOpenImportedTable={() => window.location.assign(
            `/pages/table.html?folder=${folder.slug}&table=${resultTable}`
          )}
          onBackToFiles={() => window.location.assign(`/pages/browse.html?folder=${folder.slug}`)}
        />
      </main>
      <footer className="explorer-status">
        <span><i data-status={props.status} />Direct PostgreSQL boundary</span>
        <output>{operation ? `Import ${operation.state}` : 'Choose a one-time values source'}</output>
        <span>v{props.version}</span>
      </footer>
    </div>
  );
}

/**
 * Return the command id result.
 */
function commandId() {
  return `cmd_import_${Date.now()}_${crypto.randomUUID()}`;
}

/**
 * Creates a compact account mark from the verified server-side display name.
 */
function identityInitials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase()).join('') || '?';
}

/**
 * Report whether the caller can review operation.
 */
function canReviewOperation(operation?: BrowserImportOperation) {
  if (!operation || operation.counts.columns < 1) return false;
  if (operation.counts.issues === 0) return true;
  const issues = operation.issues || [];
  return issues.length === operation.counts.issues
    && issues.every((issue) => issue.code === 'mapping_conversion_failed');
}

/**
 * Return the bytes label result.
 */
function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Return the storage label result.
 */
function storageLabel(value: BrowserImportOperation['mapping'][number]['storageType']) {
  const sql: Record<typeof value, string> = {
    text: 'text',
    bigint: 'bigint',
    numeric: 'numeric',
    boolean: 'boolean',
    date: 'date',
    time: 'time',
    timestamptz: 'timestamp with time zone',
    jsonb: 'jsonb'
  };
  return sql[value];
}

/**
 * Return the source metadata result.
 */
function sourceMetadata(operation: BrowserImportOperation) {
  if (operation.source.kind === 'csv') {
    return `${operation.counts.rows.toLocaleString()} rows · header row detected · ${String(operation.source.options.encoding || 'detected encoding').toUpperCase()}`;
  }
  return operation.source.kind === 'xlsx'
    ? `${operation.counts.rows.toLocaleString()} rows · ${operation.source.selectedSheet || 'first worksheet'} · cached and literal values`
    : `${operation.counts.rows.toLocaleString()} rows · ${operation.source.selectedSheet || 'selected worksheet'} · latest calculated values`;
}

/**
 * Return the exposed error result.
 */
function exposedError(value: Record<string, unknown> | undefined, fallback: string) {
  return typeof value?.message === 'string' ? value.message : fallback;
}

/**
 * Return the issue messages result.
 */
function issueMessages(issues: BrowserImportOperation['issues']) {
  const grouped: Record<string, { count: number, message: string, }> = {};
  for (const issue of issues || []) {
    if (!issue.columnNumber) continue;
    const key = String(issue.columnNumber);
    const current = grouped[key];
    grouped[key] = current
      ? { count: current.count + 1, message: current.message }
      : { count: 1, message: issue.message };
  }
  return Object.fromEntries(Object.entries(grouped).map(([key, value]) => [
    key,
    `${value.count.toLocaleString()} ${value.count === 1 ? 'value' : 'values'}: ${value.message}`
  ]));
}
