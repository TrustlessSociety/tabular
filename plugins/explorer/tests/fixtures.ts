//client
import type { CatalogFile } from '../../catalog/helpers/contracts.js';
import type {
  ExplorerFile,
  ExplorerFolder,
  ExplorerSnapshot
} from '../helpers/contracts.js';

const FILES: Record<string, Array<Omit<ExplorerFile, 'folderId'>>> = {
  operations: [
    file('file_customer_orders', 'customer-orders', 'Customer orders', 'customer_orders', 7, 248),
    file('file_inventory', 'inventory', 'Inventory', 'inventory', 11, 1_482),
    file('file_vendors', 'vendors', 'Vendors', 'vendors', 9, 63),
    file('file_stock_movements', 'stock-movements', 'Stock movements', 'stock_movements', 8, 4_209),
    file('file_purchase_requests', 'purchase-requests', 'Purchase requests', 'purchase_requests', 12, 176),
    file('file_monthly_rollup', 'monthly-rollup', 'Monthly rollup', 'monthly_rollup', 6, 31, 'view', true)
  ],
  finance: [
    file('file_invoices', 'invoices', 'Invoices', 'invoices', 8, 932),
    file('file_expenses', 'expenses', 'Expenses', 'expenses', 7, 1_284),
    file('file_budgets', 'budgets', 'Budgets', 'budgets', 10, 24)
  ]
};

/**
 * Builds a deterministic authorized Explorer snapshot for isolated tests.
 */
export function createExplorerSnapshot(readOnly = false): ExplorerSnapshot {
  const databaseId = 'database_tabular';
  return {
    connection: { id: 'connection_test', displayName: 'Test connection' },
    database: {
      id: databaseId,
      connectionId: 'connection_test',
      displayName: 'tabular'
    },
    folders: [
      folder('schema_operations', databaseId, 'operations', 'Operations', readOnly),
      folder('schema_finance', databaseId, 'finance', 'Finance', readOnly)
    ]
  };
}

/**
 * Builds one schema folder with the fixture files owned by this test module.
 */
function folder(
  id: string,
  databaseId: string,
  slug: string,
  displayName: string,
  readOnly: boolean
): ExplorerFolder {
  return {
    id,
    databaseId,
    slug,
    displayName,
    permissions: {
      createFile: !readOnly,
      importFile: !readOnly,
      renameFile: !readOnly,
      configureFile: !readOnly
    },
    files: (FILES[slug] || []).map((item) => ({
      ...item,
      folderId: id,
      readOnly: readOnly || item.readOnly
    })),
    views: []
  };
}

/**
 * Builds one deterministic file record for component and action tests.
 */
function file(
  id: string,
  slug: string,
  displayName: string,
  physicalName: string,
  columnCount: number,
  recordCount: number,
  kind: CatalogFile['kind'] = 'table',
  readOnly = false
): Omit<ExplorerFile, 'folderId'> {
  return {
    id,
    slug,
    displayName,
    physicalName,
    kind,
    readOnly,
    columnCount,
    recordCount
  };
}
