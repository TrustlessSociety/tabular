import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coverageFor,
  coverageForIndexMaps,
  LogicalSelectionStore,
  selectionLabel
} from '../helpers/selection.js';

test('logical selection extends from its stable anchor and reports range coverage', () => {
  const store = new LogicalSelectionStore();
  const changes: unknown[] = [];
  const unsubscribe = store.subscribe((selection) => changes.push(selection));
  store.selectCell({ rowId: 'row-2', columnId: 'customer' });
  store.selectCell({ rowId: 'row-4', columnId: 'status' }, true);
  assert.deepEqual(store.get(), {
    kind: 'range',
    anchor: { rowId: 'row-2', columnId: 'customer' },
    focus: { rowId: 'row-4', columnId: 'status' }
  });
  assert.equal(selectionLabel(store.get()), 'customer:row-2 to status:row-4');
  assert.deepEqual(
    coverageFor(
      store.get(),
      { rowId: 'row-3', columnId: 'channel' },
      ['row-1', 'row-2', 'row-3', 'row-4'],
      ['order', 'customer', 'channel', 'status']
    ),
    { activeCell: false, activeRow: false, activeColumn: false, inRange: true }
  );
  assert.equal(changes.length, 2);
  unsubscribe();
});

test('selection identifiers survive order changes and clear only when their objects disappear', () => {
  const store = new LogicalSelectionStore({
    kind: 'cell',
    anchor: { rowId: 'row-8', columnId: 'total' },
    focus: { rowId: 'row-8', columnId: 'total' }
  });
  assert.deepEqual(
    coverageFor(
      store.get(),
      { rowId: 'row-8', columnId: 'total' },
      ['row-10', 'row-8', 'row-3'],
      ['status', 'total', 'customer']
    ),
    { activeCell: true, activeRow: true, activeColumn: true, inRange: true }
  );
  assert.ok(store.reconcile(new Set(['row-8']), new Set(['total'])));
  assert.equal(store.reconcile(new Set(['row-9']), new Set(['total'])), null);
  assert.equal(store.get(), null);
});

test('row and column selections remain logical and describe full-band coverage', () => {
  const store = new LogicalSelectionStore();
  store.selectRow('row-3');
  assert.deepEqual(
    coverageFor(store.get(), { rowId: 'row-3', columnId: 'a' }, ['row-3'], ['a']),
    { activeCell: false, activeRow: true, activeColumn: false, inRange: false }
  );
  store.selectColumn('status');
  assert.deepEqual(
    coverageFor(store.get(), { rowId: 'row-7', columnId: 'status' }, ['row-7'], ['status']),
    { activeCell: false, activeRow: false, activeColumn: true, inRange: false }
  );
});

test('named headers stay distinct from whole columns and reconcile by stable column identity', () => {
  const store = new LogicalSelectionStore();
  store.selectHeader('status');
  assert.deepEqual(store.get(), { kind: 'header', columnId: 'status' });
  assert.equal(selectionLabel(store.get()), 'Header status');
  assert.deepEqual(
    coverageFor(
      store.get(),
      { rowId: 'row-1', columnId: 'status' },
      ['row-1'],
      ['order', 'status']
    ),
    { activeCell: false, activeRow: false, activeColumn: false, inRange: false }
  );
  store.reconcile(new Set(), new Set([ 'status' ]));
  assert.deepEqual(store.get(), { kind: 'header', columnId: 'status' });
  store.reconcile(new Set(), new Set([ 'order' ]));
  assert.equal(store.get(), null);
});

test('range coverage performs constant index-map lookups independent of logical row count', () => {
  const rows = new Map(Array.from({ length: 10_000 }, (_, index) => [`row-${index}`, index]));
  const columns = new Map([['a', 0], ['b', 1], ['c', 2]]);
  let rowLookups = 0;
  let columnLookups = 0;
  const rowIndexes = new Proxy(rows, {
    get(target, property, receiver) {
      if (property === 'get') return (key: string) => {
        rowLookups += 1;
        return target.get(key);
      };
      return Reflect.get(target, property, receiver);
    }
  });
  const columnIndexes = new Proxy(columns, {
    get(target, property, receiver) {
      if (property === 'get') return (key: string) => {
        columnLookups += 1;
        return target.get(key);
      };
      return Reflect.get(target, property, receiver);
    }
  });
  assert.equal(coverageForIndexMaps({
    kind: 'range',
    anchor: { rowId: 'row-100', columnId: 'a' },
    focus: { rowId: 'row-9000', columnId: 'c' }
  }, { rowId: 'row-5000', columnId: 'b' }, rowIndexes, columnIndexes).inRange, true);
  assert.equal(rowLookups, 3);
  assert.equal(columnLookups, 3);
});
