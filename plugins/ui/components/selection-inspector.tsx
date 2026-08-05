import { useEffect, useRef, type RefObject } from 'react';
import type { GridColumn, LogicalGridSelection } from '../../grid/helpers/contracts.js';
import { Icon } from './icon.js';

export type SelectionInspectorProps = {
  open: boolean;
  selection: LogicalGridSelection | null;
  columns: GridColumn[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

function describe(selection: LogicalGridSelection | null, columns: GridColumn[]) {
  if (!selection) return { type: 'None', anchor: '—', focus: '—' };
  if (selection.kind === 'row') return { type: 'Entire row', anchor: selection.rowId, focus: selection.rowId };
  if (selection.kind === 'header-row') return { type: 'Entire header row', anchor: 'All columns', focus: 'Headers' };
  if (selection.kind === 'header') {
    const column = columns.find((candidate) => candidate.id === selection.columnId);
    return { type: 'Header cell', anchor: column?.label || selection.columnId, focus: `${column?.coordinate || selection.columnId} header` };
  }
  if (selection.kind === 'column') {
    const column = columns.find((candidate) => candidate.id === selection.columnId);
    return { type: 'Entire column', anchor: column?.label || selection.columnId, focus: column?.coordinate || selection.columnId };
  }
  const name = (point: { rowId: string; columnId: string }) => {
    const column = columns.find((candidate) => candidate.id === point.columnId);
    return `${column?.coordinate || point.columnId}${point.rowId}`;
  };
  return { type: selection.kind === 'range' ? 'Cell range' : 'Cell', anchor: name(selection.anchor), focus: name(selection.focus) };
}

export function SelectionInspector(props: SelectionInspectorProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!props.open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
        requestAnimationFrame(() => props.triggerRef.current?.focus());
      }
      if (event.key === 'Tab') {
        const first = closeButton.current;
        const last = doneButton.current;
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [props.open]);
  if (!props.open) return null;
  const details = describe(props.selection, props.columns);
  const close = () => {
    props.onClose();
    requestAnimationFrame(() => props.triggerRef.current?.focus());
  };
  return (
    <div className="overlay-scrim" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) close();
    }}>
      <aside className="selection-inspector" role="dialog" aria-modal="true" aria-labelledby="selection-inspector-title">
        <header>
          <div>
            <span className="panel-kicker">CONTEXT</span>
            <h2 id="selection-inspector-title">Selection details</h2>
          </div>
          <button ref={closeButton} className="icon-button" type="button" aria-label="Close selection details" onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <dl>
          <div><dt>Type</dt><dd>{details.type}</dd></div>
          <div><dt>Anchor</dt><dd>{details.anchor}</dd></div>
          <div><dt>Focus</dt><dd>{details.focus}</dd></div>
        </dl>
        <div className="panel-section">
          <h3>Logical persistence</h3>
          <p>The adapter keeps stable row and column identifiers when the viewport rerenders, sorts, or filters.</p>
        </div>
        <button ref={doneButton} className="secondary-button full-width" type="button" onClick={close}>Done</button>
      </aside>
    </div>
  );
}
