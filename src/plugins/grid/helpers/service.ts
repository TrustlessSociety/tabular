//client
import type { TypedCellValue } from '../../capability/helpers/contracts.js';
import type { CapabilityPluginService } from '../../capability/helpers/service.js';
import type { GridTargetPlan } from '../../capability/helpers/service.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { SavedViewDefinition } from '../../saved-views/helpers/contracts.js';
import type { GridCellValue, GridColumnKind, GridResource } from './contracts.js';
import type { GridFilter, GridSort } from './contracts.js';
import type { GridRelationLookupInput, GridRelationLookupResult } from './contracts.js';
import {
  catalogAuthorizedTransactions,
  withCatalogReconciliationRetry
} from '../../catalog/helpers/service.js';
import {
  executeRelationLookup,
  prepareRelationLookup
} from './relation-lookup.js';

//The grid service value exported for module callers
export const GRID_SERVICE = 'tabular.grid';

//The grid read query contract exported for module callers
export type GridReadQuery = {
  columnIds: string[],
  sorts: GridSort[],
  filters: GridFilter[],
  view?: {
    id: string,
    version: number,
    definition: SavedViewDefinition,
  },
};

//The grid plugin service contract exported for module callers
export type GridPluginService = {
  name: typeof GRID_SERVICE,
  adapter: 'tabulator',
  adapterVersion: '6.5.0',
  capabilities: readonly [
    'rows',
    'columns',
    'editing',
    'selection',
    'navigation',
    'virtualization',
    'sizing',
    'formatting',
    'teardown'
  ],
  load(
    principal: BrowserPrincipal,
    fileId: string,
    query?: GridReadQuery
  ): Promise<GridResource | undefined>,
  lookupRelation(
    principal: BrowserPrincipal,
    input: GridRelationLookupInput
  ): Promise<GridRelationLookupResult | undefined>,
};

class DirectGridPluginService implements GridPluginService {
  //The name state retained by this class instance
  public readonly name = GRID_SERVICE;
  //The adapter state retained by this class instance
  public readonly adapter = 'tabulator' as const;
  //The adapter version state retained by this class instance
  public readonly adapterVersion = '6.5.0' as const;
  //The capabilities state retained by this class instance
  public readonly capabilities = [
      'rows',
      'columns',
      'editing',
      'selection',
      'navigation',
      'virtualization',
      'sizing',
      'formatting',
      'teardown'
    ] as const;

  /**
   * Create a DirectGridPluginService instance.
   */
  public constructor(
    private readonly identity: IdentityPluginService,
    private readonly capability: CapabilityPluginService
  ) {}

  /**
   * Load the current value.
   */
  public async load(principal: BrowserPrincipal, fileId: string, query?: GridReadQuery) {
    return withCatalogReconciliationRetry(() => catalogAuthorizedTransactions.run(
      () => this.loadOnce(principal, fileId, query)
    ));
  }

  /**
   * Load the once.
   */
  private async loadOnce(principal: BrowserPrincipal, fileId: string, query?: GridReadQuery) {
    let prepared: GridTargetPlan | undefined;
    let cursor = 0;
    let rowOrderVersion: number | undefined;
    const resource = await this.identity.authorizedTransaction(
      principal,
      'tabular.capability',
      async (database) => {
        if (!prepared) return undefined;
        return query
          ? this.capability.queryGridTarget(database, prepared, {
            columnIds: query.columnIds,
            sorts: query.sorts,
            filters: query.filters,
            limit: 1_000
          })
          : this.capability.browseGridTarget(database, prepared);
      },
      async (database) => {
        prepared = await this.capability.prepareGridTarget(
          database,
          fileId,
          principal.connectionId
        );
        const stream = await database.execute<{ cursor: string | number, }>(`
          SELECT next_cursor - 1 AS cursor
            FROM tabular.change_streams
           WHERE connection_id = ?
        `, [principal.connectionId]);
        cursor = Number(stream.rows[0]?.cursor || 0);
        const order = await database.execute<{ version: string | number, }>(`
          SELECT version FROM tabular.row_order_state WHERE file_id = ?
        `, [fileId]);
        rowOrderVersion = order.rows[0] ? Number(order.rows[0].version) : undefined;
      },
      undefined,
      'repeatable read'
    );
    if (!resource) return undefined;
    return {
      fileId: resource.fileId,
      schemaVersion: resource.schemaVersion,
      versions: Object.fromEntries(resource.rows.map((row) => [row.rowId, row.version])),
      rowRanks: Object.fromEntries(resource.rows.flatMap((row) => (
        row.rank ? [[row.rowId, row.rank]] : []
      ))),
      columns: resource.columns.map((column, index) => ({
        id: column.columnId,
        coordinate: columnCoordinate(index),
        label: column.physicalName.replace(/_/g, ' '),
        kind: gridKind(column.codec),
        storageCodec: column.codec,
        width: column.codec === 'text' ? 176 : 128,
        editable: column.editable,
        key: column.key,
        generated: column.generated
      })),
      rows: resource.rows.map((row) => ({
        id: row.rowId,
        ...Object.fromEntries(row.cells.map((cell) => [
          cell.columnId,
          gridValue(cell.value)
        ]))
      })),
      drafts: [],
      cursor,
      ...(rowOrderVersion ? { rowOrderVersion } : {}),
      ...(resource.truncated ? { truncated: true } : {}),
      ...(query?.view ? { view: query.view } : {})
    } satisfies GridResource;
  }

  /**
   * Handle the lookup relation operation.
   */
  public async lookupRelation(principal: BrowserPrincipal, input: GridRelationLookupInput) {
    return withCatalogReconciliationRetry(() => catalogAuthorizedTransactions.run(async () => {
      let prepared: Awaited<ReturnType<typeof prepareRelationLookup>>;
      return this.identity.authorizedTransaction(
        principal,
        'tabular.capability',
        async (database) => prepared
          ? executeRelationLookup(database, prepared, input)
          : undefined,
        async (database) => {
          prepared = await prepareRelationLookup(database, principal.connectionId, input);
        },
        undefined,
        'read committed'
      );
    }));
  }
}

/**
 * Create the grid plugin service.
 */
export function createGridPluginService(
  identity: IdentityPluginService,
  capability: CapabilityPluginService
): GridPluginService {
  return new DirectGridPluginService(identity, capability);
}

/**
 * Return the grid value result.
 */
function gridValue(value: TypedCellValue): GridCellValue {
  if (value.type === 'null') return null;
  if (value.type === 'json') return value;
  if (value.type === 'boolean') return value.value;
  if (value.type === 'integer' || value.type === 'decimal') return value.value;
  return value.value;
}

/**
 * Return the grid kind result.
 */
function gridKind(codec: string): GridColumnKind {
  if (codec === 'integer' || codec === 'decimal') return 'number';
  if (codec === 'boolean') return 'boolean';
  if (codec === 'date') return 'date';
  if (codec === 'timestamp') return 'datetime';
  if (codec === 'json') return 'json';
  return 'text';
}

/**
 * Return the column coordinate result.
 */
function columnCoordinate(index: number) {
  let coordinate = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    coordinate = String.fromCharCode(65 + ((value - 1) % 26)) + coordinate;
  }
  return coordinate;
}
