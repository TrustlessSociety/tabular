//modules
import { useEffect, useMemo, useRef, useState } from 'react';

//client
import type { ExplorerFile, ExplorerFolder } from '../../explorer/helpers/contracts.js';
import type {
  FileDescription,
  FileDdlAction,
  DdlLiteral,
  FileFieldKind,
  FileFormatKind,
  FileStorageType,
  PlannedFileDdl,
  ValidatorConfig,
  ValidatorRuleConfig,
  ValidatorRuleKind
} from '../../files/helpers/contracts.js';
import type { GridColumn } from '../helpers/contracts.js';
import { canonicalJsonValue } from '../../capability/helpers/value-contracts.js';
import { Icon } from '../../app/components/icon.js';
import {
  EMPTY_VALIDATOR_CONFIG,
  FIELD_REGISTRY,
  FORMAT_REGISTRY,
  columnAxesAreCompatible,
  recommendedColumnAxes
} from '../../files/helpers/field-registry.js';
import {
  compileValidatorPlan,
  compatibleValidatorRuleKinds
} from '../../files/helpers/validator-engine.js';
import {
  confirmGridDdl,
  loadFileDescription,
  planGridDdl,
  updateGridColumnPresentation
} from '../events/actions.js';

//The column form contract exported for module callers
export type ColumnForm = {
  displayName: string,
  physicalName: string,
  storageType: FileStorageType,
  field: FileFieldKind,
  format: FileFormatKind,
  fieldConfig: Record<string, unknown>,
  formatConfig: Record<string, unknown>,
  validatorConfig: ValidatorConfig,
  metadataVersion: number,
  defaultValue: string,
  required: boolean,
  unique: boolean,
  generated: boolean,
  optionsText: string,
  targetFileId: string,
  targetConstraintName: string,
  sourceColumnIds: string[],
  pickerTemplate: string,
  outputTemplate: string,
};

/**
 * Render the column settings panel component.
 */
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
  open: boolean,
  file: ExplorerFile,
  columns: GridColumn[],
  columnId?: string,
  folders: ExplorerFolder[],
  csrfToken: string,
  triggerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  onConfirmed: (message: string, refreshMetadata?: boolean) => void,
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
  const [validatorKind, setValidatorKind] = useState<ValidatorRuleKind>('not_empty');
  const [form, setForm] = useState<ColumnForm>(() => initialForm(selected));
  const targets = useMemo(() => folders.flatMap((folder) => folder.files.map((candidate) => ({
    ...candidate,
    folderName: folder.displayName
  }))).filter((candidate) => candidate.kind === 'table' || candidate.kind === 'partitioned-table'), [folders]);
  const eligibleKeys = targetDescription?.constraints.filter((constraint) =>
    constraint.kind === 'p' || constraint.kind === 'u'
  ) || [];
  const compatibleFormats = useMemo(
    () => compatibleFormatKinds(form.storageType, form.field),
    [form.storageType, form.field]
  );
  const compatibleValidators = useMemo(
    () => compatibleValidatorRuleKinds(form.storageType, form.field),
    [form.storageType, form.field]
  );
  const impliedValidators = useMemo(() => {
    try {
      return compileValidatorPlan({
        storageType: form.storageType,
        field: form.field,
        fieldConfig: fieldConfigForForm(form),
        validatorConfig: EMPTY_VALIDATOR_CONFIG
      }).rules;
    } catch {
      return [];
    }
  }, [form.storageType, form.field, form.fieldConfig, form.optionsText]);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(selected));
    setPlan(undefined);
    setError(undefined);
    setPhysicalNameOverridden(false);
    setTargetDescription(undefined);
    setTargetSearch('');
    setValidatorKind('not_empty');
    requestAnimationFrame(() => closeButton.current?.focus());
    /**
     * Handle the key down event.
     */
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

  /**
   * Return the submit plan result.
   */
  const submitPlan = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const fieldConfig = fieldConfigForForm(form);
      compileValidatorPlan({
        storageType: form.storageType,
        field: form.field,
        fieldConfig,
        validatorConfig: form.validatorConfig
      });
      if (selected && presentationOnlyColumnUpdate(selected, form)) {
        const result = await updateGridColumnPresentation({
          fileId: file.id,
          columnId: selected.id,
          expectedMetadataVersion: form.metadataVersion,
          storageType: form.storageType,
          field: form.field,
          format: form.format,
          fieldConfig,
          formatConfig: form.formatConfig,
          validatorConfig: form.validatorConfig
        }, csrfToken);
        if (result.status === 'error') {
          setError(result.error.message);
          return;
        }
        onConfirmed(
          'Field, Format, and validators saved as Tabular metadata. PostgreSQL values were not changed.',
          true
        );
        onClose();
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
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

  /**
   * Return the confirm plan result.
   */
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
              <select aria-label="Field" value={form.field} onChange={(event) => {
                const field = event.target.value as FileFieldKind;
                const axes = recommendedColumnAxes(field);
                setForm((current) => ({
                  ...current,
                  field,
                  storageType: axes.storageType,
                  format: axes.format,
                  fieldConfig: {},
                  formatConfig: {},
                  optionsText: '',
                  validatorConfig: {
                    version: 1,
                    rules: current.validatorConfig.rules.filter((rule) =>
                      compatibleValidatorRuleKinds(axes.storageType, field).includes(rule.kind)
                    )
                  }
                }));
              }}>
                {(Object.keys(FIELD_REGISTRY) as FileFieldKind[])
                  .filter((field) => field !== 'computed' || !selected)
                  .map((field) => <option key={field} value={field}>{humanize(field)}</option>)}
              </select>
              <small>Field controls editing and implied Tabular validation; selecting it never fills cells.</small>
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

          {['select', 'radio', 'multi-select', 'checkbox-list'].includes(form.field) && (
            <fieldset disabled={busy || Boolean(plan)}>
              <legend>Field options</legend>
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

          {['rating', 'slider'].includes(form.field) && (
            <fieldset disabled={busy || Boolean(plan)}>
              <legend>Field range</legend>
              {(['min', 'max', 'step'] as const).map((key) => (
                <label key={key}>
                  <span>{humanize(key)}</span>
                  <input
                    inputMode="decimal"
                    value={String(form.fieldConfig[key] ?? '')}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      fieldConfig: {
                        ...current.fieldConfig,
                        ...(event.target.value ? { [key]: event.target.value } : {})
                      }
                    }))}
                  />
                </label>
              ))}
              <small>Exact decimal bounds are metadata only; they do not rewrite existing values.</small>
            </fieldset>
          )}

          <fieldset disabled={busy || Boolean(plan)}>
            <legend>Format</legend>
            <label>
              <span>Format</span>
              <select aria-label="Format" value={form.format} onChange={(event) => {
                const format = event.target.value as FileFormatKind;
                setForm((current) => ({
                  ...current,
                  format,
                  formatConfig: defaultFormatConfig(format)
                }));
              }}>
                {compatibleFormats.map((format) => (
                  <option key={format} value={format}>{humanize(format)}</option>
                ))}
              </select>
              <small>Format changes escaped read-cell display only; it never rewrites stored values.</small>
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
            {form.format === 'currency' && (
              <label>
                <span>Currency code</span>
                <input
                  maxLength={3}
                  value={String(form.formatConfig.currency || 'USD')}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    formatConfig: { ...current.formatConfig, currency: event.target.value.toUpperCase() }
                  }))}
                />
              </label>
            )}
            {['number', 'currency'].includes(form.format) && (
              <label>
                <span>Decimal places</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={String(form.formatConfig.decimals ?? '')}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    formatConfig: {
                      ...current.formatConfig,
                      decimals: event.target.value === '' ? undefined : Number(event.target.value)
                    }
                  }))}
                />
              </label>
            )}
            {['date', 'date-time', 'time', 'relative-time'].includes(form.format) && (
              <label>
                <span>Time zone</span>
                <input
                  placeholder="UTC"
                  value={String(form.formatConfig.timeZone || '')}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    formatConfig: { ...current.formatConfig, timeZone: event.target.value }
                  }))}
                />
              </label>
            )}
          </fieldset>

          <fieldset disabled={busy || Boolean(plan)}>
            <legend>Constraints</legend>
            <p className="column-settings-disclosure">PostgreSQL constraints remain authoritative and are separate from Tabular validators.</p>
            <label className="check-row"><input type="checkbox" checked={form.required} onChange={(event) => setForm((current) => ({ ...current, required: event.target.checked }))} /> Required</label>
            <label className="check-row"><input type="checkbox" checked={form.unique} onChange={(event) => setForm((current) => ({ ...current, unique: event.target.checked }))} /> Unique</label>
            <label>
              <span>Default</span>
              <input value={form.defaultValue} placeholder="No default" onChange={(event) => setForm((current) => ({ ...current, defaultValue: event.target.value }))} />
            </label>
          </fieldset>

          <fieldset disabled={busy || Boolean(plan)}>
            <legend>Validators</legend>
            <p className="column-settings-disclosure">
              Validated by Tabular. Direct SQL and other PostgreSQL clients can bypass these input rules.
            </p>
            <div className="validator-rule-list" aria-label="Locked implied validators">
              {impliedValidators.map((rule) => (
                <article className="validator-rule-card validator-rule-locked" key={rule.id}>
                  <div>
                    <strong>{humanize(rule.kind)}</strong>
                    <small>{rule.source === 'storage' ? 'Storage-implied' : 'Field-implied'} · locked</small>
                  </div>
                  <span aria-label="Locked validator">Locked</span>
                </article>
              ))}
            </div>
            <div className="validator-rule-list" aria-label="Configured validators">
              {form.validatorConfig.rules.map((rule, index) => (
                <article className="validator-rule-card" key={rule.id}>
                  <header>
                    <div>
                      <strong>{humanize(rule.kind)}</strong>
                      <small>Configured rule {index + 1}</small>
                    </div>
                    <div className="validator-rule-actions">
                      <button
                        type="button"
                        aria-label={`Move ${humanize(rule.kind)} up`}
                        disabled={index === 0}
                        onClick={() => setForm((current) => ({
                          ...current,
                          validatorConfig: reorderValidator(current.validatorConfig, index, index - 1)
                        }))}
                      >↑</button>
                      <button
                        type="button"
                        aria-label={`Move ${humanize(rule.kind)} down`}
                        disabled={index === form.validatorConfig.rules.length - 1}
                        onClick={() => setForm((current) => ({
                          ...current,
                          validatorConfig: reorderValidator(current.validatorConfig, index, index + 1)
                        }))}
                      >↓</button>
                      <button
                        type="button"
                        aria-label={`Remove ${humanize(rule.kind)}`}
                        onClick={() => setForm((current) => ({
                          ...current,
                          validatorConfig: removeValidator(current.validatorConfig, rule.id)
                        }))}
                      >Remove</button>
                    </div>
                  </header>
                  <ValidatorArgumentEditor
                    rule={rule}
                    storageType={form.storageType}
                    onChange={(args) => setForm((current) => ({
                      ...current,
                      validatorConfig: updateValidator(current.validatorConfig, rule.id, { args })
                    }))}
                  />
                  <label>
                    <span>Custom message</span>
                    <input
                      maxLength={500}
                      value={rule.message || ''}
                      placeholder="Use the default message"
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        validatorConfig: updateValidator(
                          current.validatorConfig,
                          rule.id,
                          event.target.value ? { message: event.target.value } : { message: undefined }
                        )
                      }))}
                    />
                  </label>
                </article>
              ))}
            </div>
            <div className="validator-add-row">
              <label>
                <span>Add validator</span>
                <select
                  aria-label="Add validator"
                  value={compatibleValidators.includes(validatorKind) ? validatorKind : compatibleValidators[0] || ''}
                  disabled={!compatibleValidators.length}
                  onChange={(event) => setValidatorKind(event.target.value as ValidatorRuleKind)}
                >
                  {compatibleValidators.map((kind) => (
                    <option key={kind} value={kind}>{humanize(kind)}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!compatibleValidators.length}
                onClick={() => {
                  const kind = compatibleValidators.includes(validatorKind)
                    ? validatorKind
                    : compatibleValidators[0];
                  if (!kind) return;
                  setForm((current) => ({
                    ...current,
                    validatorConfig: {
                      version: 1,
                      rules: [...current.validatorConfig.rules, {
                        id: newValidatorId(),
                        kind,
                        args: defaultValidatorArgs(kind, current.storageType)
                      }]
                    }
                  }));
                }}
              >Add rule</button>
            </div>
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
              <div><dt>Applied by</dt><dd>{selected && presentationOnlyColumnUpdate(selected, form) ? 'Tabular metadata save' : 'Background PostgreSQL update'}</dd></div>
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
            : <button
              className="primary-action"
              type="button"
              disabled={busy || Boolean(readOnly && selected && !presentationOnlyColumnUpdate(selected, form))}
              onClick={submitPlan}
            >
              {busy
                ? 'Saving…'
                : selected && presentationOnlyColumnUpdate(selected, form)
                  ? 'Save metadata'
                  : 'Review change'}
            </button>}
        </footer>
      </aside>
    </div>
  );
}

/**
 * Return the initial form result.
 */
function initialForm(column: GridColumn | undefined): ColumnForm {
  const name = column?.label || 'New column';
  const field = (column?.field || fieldForGridKind(column?.kind)) as FileFieldKind;
  return {
    displayName: name,
    physicalName: column?.physicalName || (column ? normalizeColumnName(name) : 'new_column'),
    storageType: column?.storageType || (column?.storageCodec === 'integer' ? 'bigint' : column?.storageCodec === 'decimal' ? 'numeric' : column?.storageCodec === 'json' ? 'jsonb' : column?.storageCodec || 'text') as FileStorageType,
    field,
    format: (column?.format || formatForField(field)) as FileFormatKind,
    fieldConfig: structuredClone(column?.fieldConfig || {}),
    formatConfig: structuredClone(column?.formatConfig || {}),
    validatorConfig: structuredClone(column?.validatorConfig || EMPTY_VALIDATOR_CONFIG),
    metadataVersion: column?.metadataVersion || 1,
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

/**
 * Return the matching relation constraint name result.
 */
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

/**
 * Normalize the column name.
 */
function normalizeColumnName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 63)
    || 'new_column';
}

/**
 * Build the column settings action.
 */
export function buildColumnSettingsAction(
  file: ExplorerFile,
  selected: GridColumn | undefined,
  columns: GridColumn[],
  form: ColumnForm,
  eligibleKeys: FileDescription['constraints']
): FileDdlAction {
  if (!file.id.startsWith('obj_')) throw new Error('Save this file before changing its PostgreSQL columns.');
  const commandId = `cmd_column_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const fieldConfig = fieldConfigForForm(form);
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
        ...fieldConfig,
        pickerTemplate: form.pickerTemplate
      },
      formatConfig: {
        ...form.formatConfig,
        outputTemplate: form.outputTemplate
      },
      onUpdate: 'NO ACTION',
      onDelete: 'NO ACTION'
    };
  }
  const defaultValue = form.defaultValue
    ? { mode: 'literal' as const, value: literalDefault(form.storageType, form.defaultValue) }
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
      fieldConfig,
      formatConfig: form.formatConfig,
      validatorConfig: form.validatorConfig,
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
    fieldConfig,
    formatConfig: form.formatConfig,
    validatorConfig: form.validatorConfig,
    required: form.required,
    unique: form.unique,
    ...(defaultValue ? { default: defaultValue } : {})
  };
}

/** Report whether a save can stay entirely inside Tabular metadata. */
export function presentationOnlyColumnUpdate(selected: GridColumn, form: ColumnForm) {
  const original = initialForm(selected);
  return form.displayName === original.displayName
    && form.physicalName === original.physicalName
    && form.storageType === original.storageType
    && form.defaultValue === original.defaultValue
    && form.required === original.required
    && form.unique === original.unique;
}

/** Return the compatible closed Format subset in catalog order. */
export function compatibleFormatKinds(
  storageType: FileStorageType,
  field: FileFieldKind
) {
  return (Object.keys(FORMAT_REGISTRY) as FileFormatKind[]).filter((format) =>
    columnAxesAreCompatible(storageType, field, format)
  );
}

/** Merge the typed option-list editor into the persisted Field configuration. */
function fieldConfigForForm(form: ColumnForm) {
  const config = structuredClone(form.fieldConfig);
  if (['select', 'radio', 'multi-select', 'checkbox-list'].includes(form.field)) {
    config.options = [...new Set(
      form.optionsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
    )];
  } else {
    delete config.options;
  }
  return config;
}

/** Render typed controls for one configured validator's bounded argument shape. */
function ValidatorArgumentEditor({
  rule,
  storageType,
  onChange
}: {
  rule: ValidatorRuleConfig,
  storageType: FileStorageType,
  onChange: (args: Record<string, unknown>) => void,
}) {
  const noArguments = ['not_empty', 'email_shape', 'integer_value', 'unique_items'];
  if (noArguments.includes(rule.kind)) return <small>No parameters.</small>;
  if (['equals', 'not_equals'].includes(rule.kind)) {
    if (storageType === 'boolean') {
      return (
        <label>
          <span>Value</span>
          <select value={String(rule.args.value)} onChange={(event) => onChange({ value: event.target.value === 'true' })}>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </label>
      );
    }
    return (
      <label>
        <span>{storageType === 'jsonb' ? 'Canonical JSON value' : 'Value'}</span>
        <input
          value={typedArgumentText(rule.args.value)}
          onChange={(event) => onChange({ value: typedValidatorArgument(storageType, event.target.value) })}
        />
      </label>
    );
  }
  if (rule.kind === 'one_of') {
    return (
      <label>
        <span>Allowed values</span>
        <textarea
          rows={4}
          value={(rule.args.values as unknown[] || []).map(typedArgumentText).join('\n')}
          onChange={(event) => onChange({
            values: event.target.value.split(/\r?\n/)
              .filter((value) => value.length > 0)
              .map((value) => typedValidatorArgument(storageType, value))
          })}
        />
      </label>
    );
  }
  if (['starts_with', 'ends_with'].includes(rule.kind)) {
    return (
      <label>
        <span>Text</span>
        <input value={String(rule.args.text ?? '')} onChange={(event) => onChange({ text: event.target.value })} />
      </label>
    );
  }
  if (rule.kind === 'pattern') {
    return (
      <label>
        <span>Safe wildcard pattern</span>
        <input
          value={String(rule.args.pattern ?? '')}
          onChange={(event) => onChange({ pattern: event.target.value, dialect: 'tabular-wildcard-v1' })}
        />
        <small>Uses Tabular wildcard v1, not executable regular expressions.</small>
      </label>
    );
  }
  if (['min_length', 'max_length', 'exact_length', 'min_words', 'max_words', 'exact_words',
    'min_items', 'max_items', 'exact_items'].includes(rule.kind)) {
    return (
      <label>
        <span>Count</span>
        <input type="number" min="0" step="1" value={String(rule.args.value ?? 0)} onChange={(event) => onChange({ value: Number(event.target.value) })} />
      </label>
    );
  }
  if (rule.kind === 'url_shape') {
    return (
      <label>
        <span>Allowed protocols</span>
        <input
          value={(rule.args.protocols as string[] || []).join(', ')}
          onChange={(event) => onChange({ protocols: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
        />
      </label>
    );
  }
  if (rule.kind === 'hex_shape') {
    return (
      <div className="validator-argument-row">
        <label className="check-row">
          <input type="checkbox" checked={rule.args.prefix === true} onChange={(event) => onChange({ ...rule.args, prefix: event.target.checked })} /> Require prefix
        </label>
        <label>
          <span>Letter case</span>
          <select value={String(rule.args.case || 'any')} onChange={(event) => onChange({ ...rule.args, case: event.target.value })}>
            <option value="any">Any</option>
            <option value="lower">Lowercase</option>
            <option value="upper">Uppercase</option>
          </select>
        </label>
      </div>
    );
  }
  if (['min_value', 'max_value', 'before', 'after'].includes(rule.kind)) {
    return (
      <div className="validator-argument-row">
        <label>
          <span>Exact bound</span>
          <input value={String(rule.args.value ?? '')} onChange={(event) => onChange({ ...rule.args, value: event.target.value })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={rule.args.inclusive !== false} onChange={(event) => onChange({ ...rule.args, inclusive: event.target.checked })} /> Inclusive
        </label>
      </div>
    );
  }
  if (rule.kind === 'multiple_of') {
    return (
      <label>
        <span>Exact positive step</span>
        <input value={String(rule.args.value ?? '')} onChange={(event) => onChange({ value: event.target.value })} />
      </label>
    );
  }
  if (['past', 'future', 'today'].includes(rule.kind)) {
    return (
      <label>
        <span>Time zone</span>
        <input value={String(rule.args.timezone || '')} placeholder="UTC" onChange={(event) => onChange({ timezone: event.target.value })} />
      </label>
    );
  }
  if (['required_keys', 'allowed_keys'].includes(rule.kind)) {
    return (
      <label>
        <span>Keys</span>
        <textarea
          rows={3}
          value={(rule.args.keys as string[] || []).join('\n')}
          onChange={(event) => onChange({ keys: event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) })}
        />
      </label>
    );
  }
  return (
    <label>
      <span>{rule.kind === 'items' ? 'Ordered child rules JSON' : 'Property rules JSON'}</span>
      <textarea
        rows={5}
        defaultValue={JSON.stringify(rule.args.rules, null, 2)}
        onChange={(event) => {
          try { onChange({ rules: JSON.parse(event.target.value) as unknown }); } catch { /* retain the correctable text draft */ }
        }}
      />
      <small>One nested level only. SQL, JavaScript, and recursive schemas are rejected.</small>
    </label>
  );
}

function typedValidatorArgument(storageType: FileStorageType, value: string) {
  if (storageType === 'jsonb') return canonicalJsonValue(value);
  return value;
}

function typedArgumentText(value: unknown) {
  if (value && typeof value === 'object' && 'source' in value) {
    return String((value as { source: unknown, }).source);
  }
  return String(value ?? '');
}

export function defaultValidatorArgs(kind: ValidatorRuleKind, storageType: FileStorageType) {
  if (['not_empty', 'email_shape', 'integer_value', 'unique_items'].includes(kind)) return {};
  const typedDefault = storageType === 'boolean'
    ? true
    : storageType === 'jsonb'
      ? canonicalJsonValue('{}')
      : storageType === 'date'
        ? '2000-01-01'
        : storageType === 'time'
          ? '00:00:00'
          : storageType === 'timestamptz'
            ? '2000-01-01T00:00:00.000Z'
            : storageType === 'uuid'
              ? '00000000-0000-0000-0000-000000000000'
              : '0';
  if (['equals', 'not_equals'].includes(kind)) return { value: typedDefault };
  if (kind === 'one_of') return { values: [typedDefault] };
  if (['starts_with', 'ends_with'].includes(kind)) return { text: '' };
  if (kind === 'pattern') return { pattern: '*', dialect: 'tabular-wildcard-v1' };
  if (['min_length', 'max_length', 'exact_length', 'min_words', 'max_words', 'exact_words',
    'min_items', 'max_items', 'exact_items'].includes(kind)) return { value: 0 };
  if (kind === 'url_shape') return { protocols: ['https'] };
  if (kind === 'hex_shape') return { prefix: false, case: 'any' };
  if (['min_value', 'max_value'].includes(kind)) return { value: '0', inclusive: true };
  if (kind === 'multiple_of') return { value: '1' };
  if (['before', 'after'].includes(kind)) return { value: typedDefault, inclusive: true };
  if (['past', 'future', 'today'].includes(kind)) return { timezone: 'UTC' };
  if (kind === 'items') return { rules: [] };
  if (['required_keys', 'allowed_keys'].includes(kind)) return { keys: ['key'] };
  return { rules: {} };
}

export function updateValidator(
  config: ValidatorConfig,
  id: string,
  update: Partial<Pick<ValidatorRuleConfig, 'args' | 'message'>>
): ValidatorConfig {
  return {
    version: 1,
    rules: config.rules.map((rule) => rule.id === id ? { ...rule, ...update } : rule)
  };
}

export function reorderValidator(config: ValidatorConfig, from: number, to: number): ValidatorConfig {
  if (to < 0 || to >= config.rules.length) return config;
  const rules = [...config.rules];
  const [rule] = rules.splice(from, 1);
  if (rule) rules.splice(to, 0, rule);
  return { version: 1, rules };
}

export function removeValidator(config: ValidatorConfig, id: string): ValidatorConfig {
  return { version: 1, rules: config.rules.filter((rule) => rule.id !== id) };
}

function newValidatorId() {
  return `vr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function humanize(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultFormatConfig(format: FileFormatKind): Record<string, unknown> {
  if (format === 'currency') return { currency: 'USD', decimals: 2 };
  if (format === 'number') return { decimals: 2 };
  return {};
}

/**
 * Return the literal default result.
 */
function literalDefault(storage: FileStorageType, value: string): DdlLiteral {
  if (storage === 'boolean') return { type: 'boolean' as const, value: value === 'true' };
  if (storage === 'jsonb') return { type: 'jsonb' as const, value };
  return { type: storage, value } as DdlLiteral;
}

/**
 * Return the storage for field result.
 */
function storageForField(field: FileFieldKind): FileStorageType {
  return recommendedColumnAxes(field).storageType;
}

/**
 * Format the for field.
 */
function formatForField(field: FileFieldKind): FileFormatKind {
  return recommendedColumnAxes(field).format;
}

/**
 * Return the field for grid kind result.
 */
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

/**
 * Return the impact message result.
 */
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
