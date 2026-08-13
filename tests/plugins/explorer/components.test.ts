//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

//client
import ExplorerPage from '../../../src/plugins/explorer/views/explorer.js';
import { TableSettingsPanel } from '../../../src/plugins/explorer/components/table-settings-panel.js';
import { FileCreateDialog } from '../../../src/plugins/explorer/components/file-ddl-confirmation.js';
import { createExplorerSnapshot } from './fixtures.js';

test('explorer renders accepted hierarchy, scoped actions, tabs, and stable identities', () => {
  const snapshot = createExplorerSnapshot();
  const root = renderToStaticMarkup(createElement(ExplorerPage, {
    application: 'Tabular', status: 'ready', version: '0.1.0', surface: 'explorer',
    route: { tab: 'files' }, snapshot, identity: { displayName: 'Test User' }, csrfToken: 'csrf'
  }));
  assert.match(root, /aria-label="Test connection files"/);
  assert.match(root, />Folders</);
  assert.match(root, />Operations</);
  assert.match(root, />Finance</);
  assert.doesNotMatch(root, />New file</);

  const folder = renderToStaticMarkup(createElement(ExplorerPage, {
    application: 'Tabular', status: 'ready', version: '0.1.0', surface: 'explorer',
    route: { folder: 'operations', tab: 'files' }, snapshot,
    identity: { displayName: 'Test User' }, csrfToken: 'csrf'
  }));
  assert.match(folder, /New file/);
  assert.match(folder, /Import/);
  assert.match(folder, /role="tab" aria-selected="true"/);
  assert.match(folder, /role="tab" aria-selected="true" tabindex="0" href="\/pages\/browse\.html\?folder=operations&amp;tab=files"/);
  assert.match(folder, /role="tab" aria-selected="false" tabindex="-1" href="\/pages\/browse\.html\?folder=operations&amp;tab=views"/);
  assert.match(folder, /data-stable-id="file_customer_orders"/);
  assert.match(folder, /operations\.customer_orders/);

  const views = renderToStaticMarkup(createElement(ExplorerPage, {
    application: 'Tabular', status: 'ready', version: '0.1.0', surface: 'explorer',
    route: { folder: 'operations', tab: 'views' }, snapshot,
    identity: { displayName: 'Test User' }, csrfToken: 'csrf'
  }));
  assert.match(views, /aria-label="Search views"/);
  assert.match(views, /role="tab" aria-selected="false" tabindex="-1" href="\/pages\/browse\.html\?folder=operations&amp;tab=files"/);
  assert.match(views, /role="tab" aria-selected="true" tabindex="0" href="\/pages\/browse\.html\?folder=operations&amp;tab=views"/);
  assert.match(views, />No views yet</);
  assert.match(views, /Saved views created from files in this folder will appear here\./);
  assert.doesNotMatch(views, /href="\/pages\/table\.html[^\"]*&amp;view=/);
});

test('table settings contains only accepted table-level controls', () => {
  const snapshot = createExplorerSnapshot();
  const folder = snapshot.folders[0]!;
  const html = renderToStaticMarkup(createElement(TableSettingsPanel, {
    open: true,
    file: folder.files[0]!,
    folder,
    folders: snapshot.folders,
    triggerRef: createRef<HTMLButtonElement>(),
    onClose: () => undefined,
    onApply: () => undefined
  }));
  assert.match(html, />Table settings</);
  assert.match(html, />Display name</);
  assert.match(html, />Folder</);
  assert.match(html, />PostgreSQL table name</);
  assert.doesNotMatch(html, /Record count|Column count|Table details/);
});

test('file creation asks for a display name and explains the inferred PostgreSQL table name', () => {
  const html = renderToStaticMarkup(createElement(FileCreateDialog, {
    busy: false,
    triggerRef: createRef<HTMLButtonElement>(),
    onCreate: () => undefined, onClose: () => undefined
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /Create a blank spreadsheet/);
  assert.match(html, /File name/);
  assert.match(html, /PostgreSQL table/);
  assert.match(html, /untitled_file/);
  assert.match(html, /Create file/);
  assert.doesNotMatch(html, /Separate migrator|owner confirmation/i);
});
