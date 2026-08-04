ALTER TABLE tabular.action_drafts
  ADD COLUMN row_rank text COLLATE "C";

ALTER TABLE tabular.action_drafts
  ADD CONSTRAINT action_drafts_row_rank_format CHECK (
    row_rank IS NULL OR row_rank ~ '^[0-9]{24}$'
  );

ALTER TABLE tabular.column_metadata
  DROP CONSTRAINT column_metadata_display_name;

ALTER TABLE tabular.column_metadata
  ADD CONSTRAINT column_metadata_display_name CHECK (
    display_name = btrim(display_name)
    AND length(display_name) <= 200
    AND (length(display_name) >= 1 OR storage_kind = 'unstructured-json')
  );

COMMENT ON COLUMN tabular.action_drafts.row_rank IS
  'Tabular-owned hidden spreadsheet rank for a not-yet-promoted logical row';
