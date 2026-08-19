ALTER TABLE tabular.column_metadata
  ADD COLUMN validator_config jsonb NOT NULL
  DEFAULT '{"version":1,"rules":[]}'::jsonb;

ALTER TABLE tabular.column_metadata
  ADD CONSTRAINT column_metadata_validator_config CHECK (
    jsonb_typeof(validator_config) = 'object'
    AND validator_config -> 'version' = '1'::jsonb
    AND jsonb_typeof(validator_config -> 'rules') = 'array'
    AND jsonb_array_length(validator_config -> 'rules') <= 64
  );

COMMENT ON COLUMN tabular.column_metadata.validator_config IS
  'Versioned Tabular-only input validators; never target-table constraints or DDL';
