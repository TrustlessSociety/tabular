//client
import type { GridCellIssue, GridColumn, GridRow } from './contracts.js';
import {
  compileValidatorPlan,
  validateCanonicalValue
} from '../../files/helpers/validator-engine.js';

/**
 * Project Tabular validation over visible values without changing their raw
 * PostgreSQL/canonical representation.
 */
export function gridValueIssues(rows: GridRow[], columns: GridColumn[]): GridCellIssue[] {
  const issues: GridCellIssue[] = [];
  for (const column of columns) {
    if (!column.storageType || !column.field || !column.validatorConfig) continue;
    try {
      const plan = compileValidatorPlan({
        storageType: column.storageType,
        field: column.field,
        fieldConfig: column.fieldConfig || {},
        validatorConfig: column.validatorConfig
      });
      for (const row of rows) {
        const result = validateCanonicalValue(plan, row[column.id] ?? null);
        if (!result.valid) {
          const messages = result.failures.map((failure) => (
            `${failure.message}${failure.path ? ` at ${failure.path}` : ''}`
          ));
          issues.push({
            rowId: row.id,
            columnId: column.id,
            token: '#VALUE!',
            message: `${messages.join(' ')}${result.overflow ? ` (+${result.overflow} more)` : ''}`,
            showCellToken: true
          });
        }
      }
    } catch {
      for (const row of rows) {
        issues.push({
          rowId: row.id,
          columnId: column.id,
          token: '#ERROR!',
          message: 'The column validator metadata is invalid.',
          showCellToken: true
        });
      }
    }
  }
  return issues;
}
