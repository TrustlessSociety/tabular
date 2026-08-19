//modules
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent
} from 'react';
import { useEffect, useId, useRef, useState } from 'react';

//client
import type { CanonicalJsonValue } from '../../capability/helpers/value-contracts.js';
import type {
  ExpandedFieldCodecOptions,
  ExpandedFieldKind
} from '../helpers/field-codecs.js';
import {
  FieldCodecError,
  decodeExpandedFieldValue,
  stringArrayItems
} from '../helpers/field-codecs.js';

//The common controlled value and lifecycle contract for expanded editors
export type BaseExpandedFieldEditorProps = {
  value: CanonicalJsonValue | null,
  label?: string,
  autoFocus?: boolean,
  disabled?: boolean,
  onCancel?: () => void,
  onCommit: (value: CanonicalJsonValue | null) => void,
  onInvalid?: (error: FieldCodecError) => void,
};

//A stable option value and display label for restricted collection editors
export type ExpandedFieldOption = {
  value: string,
  label: string,
  disabled?: boolean,
};

//The restricted-choice editor props used by Multi-select and Checkbox List
export type ChoiceListFieldEditorProps = BaseExpandedFieldEditorProps & {
  options: readonly ExpandedFieldOption[],
};

//The dispatcher props let grid wiring select one isolated editor by Field
export type ExpandedFieldEditorProps = BaseExpandedFieldEditorProps & {
  field: ExpandedFieldKind,
  options?: readonly ExpandedFieldOption[],
};

//Keyboard intent remains independently testable from the DOM adapter
export type ExpandedEditorKeyIntent = 'commit' | 'cancel' | 'none';

/**
 * Resolve editor keyboard intent without swallowing composition or button use.
 */
export function expandedEditorKeyIntent(
  key: string,
  options: {
    isButton?: boolean,
    isComposing?: boolean,
    shiftKey?: boolean,
  } = {}
): ExpandedEditorKeyIntent {
  if (options.isComposing) return 'none';
  if (key === 'Escape') return 'cancel';
  if (key === 'Enter' && !options.shiftKey && !options.isButton) return 'commit';
  return 'none';
}

/**
 * Render a Metadata JSON-object editor that retains exact draft source.
 */
export function MetadataFieldEditor(props: BaseExpandedFieldEditorProps) {
  const labelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(props.value?.source ?? '');
  const [error, setError] = useState<FieldCodecError>();
  const lastCommit = useRef<string | null | undefined>(undefined);

  //External value changes replace the local draft without synthesizing data
  useEffect(() => {
    setSource(props.value?.source ?? '');
    setError(undefined);
    lastCommit.current = undefined;
  }, [props.value?.source]);
  useAutoFocus(root, props.autoFocus);

  /**
   * Validate once at edit exit and emit only an accepted canonical value.
   */
  const commit = () => {
    const nextSource = source.trim().length === 0 ? null : source;
    if (lastCommit.current === nextSource) return true;
    try {
      const value = decodeExpandedFieldValue('metadata', nextSource);
      setError(undefined);
      lastCommit.current = nextSource;
      props.onCommit(value);
      return true;
    } catch (caught) {
      const nextError = codecError(caught);
      setError(nextError);
      props.onInvalid?.(nextError);
      return false;
    }
  };

  /**
   * Restore the accepted value locally before returning focus ownership.
   */
  const cancel = () => {
    setSource(props.value?.source ?? '');
    setError(undefined);
    lastCommit.current = undefined;
    props.onCancel?.();
  };

  /**
   * Keep grid-level Enter and Escape behavior explicit at the editor boundary.
   */
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const intent = keyIntent(event);
    if (intent === 'none') return;
    event.preventDefault();
    event.stopPropagation();
    if (intent === 'cancel') cancel();
    else commit();
  };

  /**
   * Treat pointer or Tab focus leaving the whole editor as one edit exit.
   */
  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (focusRemainsInside(event)) return;
    commit();
  };

  return (
    <div
      ref={root}
      className="tabular-expanded-field-editor tabular-metadata-field-editor"
      data-field="metadata"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <label id={labelId}>{props.label || 'Metadata JSON object'}</label>
      <textarea
        aria-describedby={error ? `${labelId}-error` : undefined}
        aria-invalid={Boolean(error)}
        aria-labelledby={labelId}
        disabled={props.disabled}
        rows={5}
        spellCheck={false}
        value={source}
        onChange={(event) => {
          setSource(event.currentTarget.value);
          setError(undefined);
          lastCommit.current = undefined;
        }}
      />
      <p className="tabular-field-guidance">
        Use unique keys with string, number, boolean, or null values.
      </p>
      <EditorError id={`${labelId}-error`} error={error} />
      <EditorActions
        disabled={props.disabled}
        onApply={commit}
        onCancel={cancel}
        onNull={() => {
          setSource('');
          setError(undefined);
          lastCommit.current = undefined;
          props.onCommit(null);
        }}
      />
    </div>
  );
}

/**
 * Render a Tags editor with stable order and Field-owned item policy.
 */
export function TagsFieldEditor(props: BaseExpandedFieldEditorProps) {
  return (
    <StringListFieldEditor
      {...props}
      field="tags"
      fallbackLabel="Tags"
      addLabel="Add tag"
    />
  );
}

/**
 * Render a Text List editor that intentionally retains duplicate strings.
 */
export function TextListFieldEditor(props: BaseExpandedFieldEditorProps) {
  return (
    <StringListFieldEditor
      {...props}
      field="text-list"
      fallbackLabel="Text list"
      addLabel="Add item"
    />
  );
}

/**
 * Render a Multi-select editor against its configured option membership.
 */
export function MultiSelectFieldEditor(props: ChoiceListFieldEditorProps) {
  return (
    <ChoiceListFieldEditor
      {...props}
      field="multi-select"
      fallbackLabel="Multi-select"
    />
  );
}

/**
 * Render a Checkbox List editor against its configured option membership.
 */
export function CheckboxListFieldEditor(props: ChoiceListFieldEditorProps) {
  return (
    <ChoiceListFieldEditor
      {...props}
      field="checkbox-list"
      fallbackLabel="Checkbox list"
    />
  );
}

/**
 * Dispatch an expanded Field to its isolated editor component.
 */
export function ExpandedFieldEditor(props: ExpandedFieldEditorProps) {
  if (props.field === 'metadata') return (<MetadataFieldEditor {...props} />);
  if (props.field === 'tags') return (<TagsFieldEditor {...props} />);
  if (props.field === 'text-list') return (<TextListFieldEditor {...props} />);
  const choiceProps = { ...props, options: props.options || [] };
  return props.field === 'multi-select'
    ? (<MultiSelectFieldEditor {...choiceProps} />)
    : (<CheckboxListFieldEditor {...choiceProps} />);
}

type StringListFieldEditorProps = BaseExpandedFieldEditorProps & {
  field: 'tags' | 'text-list',
  fallbackLabel: string,
  addLabel: string,
};

/**
 * Render ordered editable string rows without normalizing untouched source.
 */
function StringListFieldEditor(props: StringListFieldEditorProps) {
  const labelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState(() => stringArrayItems(props.value));
  const [isNull, setIsNull] = useState(props.value === null);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<FieldCodecError>();
  const lastCommit = useRef<string | null | undefined>(undefined);

  //External values replace the local projection while preserving source
  useEffect(() => {
    setItems(stringArrayItems(props.value));
    setIsNull(props.value === null);
    setIsDirty(false);
    setError(undefined);
    lastCommit.current = undefined;
  }, [props.value?.source]);
  useAutoFocus(root, props.autoFocus);

  /**
   * Commit the untouched source exactly or serialize one actor-edited array.
   */
  const commit = () => {
    const source = isNull
      ? null
      : isDirty ? JSON.stringify(items) : props.value?.source ?? '[]';
    if (lastCommit.current === source) return true;
    try {
      const value = decodeExpandedFieldValue(props.field, source);
      setError(undefined);
      lastCommit.current = source;
      props.onCommit(value);
      return true;
    } catch (caught) {
      const nextError = codecError(caught);
      setError(nextError);
      props.onInvalid?.(nextError);
      return false;
    }
  };

  /**
   * Restore the accepted array and NULL state before yielding focus back.
   */
  const cancel = () => {
    setItems(stringArrayItems(props.value));
    setIsNull(props.value === null);
    setIsDirty(false);
    setError(undefined);
    lastCommit.current = undefined;
    props.onCancel?.();
  };

  /**
   * Update one item in place so array order never changes incidentally.
   */
  const updateItem = (index: number, value: string) => {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? value : item
    )));
    markEdited(setIsNull, setIsDirty, setError, lastCommit);
  };

  return (
    <div
      ref={root}
      className="tabular-expanded-field-editor tabular-string-list-field-editor"
      data-field={props.field}
      onBlur={(event) => {
        if (!focusRemainsInside(event)) commit();
      }}
      onKeyDown={(event) => handleEditorKey(event, commit, cancel)}
    >
      <span id={labelId}>{props.label || props.fallbackLabel}</span>
      <ol aria-labelledby={labelId}>
        {items.map((item, index) => (
          <li key={index}>
            <input
              aria-label={`${props.fallbackLabel} item ${index + 1}`}
              disabled={props.disabled}
              value={item}
              onChange={(event) => updateItem(index, event.currentTarget.value)}
            />
            <button
              type="button"
              aria-label={`Remove item ${index + 1}`}
              disabled={props.disabled}
              onClick={() => {
                setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
                markEdited(setIsNull, setIsDirty, setError, lastCommit);
              }}
            >Remove</button>
          </li>
        ))}
      </ol>
      {items.length === 0 && !isNull ? <p>Empty collection</p> : null}
      {isNull ? <p>SQL NULL</p> : null}
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => {
          setItems((current) => [...current, '']);
          markEdited(setIsNull, setIsDirty, setError, lastCommit);
        }}
      >{props.addLabel}</button>
      <EditorError id={`${labelId}-error`} error={error} />
      <EditorActions
        disabled={props.disabled}
        onApply={commit}
        onCancel={cancel}
        onNull={() => {
          setItems([]);
          setIsNull(true);
          setIsDirty(true);
          setError(undefined);
          lastCommit.current = null;
          props.onCommit(null);
        }}
      />
    </div>
  );
}

type InternalChoiceListFieldEditorProps = ChoiceListFieldEditorProps & {
  field: 'multi-select' | 'checkbox-list',
  fallbackLabel: string,
};

/**
 * Render an option-membership editor while retaining selected-value order.
 */
function ChoiceListFieldEditor(props: InternalChoiceListFieldEditorProps) {
  const labelId = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const [selected, setSelected] = useState(() => stringArrayItems(props.value));
  const [isNull, setIsNull] = useState(props.value === null);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<FieldCodecError>();
  const lastCommit = useRef<string | null | undefined>(undefined);

  //External values replace the choice projection without selecting defaults
  useEffect(() => {
    setSelected(stringArrayItems(props.value));
    setIsNull(props.value === null);
    setIsDirty(false);
    setError(undefined);
    lastCommit.current = undefined;
  }, [props.value?.source]);
  useAutoFocus(root, props.autoFocus);

  const codecOptions: ExpandedFieldCodecOptions = {
    allowedValues: props.options.map((option) => option.value)
  };

  /**
   * Validate exact configured membership once the choice editor exits.
   */
  const commit = () => {
    const source = isNull
      ? null
      : isDirty ? JSON.stringify(selected) : props.value?.source ?? '[]';
    if (lastCommit.current === source) return true;
    try {
      const value = decodeExpandedFieldValue(props.field, source, codecOptions);
      setError(undefined);
      lastCommit.current = source;
      props.onCommit(value);
      return true;
    } catch (caught) {
      const nextError = codecError(caught);
      setError(nextError);
      props.onInvalid?.(nextError);
      return false;
    }
  };

  /**
   * Restore the accepted choices and NULL state without selecting defaults.
   */
  const cancel = () => {
    setSelected(stringArrayItems(props.value));
    setIsNull(props.value === null);
    setIsDirty(false);
    setError(undefined);
    lastCommit.current = undefined;
    props.onCancel?.();
  };

  /**
   * Append new selections and remove cleared ones without sorting the array.
   */
  const toggle = (value: string, checked: boolean) => {
    setSelected((current) => checked
      ? current.includes(value) ? current : [...current, value]
      : current.filter((item) => item !== value));
    markEdited(setIsNull, setIsDirty, setError, lastCommit);
  };

  const configuredValues = new Set(props.options.map((option) => option.value));
  const unavailable = selected.filter((value) => !configuredValues.has(value));

  return (
    <fieldset
      ref={root}
      className="tabular-expanded-field-editor tabular-choice-list-field-editor"
      data-field={props.field}
      disabled={props.disabled}
      onBlur={(event) => {
        if (!focusRemainsInside(event)) commit();
      }}
      onKeyDown={(event) => handleEditorKey(event, commit, cancel)}
    >
      <legend id={labelId}>{props.label || props.fallbackLabel}</legend>
      {props.options.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            disabled={option.disabled}
            onChange={(event) => toggle(option.value, event.currentTarget.checked)}
          />
          <span>{option.label}</span>
        </label>
      ))}
      {unavailable.map((value, index) => (
        <label key={`unavailable-${index}-${value}`}>
          <input
            type="checkbox"
            checked
            onChange={(event) => toggle(value, event.currentTarget.checked)}
          />
          <span>{value} (unavailable)</span>
        </label>
      ))}
      {selected.length === 0 && !isNull ? <p>Empty collection</p> : null}
      {isNull ? <p>SQL NULL</p> : null}
      <EditorError id={`${labelId}-error`} error={error} />
      <EditorActions
        disabled={props.disabled}
        onApply={commit}
        onCancel={cancel}
        onNull={() => {
          setSelected([]);
          setIsNull(true);
          setIsDirty(true);
          setError(undefined);
          lastCommit.current = null;
          props.onCommit(null);
        }}
      />
    </fieldset>
  );
}

type EditorActionsProps = {
  disabled?: boolean,
  onApply: () => boolean,
  onCancel: () => void,
  onNull: () => void,
};

/**
 * Render the shared explicit commit, cancel, and SQL NULL actions.
 */
function EditorActions(props: EditorActionsProps) {
  return (
    <div className="tabular-expanded-field-actions">
      <button type="button" disabled={props.disabled} onClick={props.onApply}>
        Apply
      </button>
      <button type="button" disabled={props.disabled} onClick={props.onNull}>
        Set SQL NULL
      </button>
      <button type="button" onClick={props.onCancel}>Cancel</button>
    </div>
  );
}

/**
 * Render one owned validation failure without replacing the raw draft.
 */
function EditorError(props: { id: string, error?: FieldCodecError, }) {
  return props.error ? (
    <p id={props.id} className="tabular-field-error" role="alert">
      {props.error.message}
    </p>
  ) : null;
}

/**
 * Focus the first native editor control when integration requests it.
 */
function useAutoFocus(root: { current: HTMLElement | null, }, shouldFocus?: boolean) {
  useEffect(() => {
    if (!shouldFocus) return;
    root.current?.querySelector<HTMLElement>('textarea, input, button')?.focus();
  }, [shouldFocus]);
}

/**
 * Convert a React keyboard event into the public editor intent contract.
 */
function keyIntent(event: ReactKeyboardEvent<HTMLElement>): ExpandedEditorKeyIntent {
  return expandedEditorKeyIntent(event.key, {
    isButton: (event.target as HTMLElement).tagName === 'BUTTON',
    isComposing: event.nativeEvent.isComposing,
    shiftKey: event.shiftKey
  });
}

/**
 * Apply keyboard intent through the component's owned lifecycle callbacks.
 */
function handleEditorKey(
  event: ReactKeyboardEvent<HTMLElement>,
  commit: () => boolean,
  onCancel?: () => void
) {
  const intent = keyIntent(event);
  if (intent === 'none') return;
  event.preventDefault();
  event.stopPropagation();
  if (intent === 'cancel') onCancel?.();
  else commit();
}

/**
 * Report whether focus moved between controls inside the same editor.
 */
function focusRemainsInside(event: ReactFocusEvent<HTMLElement>): boolean {
  return Boolean(
    event.relatedTarget
    && event.currentTarget.contains(event.relatedTarget as Node)
  );
}

/**
 * Mark a collection as actor-edited without choosing or populating a value.
 */
function markEdited(
  setIsNull: (value: boolean) => void,
  setIsDirty: (value: boolean) => void,
  setError: (value: FieldCodecError | undefined) => void,
  lastCommit: { current: string | null | undefined, }
) {
  setIsNull(false);
  setIsDirty(true);
  setError(undefined);
  lastCommit.current = undefined;
}

/**
 * Normalize unexpected parser failures into the stable codec error boundary.
 */
function codecError(caught: unknown): FieldCodecError {
  return caught instanceof FieldCodecError
    ? caught
    : new FieldCodecError('invalid_json', 'The Field contains invalid JSON');
}
