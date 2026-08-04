import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SavedViewsDialog } from '../components/saved-views-dialog.js';
import type { SavedView } from '../helpers/contracts.js';

const view = (access: 'private' | 'shared', name: string, seed: string): SavedView => ({
  id: `view_${seed.repeat(32)}`,
  fileId: `obj_${'f'.repeat(32)}`,
  ownerIdentityId: `id_${'i'.repeat(32)}`,
  name,
  slug: `${name.toLowerCase().replaceAll(' ', '-')}-${seed.repeat(8)}`,
  access,
  definition: {
    schemaVersion: 1,
    columnOrder: [`col_${'c'.repeat(32)}`],
    hiddenColumnIds: [],
    sorts: [],
    filters: [],
    presentation: {},
    includes: { filtersAndSorting: true, columnLayout: true, cellPresentation: true }
  },
  version: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  permissions: { update: access === 'private', delete: access === 'private', duplicate: true }
});

const handlers = {
  onModeChange: () => undefined,
  onCreate: () => undefined,
  onUpdate: () => undefined,
  onDuplicate: () => undefined,
  onDelete: () => undefined,
  onClose: () => undefined
};

test('saved-view list is one bounded dialog with personal/shared discovery and new-tab links', () => {
  const html = renderToStaticMarkup(createElement(SavedViewsDialog, {
    mode: 'list',
    views: [view('private', 'My ready orders', 'p'), view('shared', 'Team queue', 's')],
    capabilities: {
      canCreatePrivate: true,
      canPublishShared: false,
      canMoveRows: false,
      rowOrderState: 'install-required'
    },
    folderSlug: 'operations',
    fileSlug: 'orders',
    ...handlers
  }));
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /aria-label="Personal views"/);
  assert.match(html, /aria-label="Shared views"/);
  assert.match(html, />My ready orders</);
  assert.match(html, />Team queue</);
  assert.match(html, /target="_blank" rel="noreferrer"/);
  assert.match(html, /folder=operations&amp;table=orders&amp;view=team-queue-/);
  assert.match(html, />Update from current sheet</);
  assert.match(html, />Duplicate as private</);
  assert.match(html, />New view</);
});

test('saved-view creation exposes exact inclusion choices and permission-aware sharing', () => {
  const html = renderToStaticMarkup(createElement(SavedViewsDialog, {
    mode: 'create',
    views: [],
    capabilities: {
      canCreatePrivate: true,
      canPublishShared: false,
      canMoveRows: false,
      rowOrderState: 'install-required'
    },
    folderSlug: 'operations',
    fileSlug: 'orders',
    ...handlers
  }));
  assert.match(html, />Create new view</);
  assert.match(html, /name="saved-view-name"/);
  assert.match(html, />Filters and sorting</);
  assert.match(html, />Column order and visibility</);
  assert.match(html, />Cell presentation</);
  assert.match(html, /type="radio"[^>]*disabled=""[^>]*name="saved-view-access"/);
  assert.match(html, />Table owner permission required</);
  assert.match(html, /type="submit" disabled=""/);
});
