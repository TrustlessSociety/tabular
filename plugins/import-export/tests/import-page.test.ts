//node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

//client
import { createExplorerSnapshot } from '../../explorer/tests/fixtures.js';
import { ImportPage } from '../views/import-page.js';

const pageSource = readFileSync(new URL('../views/import-page.tsx', import.meta.url), 'utf8');

/**
 * Returns one bounded source section so wiring assertions cannot match another handler.
 */
function sourceSection(start: string, end: string) {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

/**
 * Confirms each required action occurs after the preceding action.
 */
function assertOrdered(source: string, actions: string[]) {
  let cursor = -1;
  for (const action of actions) {
    const index = source.indexOf(action, cursor + 1);
    assert.notEqual(index, -1, `Missing ordered action: ${action}`);
    cursor = index;
  }
}

test('import page renders the focused folder header without the explorer search field', () => {
  //Static server rendering exercises the public page component without a DOM
  //test dependency or any browser effects.
  const snapshot = createExplorerSnapshot();
  const html = renderToStaticMarkup(createElement(ImportPage, {
    application: 'Tabular',
    status: 'ready',
    version: '0.1.0',
    surface: 'import-entry',
    route: { folder: 'operations' },
    snapshot,
    identity: { displayName: 'Test User' },
    csrfToken: 'csrf'
  }));

  //The accepted import shell retains brand, folder context, close action, and
  //breadcrumb while removing the irrelevant controlled Search files input.
  assert.match(html, /class="explorer-topbar import-focused-topbar"/);
  assert.match(html, /class="import-folder-context">Operations<\/span>/);
  assert.match(html, /<button[^>]*class="secondary-action import-close-action"[^>]*>Close import<\/button>/);
  assert.match(html, /Files[\s\S]*Operations[\s\S]*Import values/);
  assert.doesNotMatch(html, /Search files|type="search"|class="explorer-search"/);
});

test('canceled result recovery clears staged UI state and returns to source selection', () => {
  //The repository has no DOM interaction harness, so this narrow wiring test
  //guards the state transition behind the rendered Resume import callback.
  const retry = sourceSection('const retry = async () => {', 'const leaveImport = async () => {');
  assertOrdered(retry, [
    "if (operation?.state === 'cancelled')",
    'setOperation(undefined)',
    'setMapping([])',
    'setMappingErrors({})',
    "setIdentity({ fileName: '', tableName: '' })",
    "setStep('choose-source')",
    "setStatus({ kind: 'ready' })",
    'return;'
  ]);
  assert.match(pageSource, /onRetry=\{\(\) => void retry\(\)\}/);
});

test('Close import and wizard Cancel abandon a staged operation before navigation', () => {
  //Keep cancellation and navigation in one ordered block so a future shortcut
  //cannot leave staged values behind when either visible exit action is used.
  const leaveImport = sourceSection('const leaveImport = async () => {', 'const source = operation ? {');
  assert.match(
    leaveImport,
    /\['initiated', 'uploading', 'preview', 'ready'\]\.includes\(operation\.state\)/
  );
  assertOrdered(leaveImport, [
    "dispatchImportMutation({ type: 'import.cancel', importId: operation.id }",
    "if (result.status === 'error')",
    'return;',
    "window.location.assign(`/pages/browse.html?folder=${folder.slug}`)"
  ]);

  //Both the focused-header exit and the Step 1 Cancel callback share the same
  //abandon path instead of navigating independently.
  assert.match(pageSource, /onClick=\{\(\) => void leaveImport\(\)\}/);
  assert.match(pageSource, /onCancel=\{\(\) => void leaveImport\(\)\}/);
});
