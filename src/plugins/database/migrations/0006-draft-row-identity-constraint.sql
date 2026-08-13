ALTER TABLE tabular.action_drafts
  DROP CONSTRAINT action_drafts_row_format;

ALTER TABLE tabular.action_drafts
  ADD CONSTRAINT action_drafts_row_format CHECK (
    row_id IS NULL
    OR (
      row_id ~ '^row_[A-Za-z0-9_-]+$'
      AND char_length(row_id) BETWEEN 5 AND 260
    )
  );
