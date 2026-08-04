export type EmphasisState = boolean | 'mixed';

export function EmphasisButton({
  state,
  onAction
}: {
  state: EmphasisState;
  onAction: () => void;
}) {
  return (
    <button
      className="emphasis-button"
      type="button"
      aria-label="Bold"
      aria-pressed={state}
      onClick={onAction}
    >
      <strong aria-hidden="true">B</strong>
    </button>
  );
}
