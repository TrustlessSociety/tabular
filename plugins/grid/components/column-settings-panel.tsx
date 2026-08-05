import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExplorerFile, ExplorerFolder } from '../../explorer/helpers/contracts.js';
import type {
  FileDescription,
  FileDdlAction,
  DdlLiteral,
  FileFieldKind,
  FileFormatKind,
  FileStorageType,
  PlannedFileDdl
} from '../../files/helpers/contracts.js';
import { Icon } from '../../ui/components/icon.js';
import {
  confirmGridDdl,
  loadFileDescription,
  planGridDdl
} from '../events/actions.js';
import type { GridColumn } from '../helpers/contracts.js';

export type ColumnForm = {
  displayName: string;
  physicalName: string;
  storageType: FileStorageType;
  field: FileFieldKind;
  format: FileFormatKind;
  defaultValue: string;
  required: boolean;
  unique: boolean;
  generated: boolean;
  optionsText: string;
  targetFileId: string;
  targetConstraintName: string;
  sourceColumnIds: string[];
  pickerTemplate: string;
  outputTemplate: string;
};

export function ColumnSettingsPanel({
  open,
  file,
  columns,
  columnId,
  folders,
  csrfToken,
  triggerRef,
  onClose,
  onConfirmed
}: {
  open: boolean;
  file: ExplorerFile;
  columns: GridColumn[];
  columnId?: string;
  folders: ExplorerFolder[];
  csrfToken: string;
  triggerRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onConfirmed: (message: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const selected = columns.find((column) => column.id === columnId);
  const [targetDescription, setTargetDescription] = useState<FileDescription>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlannedFileDdl>();
  const [physicalNameOverridden, setPhysicalNameOverridden] = useState(false);
  const [targetSearch, setTargetSearch] = useState('');
  const [form, setForm] = useState<ColumnForm>(() => initialForm(selected, file));
  const targets = useMemo(() => folders.flatMap((folder) => folder.files.map((candidate) => ({
    ...candidate,
    folderName: folder.displayName
  }))).filter((candidate) => candidate.kind === 'table' || candidate.kind === 'partitioned-table'), [folders]);
  const eligibleKeys = targetDescription?.constraints.filter((constraint) =>
    constraint.kind === 'p' || constraint.kind === 'u'
  ) || [];

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(selected, file));
    setPlan(undefined);
    setError(undefined);
    setPhysicalNameOverridden(false);
    setTargetDescription(undefined);
    setTargetSearch('');
    requestAnimationFrame(() => closeButton.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(panel.current?.querySelectorAll<HTMLElement>(
        'button, input, select, textarea'
      ) || [])].filter((item) => !item.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, file.id, columnId]);

  useEffect(() => {
    if (!form.targetFileId) {
      setTargetDescription(undefined);
      return;
    }
    let cancelled = false;
    void loadFileDescription(form.targetFileId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setTargetDescription(result.data);
        const savedConstraintName = matchingRelationConstraintName(selected, result.data);
        setForm((current) => ({
          ...current,
          targetConstraintName: current.targetConstraintName
            || (current.targetFileId === selected?.relation?.targetFileId
              ? savedConstraintName
              : '')
        }));
      } else setError(result.message);
    });
    return () => { cancelled = true; };
  }, [form.targetFileId]);

  if (!open) return null;
  const readOnly = Boolean(selected && (
    selected.generated || selected.key || selected.editable === false
  ));

  const submitPlan = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const action = buildColumnSettingsAction(file, selected, columns, form, eligibleKeys);
      const result = await planGridDdl(action, csrfToken);
      if (result.status === 'error') {
        setError(result.error.message);
        return;
      }
      setPlan(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The column plan is invalid.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPlan = async () => {
    if (!plan) return;
    setBusy(true);
    setError(undefined);
    const result = await confirmGridDdl(
      plan.requestId,
      plan.confirmationToken,
      csrfToken
    );
    setBusy(false);
    if (result.status === 'error') {
      setError(result.error.message);
      return;
    }
    onConfirmed('Column change approved. PostgreSQL is applying it in the background.');
    onClose();
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className="column-settings-layer">
      <aside
        ref={panel}
        className="column-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="column-settings-title"
      >
        <header>
          <div>
            <span className="panel-kicker">COLUMN</span>
            <h2 id="column-settings-title">{selected ? `Configure ${selected.label}` : 'New column'}</h2>
          </div>
          <button ref={closeButton} className="icon-button" type="button" aria-label="Close column settings" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="column-settings-body">
          {readOnly && (
            <div className="column-readonly-note" role="status">
              Generated, identity, and stable-key columns stay read-only in the grid.
            </div>
          )}
          <fieldset disabled={busy || Boolean(plan)}>
            <legend>Column</legend>
            <label>
              <span>Column name</span>
              <input value={form.displayName} onChange={(event) => setForm((current) => ({
                ...current,
                displayName: event.target.value,
                ...(!selected && !physicalNameOverridden
                  ? { physicalName: normalizeColumnName(event.target.value) }
                  : {})
              }))} />
            </label>
            <label>
              <span>Field</span>
              <select aria-label="Field" value={form.field} onChange={(event) => setForm((current) => ({
                ...current,
                field: event.target.value as FileFieldKind,
                storageType: storageForField(event.target.value as FileFieldKind),
                format: formatForField(event.target.value as FileFieldKind)
              }))}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="email">Email</option>
                <option value="url">URL</option>
                <option value="phone">Phone</option>
                <option value="relation">Relation</option>
                <option value="select">Select</option>
                <option value="price">Price</option>
                <option value="switch">Switch</option>
                <option value="date-time">Date and time</option>
                {!selected && <option value="computed">Generated text</option>}
              </select>
              <small>Field controls data entry and validation.</small>
            </label>
          </fieldset>

          {form.field === 'relation' && (
            <fieldset disabled={busy || Boolean(plan)}>
              <legend>Relation</legend>
              <label>
                <span>File</span>
                <input
                  type="search"
                  value={targetSearch}
                  placeholder="Search authorized files"
                  aria-label="Search relation files"
                  onChange={(event) => setTargetSearch(event.target.value)}
                />
                <select aria-label="File" value={form.targetFileId} onChange={(event) => setForm((current) => ({
                  ...current,
                  targetFileId: event.target.value,
                  targetConstraintName: '',
                  sourceColumnIds: selected ? [selected.id] : []
                }))}>
                  <option value="">Choose an authorized file</option>
                  {folders.map((targetFolder) => {
                    const choices = targets.filter((target) => target.folderId === targetFolder.id)
                      .filter((target) => `${target.folderName} ${target.displayName}`.toLowerCase().includes(targetSearch.trim().toLowerCase()));
                    return choices.length ? (
                      <optgroup key={targetFolder.id} label={targetFolder.displayName}>
                        {choices.map((target) => <option key={target.id} value={target.id}>{target.displayName}</option>)}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>
              <label>
                <span>Key</span>
                <select
                  aria-label="Key"
                  value={form.targetConstraintName}
                  disabled={!eligibleKeys.length}
                  onChange={(event) => {
                    const key = eligibleKeys.find((candidate) => candidate.name === event.target.value);
                    setForm((current) => ({
                      ...current,
                      targetConstraintName: event.target.value,
                      sourceColumnIds: key
                        ? Array.from({ length: key.columnIds.length }, (_, index) => current.sourceColumnIds[index] || (index === 0 ? selected?.id || '' : ''))
                        : []
                    }));
                  }}
                >
                  <option value="">{targetDescription ? 'Choose an eligible key' : 'Choose a file first'}</option>
                  {eligibleKeys.map((key) => (
                    <option key={key.name} value={key.name}>
                      {key.columnIds.map((id) => targetDescription?.columns.find((column) => column.id === id)?.displayName || id).join(' + ')}
                    </option>
                  ))}
                </select>
                {targetDescription && !eligibleKeys.length && <small>No eligible primary or unique key is visible.</small>}
              </label>
              {eligibleKeys.find((key) => key.name === form.targetConstraintName)?.columnIds.map((targetColumnId, index) => (
                <label key={targetColumnId}>
                  <span>Source for {targetDescription?.columns.find((column) => column.id === targetColumnId)?.displayName || `key part ${index + 1}`}</span>
                  <select value={form.sourceColumnIds[index] || ''} onChange={(event) => setForm((current) => ({
                    ...current,
                    sourceColumnIds: current.sourceColumnIds.map((value, position) => position === index ? event.target.value : value)
                  }))}>
                    <option value="">Choose a source column</option>
                    {columns.filter((column) => !column.generated).map((column) => (
                      <option
                        key={column.id}
                        value={column.id}
                        disabled={form.sourceColumnIds.some((value, position) => position !== index && value === column.id)}
                      >{column.label || column.coordinate}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                <span>Display format</span>
                <input aria-label="Display format" value={form.pickerTemplate} onChange={(event) => setForm((current) => ({
                  ...current,
                  pickerTemplate: event.target.value
                }))} />
                <small>Used only by the searchable relation picker.</small>
              </label>
            </fieldset>
          )}

          {form.field === 'select' && (
            <fieldset disabled={busy || Boolean(plan)}>
              <legend>Select options</legend>
              <label>
                <span>Allowed values</span>
                <textarea
                  aria-label="Allowed values"
                  rows={5}
                  value={form.optionsText}
                  placeholder={'Draft\nReview\nApproved'}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    optionsText: event.target.value
                  }))}
                />
                <small>One stored value per line. Empty and duplicate lines are removed.</small>
              </label>
            </fieldset>
          )}

          <fieldset disabled={busy || Boolean(plan)}>
            <legend>Format</legend>
            <label>
              <span>Format</span>
              <select aria-label="Format" value={form.format} onChange={(event) => setForm((current) => ({
                ...current,
                format: event.target.value as FileFormatKind
              }))}>
                <option value="plain-text">Plain text</option>
                <option value="email-link">Email link</option>
                <option value="link">Link</option>
                <option value="phone-link">Phone link</option>
                <option value="number">Number</option>
                <option value="currency">Currency</option>
                <option value="badge">Badge</option>
                <option value="yes-no">Yes / No</option>
                <option value="date-time">Date and time</option>
                <option value="related-record">Related record</option>
              </select>
              <small>Format changes read-cell display only; it does not rewrite stored values.</small>
            </label>
            {form.field === 'relation' && form.format === 'related-record' && (
              <label>
                <span>Display format</span>
                <input aria-label="Display format" value={form.outputTemplate} onChange={(event) => setForm((current) => ({
                  ...current,
                  outputTemplate: event.target.value
                }))} />
                <small>Used only by the saved relation cell.</small>
              </label>
            )}
          </fieldset>

          <fieldset disabled={busy || Boolean(plan)}>
            <legend>Constraints</legend>
            <label className="check-row"><input type="checkbox" checked={form.required} onChange={(event) => setForm((current) => ({ ...current, required: event.target.checked }))} /> Required</label>
            <label className="check-row"><input type="checkbox" checked={form.unique} onChange={(event) => setForm((current) => ({ ...current, unique: event.target.checked }))} /> Unique</label>
            <label>
              <span>Default</span>
              <input value={form.defaultValue} placeholder="No default" onChange={(event) => setForm((current) => ({ ...current, defaultValue: event.target.value }))} />
            </label>
          </fieldset>

          <details>
            <summary>Advanced</summary>
            <label>
              <span>PostgreSQL column name</span>
              <input className="technical-input" value={form.physicalName} onChange={(event) => {
                setPhysicalNameOverridden(true);
                setForm((current) => ({
                  ...current,
                  physicalName: normalizeColumnName(event.target.value)
                }));
              }} />
            </label>
            <dl className="column-impact-list">
              <div><dt>Storage</dt><dd>{form.storageType}</dd></div>
              <div><dt>Generated</dt><dd>{selected?.generated || form.generated ? 'Read-only' : 'No'}</dd></div>
              <div><dt>Applied by</dt><dd>Background PostgreSQL update</dd></div>
            </dl>
            <p className="ddl-warning">Changing storage or the PostgreSQL name may require a cast, rename, existing-value review, and a background schema update.</p>
          </details>

          {plan && (
            <section className="ddl-impact" aria-labelledby="ddl-impact-title">
              <span className="panel-kicker">SCHEMA REVIEW</span>
              <h3 id="ddl-impact-title">Review schema impact</h3>
              <p>{impactMessage(plan.actionType, form, targetDescription)}</p>
              <dl>
                <div><dt>Action</dt><dd>{plan.actionType}</dd></div>
                <div><dt>Expires</dt><dd>{new Date(plan.expiresAt).toLocaleTimeString()}</dd></div>
              </dl>
              <p className="ddl-warning">Your grid selection and pending edits stay in place if confirmation fails.</p>
            </section>
          )}
          {error && <div className="panel-error" role="alert">{error}</div>}
        </div>
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          {plan
            ? <button className="primary-action" type="button" disabled={busy} onClick={confirmPlan}>{busy ? 'Applying…' : 'Apply column change'}</button>
            : <button className="primary-action" type="button" disabled={busy || readOnly} onClick={submitPlan}>{busy ? 'Planning…' : 'Review change'}</button>}
        </footer>
      </aside>
    </div>
  );
}

function initialForm(column: GridColumn | undefined, file: ExplorerFile): ColumnForm {
  const name = column?.label || 'New column';
  const field = (column?.field || fieldForGridKind(column?.kind)) as FileFieldKind;
  return {
    displayName: name,
    physicalName: column?.physicalName || (column ? normalizeColumnName(name) : 'new_column'),
    storageType: (column?.storageCodec === 'integer' ? 'bigint' : column?.storageCodec === 'decimal' ? 'numeric' : column?.storageCodec === 'json' ? 'jsonb' : column?.storageCodec || 'text') as FileStorageType,
    field,
    format: (column?.format || formatForField(field)) as FileFormatKind,
    defaultValue: column?.defaultValue === null || typeof column?.defaultValue === 'undefined' ? '' : String(column.defaultValue),
    required: Boolean(column?.required),
    unique: Boolean(column?.unique),
    generated: Boolean(column?.generated),
    optionsText: (column?.options || [])
      .filter((option) => !option.restricted)
      .map((option) => option.value)
      .join('\n'),
    targetFileId: column?.relation?.targetFileId || '',
    targetConstraintName: '',
    sourceColumnIds: column?.relation?.sourceColumnIds || (column ? [column.id] : []),
    pickerTemplate: column?.relation?.pickerTemplate || '{{label}} — {{key}}',
    outputTemplate: column?.relation?.outputTemplate || '{{label}}',
  };
}

export function matchingRelationConstraintName(
  column: GridColumn | undefined,
  description: Pick<FileDescription, 'constraints'>
) {
  const targetColumnIds = column?.relation?.targetColumnIds;
  if (!targetColumnIds?.length) return '';
  return description.constraints.find((constraint) => (
    (constraint.kind === 'p' || constraint.kind === 'u')
    && constraint.columnIds.length === targetColumnIds.length
    && constraint.columnIds.every((columnId, index) => columnId === targetColumnIds[index])
  ))?.name || '';
}

function normalizeColumnName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 63)
    || 'new_column';
}

export function buildColumnSettingsAction(
  file: ExplorerFile,
  selected: GridColumn | undefined,
  columns: GridColumn[],
  form: ColumnForm,
  eligibleKeys: FileDescription['constraints']
): FileDdlAction {
  if (!file.id.startsWith('obj_')) throw new Error('Save this file before changing its PostgreSQL columns.');
  const commandId = `cmd_column_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  if (form.field === 'relation') {
    if (!selected) throw new Error('Create the source column before adding a relation.');
    const key = eligibleKeys.find((candidate) => candidate.name === form.targetConstraintName);
    if (!form.targetFileId || !key) throw new Error('Choose an eligible relation file and complete key.');
    const source = form.sourceColumnIds;
    if (
      source.length !== key.columnIds.length
      || new Set(source).size !== source.length
      || source.some((id) => !columns.some((column) => column.id === id))
    ) throw new Error('Map every target key part to one explicit, distinct source column.');
    return {
      type: 'relation.create',
      commandId,
      fileId: file.id,
      columnIds: source,
      targetFileId: form.targetFileId,
      targetColumnIds: key.columnIds,
      fieldConfig: {
        pickerTemplate: form.pickerTemplate
      },
      formatConfig: {
        outputTemplate: form.outputTemplate
      },
      onUpdate: 'NO ACTION',
      onDelete: 'NO ACTION'
    };
  }
  const defaultValue = form.defaultValue
    ? { mode: 'literal' as const, value: literalDefault(form.storageType, form.defaultValue) }
    : undefined;
  const selectConfig = form.field === 'select'
    ? { options: [...new Set(form.optionsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))] }
    : undefined;
  if (!selected) {
    return {
      type: 'column.create',
      commandId,
      fileId: file.id,
      displayName: form.displayName,
      physicalName: form.physicalName,
      storageType: form.storageType,
      field: form.field,
      format: form.format,
      ...(selectConfig ? { fieldConfig: selectConfig } : {}),
      required: form.required,
      unique: form.unique,
      ...(defaultValue ? { default: defaultValue } : {}),
      ...(form.field === 'computed' ? {
        generated: {
          kind: 'concat-text' as const,
          columnIds: columns.filter((column) => column.storageCodec === 'text').slice(0, 2).map((column) => column.id),
          separator: ' '
        }
      } : {})
    };
  }
  return {
    type: 'column.configure',
    commandId,
    fileId: file.id,
    columnId: selected.id,
    displayName: form.displayName,
    physicalName: form.physicalName,
    storageType: form.storageType,
    field: form.field,
    format: form.format,
    ...(selectConfig ? { fieldConfig: selectConfig } : {}),
    required: form.required,
    unique: form.unique,
    ...(defaultValue ? { default: defaultValue } : {})
  };
}

function literalDefault(storage: FileStorageType, value: string): DdlLiteral {
  if (storage === 'boolean') return { type: 'boolean' as const, value: value === 'true' };
  if (storage === 'jsonb') return { type: 'jsonb' as const, value };
  return { type: storage, value } as DdlLiteral;
}

function storageForField(field: FileFieldKind): FileStorageType {
  if (field === 'number' || field === 'price' || field === 'rating' || field === 'slider') return 'numeric';
  if (field === 'checkbox' || field === 'switch') return 'boolean';
  if (field === 'date') return 'date';
  if (field === 'date-time') return 'timestamptz';
  return 'text';
}

function formatForField(field: FileFieldKind): FileFormatKind {
  if (field === 'number') return 'number';
  if (field === 'email') return 'email-link';
  if (field === 'url') return 'link';
  if (field === 'phone') return 'phone-link';
  if (field === 'price') return 'currency';
  if (field === 'checkbox' || field === 'switch') return 'yes-no';
  if (field === 'date') return 'date';
  if (field === 'date-time') return 'date-time';
  if (field === 'select' || field === 'radio') return 'badge';
  if (field === 'relation') return 'related-record';
  return 'plain-text';
}

function fieldForGridKind(kind: GridColumn['kind']): FileFieldKind {
  if (kind === 'number') return 'number';
  if (kind === 'boolean') return 'checkbox';
  if (kind === 'date') return 'date';
  if (kind === 'select') return 'select';
  if (kind === 'relation') return 'relation';
  if (kind === 'email') return 'email';
  if (kind === 'url') return 'url';
  if (kind === 'phone') return 'phone';
  if (kind === 'price') return 'price';
  if (kind === 'switch') return 'switch';
  if (kind === 'datetime') return 'date-time';
  return 'text';
}

function impactMessage(
  actionType: FileDdlAction['type'],
  form: ColumnForm,
  target?: FileDescription
) {
  if (actionType === 'relation.create') {
    return `Create a native same-database relation to ${target?.physical.schema || 'the target schema'}.${target?.physical.name || 'table'} with NO ACTION referential behavior.`;
  }
  return `${actionType === 'column.create' ? 'Create' : 'Alter'} ${form.displayName} as ${form.storageType}; PostgreSQL constraints remain authoritative.`;
}
