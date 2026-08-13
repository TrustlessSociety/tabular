ALTER TABLE tabular.action_journal
  DROP CONSTRAINT action_journal_action_type;

ALTER TABLE tabular.action_journal
  ADD CONSTRAINT action_journal_action_type CHECK (
    action_type IN (
      'record.patch', 'record.insert', 'record.delete', 'range.patch',
      'draft.promote', 'history.undo', 'history.redo',
      'draft.create', 'draft.update', 'draft.delete'
    )
  );
