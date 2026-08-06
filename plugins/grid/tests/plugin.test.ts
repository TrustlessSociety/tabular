//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import { createApplication } from '../../../bootstrap/application.js';
import { loadGridResource } from '../events/actions.js';
import { createGridPluginService } from '../helpers/service.js';
import { GRID_ROUTES, resolveGridReadQuery } from '../pages/routes.js';
import gridPlugin from '../plugin.js';

const PRINCIPAL: BrowserPrincipal = {
  transport: 'browser',
  sessionId: 'ses_grid_query',
  identityId: 'idn_grid_query',
  connectionId: 'con_grid_query',
  historyScopeId: 'his_grid_query',
  idleExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  absoluteExpiresAt: new Date('2030-01-02T00:00:00.000Z')
};

const VIEW_DEFINITION = {
  schemaVersion: 1 as const,
  columnOrder: ['col_status', 'col_amount'],
  hiddenColumnIds: [],
  sorts: [{ columnId: 'col_amount', direction: 'desc' as const }],
  filters: [{ columnId: 'col_status', operation: '=' as const, value: 'open' }],
  presentation: {},
  includes: {
    filtersAndSorting: true,
    columnLayout: true,
    cellPresentation: false
  }
};

test('grid plugin exposes the pinned adapter identity and complete capability boundary', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.deepEqual({
    name: application.grid.name,
    adapter: application.grid.adapter,
    adapterVersion: application.grid.adapterVersion,
    capabilities: application.grid.capabilities
  }, {
    name: 'tabular.grid',
    adapter: 'tabulator',
    adapterVersion: '6.5.0',
    capabilities: [
      'rows', 'columns', 'editing', 'selection', 'navigation',
      'virtualization', 'sizing', 'formatting', 'teardown'
    ]
  });
  assert.equal(application.app.plugin('tabular.grid'), application.grid);
  assert.deepEqual(GRID_ROUTES, [
    '/pages/table.html',
    '/events/grid',
    '/events/grid-relation'
  ]);
  assert.throws(() => gridPlugin(application.app), /already registered/);
});

test('saved-view grid reads resolve server-owned definition and exact version', async () => {
  let requestedViewId: string | undefined;
  const query = await resolveGridReadQuery(
    new URLSearchParams({
      folder: 'operations',
      table: 'orders',
      viewId: 'view_open_orders',
      expectedViewVersion: '7'
    }),
    PRINCIPAL,
    'obj_orders',
    {
      describe: async () => ({
        id: 'obj_orders',
        displayName: 'Orders',
        physical: { schema: 'operations', name: 'orders', kind: 'table', readOnly: false },
        columns: [
          columnDescription('col_status'),
          columnDescription('col_amount'),
          { ...columnDescription('col_private'), hidden: true }
        ],
        constraints: []
      })
    },
    {
      get: async (_principal, viewId) => {
        requestedViewId = viewId;
        return {
          id: viewId,
          fileId: 'obj_orders',
          ownerIdentityId: PRINCIPAL.identityId,
          name: 'Open orders',
          slug: 'open-orders',
          access: 'shared' as const,
          definition: VIEW_DEFINITION,
          version: 7,
          createdAt: '2026-08-02T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:00.000Z',
          permissions: { update: true, delete: true, duplicate: true }
        };
      }
    }
  );
  assert.equal(requestedViewId, 'view_open_orders');
  assert.deepEqual(query, {
    columnIds: ['col_status', 'col_amount'],
    sorts: VIEW_DEFINITION.sorts,
    filters: VIEW_DEFINITION.filters,
    view: { id: 'view_open_orders', version: 7, definition: VIEW_DEFINITION }
  });
});

test('grid service sends saved filters and sorts through authorized query before the 1,000-row window', async () => {
  let browsed = false;
  let authorizedQuery: unknown;
  const database = {
    execute: async (sql: string) => ({
      rows: sql.includes('change_streams') ? [{ cursor: 12 }] : [],
      affectedRows: 0
    })
  };
  const identity = {
    authorizedTransaction: async (
      _principal: BrowserPrincipal,
      _capability: string,
      callback: (executor: typeof database) => Promise<unknown>,
      prepare: (executor: typeof database) => Promise<void>
    ) => {
      await prepare(database);
      return callback(database);
    }
  };
  const capability = {
    prepareGridTarget: async () => ({ adapter: {}, target: {} }),
    browseGridTarget: async () => {
      browsed = true;
      throw new Error('saved views must not use the current-grid browse window');
    },
    queryGridTarget: async (_database: unknown, _plan: unknown, input: unknown) => {
      authorizedQuery = input;
      return {
        fileId: 'obj_orders',
        schemaVersion: 'schema-7',
        truncated: true,
        columns: [{
          columnId: 'col_status', codec: 'text' as const, physicalName: 'status',
          editable: true, key: false, generated: false
        }],
        rows: [{
          rowId: 'row_1001', version: 'row-version',
          cells: [{ columnId: 'col_status', value: { type: 'text' as const, value: 'open' } }]
        }]
      };
    }
  };
  const service = createGridPluginService(identity as never, capability as never);
  const resource = await service.load(PRINCIPAL, 'obj_orders', {
    columnIds: ['col_status', 'col_amount'],
    sorts: VIEW_DEFINITION.sorts,
    filters: VIEW_DEFINITION.filters,
    view: { id: 'view_open_orders', version: 7, definition: VIEW_DEFINITION }
  });
  assert.equal(browsed, false);
  assert.deepEqual(authorizedQuery, {
    columnIds: ['col_status', 'col_amount'],
    sorts: VIEW_DEFINITION.sorts,
    filters: VIEW_DEFINITION.filters,
    limit: 1_000
  });
  assert.equal(resource?.truncated, true);
  assert.deepEqual(resource?.view, {
    id: 'view_open_orders', version: 7, definition: VIEW_DEFINITION
  });
  assert.equal(resource?.rows[0]?.id, 'row_1001');
});

test('transient column sorting becomes a typed server query without a client view definition', async () => {
  let savedViewLookup = false;
  const query = await resolveGridReadQuery(
    new URLSearchParams({
      folder: 'operations',
      table: 'orders',
      sortColumnId: 'col_amount',
      sortDirection: 'asc'
    }),
    PRINCIPAL,
    'obj_orders',
    {
      describe: async () => ({
        id: 'obj_orders',
        displayName: 'Orders',
        physical: { schema: 'operations', name: 'orders', kind: 'table', readOnly: false },
        columns: [columnDescription('col_status'), columnDescription('col_amount')],
        constraints: []
      })
    },
    {
      get: async () => {
        savedViewLookup = true;
        throw new Error('transient sorting must not resolve a saved view');
      }
    }
  );
  assert.equal(savedViewLookup, false);
  assert.deepEqual(query, {
    columnIds: ['col_status', 'col_amount'],
    sorts: [{ columnId: 'col_amount', direction: 'asc' }],
    filters: []
  });
});

test('grid read client sends only opaque view identity, exact version, and typed transient sort', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      status: 'unavailable', reason: 'test response'
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    await loadGridResource('operations', 'orders', {
      viewId: 'view_open_orders',
      expectedViewVersion: 7,
      sort: { columnId: 'col_amount', direction: 'desc' }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const requested = new URL(requestedUrl, 'http://tabular.test');
  assert.deepEqual(Object.fromEntries(requested.searchParams), {
    folder: 'operations',
    table: 'orders',
    viewId: 'view_open_orders',
    expectedViewVersion: '7',
    sortColumnId: 'col_amount',
    sortDirection: 'desc'
  });
  assert.equal(requested.searchParams.has('definition'), false);
  assert.equal(requested.searchParams.has('filters'), false);
});

test('grid query resolution rejects hidden transient and stale saved-view columns', async () => {
  const files = {
    describe: async () => ({
      id: 'obj_orders',
      displayName: 'Orders',
      physical: { schema: 'operations', name: 'orders', kind: 'table', readOnly: false },
      columns: [
        columnDescription('col_status'),
        columnDescription('col_amount'),
        { ...columnDescription('col_private'), hidden: true }
      ],
      constraints: []
    })
  };
  const savedViews = {
    get: async () => ({
      id: 'view_stale',
      fileId: 'obj_orders',
      ownerIdentityId: PRINCIPAL.identityId,
      name: 'Stale view',
      slug: 'stale-view',
      access: 'shared' as const,
      definition: {
        ...VIEW_DEFINITION,
        sorts: [{ columnId: 'col_private', direction: 'asc' as const }]
      },
      version: 3,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
      permissions: { update: true, delete: true, duplicate: true }
    })
  };
  await assert.rejects(
    () => resolveGridReadQuery(
      new URLSearchParams({
        folder: 'operations', table: 'orders',
        sortColumnId: 'col_private', sortDirection: 'asc'
      }),
      PRINCIPAL,
      'obj_orders',
      files,
      savedViews
    ),
    /no longer visible/
  );
  await assert.rejects(
    () => resolveGridReadQuery(
      new URLSearchParams({
        folder: 'operations', table: 'orders',
        viewId: 'view_stale', expectedViewVersion: '3'
      }),
      PRINCIPAL,
      'obj_orders',
      files,
      savedViews
    ),
    /no longer visible/
  );
});

/**
 * Return the column description result.
 */
function columnDescription(id: string) {
  return {
    id,
    displayName: id,
    physicalName: id,
    storageType: 'text',
    nullable: true,
    defaultExpression: null,
    generatedExpression: null,
    identity: '',
    field: 'text',
    format: 'plain-text',
    fieldConfig: {},
    formatConfig: {},
    hidden: false,
    readOnly: false
  };
}
