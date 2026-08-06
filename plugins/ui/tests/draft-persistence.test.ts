//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { GridEditDraft } from '../../grid/helpers/editing.js';
import {
  DraftPersistenceRegistry,
  DraftPersistenceSequencer
} from '../helpers/draft-persistence.js';
import {
  applyServerDraftIssues,
  conflictingDraftTargets,
  draftForSchemaRevalidation,
  projectDraftCellIssues
} from '../helpers/draft-errors.js';

test('rapid persistent corrections serialize behind one draft create and reuse its handle', async () => {
  const sequencer = new DraftPersistenceSequencer<{ id: string, version: number, }>();
  let releaseCreate!: () => void;
  const createGate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  const calls: string[] = [];

  const creating = sequencer.enqueue(async (handle) => {
    calls.push(handle ? 'unexpected-update' : 'create:start');
    await createGate;
    calls.push('create:finish');
    return {
      result: 'created',
      handle: { id: 'draft_one', version: 1 }
    };
  });
  const correcting = sequencer.enqueue(async (handle) => {
    calls.push(`update:${handle?.id}:${handle?.version}`);
    return {
      result: 'updated',
      handle: { id: handle!.id, version: 2 }
    };
  });

  await Promise.resolve();
  assert.deepEqual(calls, ['create:start']);
  releaseCreate();
  assert.equal(await creating, 'created');
  assert.equal(await correcting, 'updated');
  await sequencer.settle();
  assert.deepEqual(calls, ['create:start', 'create:finish', 'update:draft_one:1']);
  assert.deepEqual(sequencer.current(), { id: 'draft_one', version: 2 });
});

test('adjacent sparse rows retain independent persistence handles', async () => {
  const registry = new DraftPersistenceRegistry<string, { id: string, version: number, }>();
  const calls: string[] = [];

  await registry.enqueue('row-19', async (handle) => {
    calls.push(`row-19:${handle?.id || 'create'}`);
    return {
      result: undefined,
      handle: { id: 'draft_row_19', version: 1 }
    };
  });
  await registry.enqueue('row-20', async (handle) => {
    calls.push(`row-20:${handle?.id || 'create'}`);
    return {
      result: undefined,
      handle: { id: 'draft_row_20', version: 1 }
    };
  });
  await registry.enqueue('row-19', async (handle) => {
    calls.push(`row-19:${handle?.id}:${handle?.version}`);
    return {
      result: undefined,
      handle: { id: handle!.id, version: 2 }
    };
  });

  assert.deepEqual(calls, [
    'row-19:create',
    'row-20:create',
    'row-19:draft_row_19:1'
  ]);
  assert.deepEqual(registry.current('row-19'), { id: 'draft_row_19', version: 2 });
  assert.deepEqual(registry.current('row-20'), { id: 'draft_row_20', version: 1 });
  registry.remove('row-19');
  assert.equal(registry.current('row-19'), undefined);
  assert.deepEqual(
    registry.current('row-20'),
    { id: 'draft_row_20', version: 1 },
    'discarding one row must not clear its adjacent draft handle'
  );
});

test('invalid insert projection reports only fields with explicit issues', () => {
  const draft: GridEditDraft = {
    id: 'draft_insert',
    kind: 'insert',
    index: 0,
    row: { id: 'draft_row', customer: null, note: 'valid' },
    changes: [
      {
        point: { rowId: 'draft_row', columnId: 'customer' },
        before: null,
        after: null,
        raw: '',
        issue: { code: 'required', message: 'Choose a customer.', columnId: 'customer' }
      },
      {
        point: { rowId: 'draft_row', columnId: 'note' },
        before: null,
        after: 'valid',
        raw: 'valid'
      }
    ]
  };
  assert.deepEqual(projectDraftCellIssues(draft, 'invalid').map((issue) => issue.columnId), [
    'customer'
  ]);
  assert.equal(
    projectDraftCellIssues(draft, 'invalid')[0]?.showCellToken,
    false,
    'an untouched required cell belongs to the row-number summary'
  );
});

test('invalid insert values render a spreadsheet token without losing raw input', () => {
  const draft: GridEditDraft = {
    id: 'draft_insert',
    kind: 'insert',
    index: 0,
    row: { id: 'draft_row', quantity: 'letters', title: null },
    changes: [
      {
        point: { rowId: 'draft_row', columnId: 'quantity' },
        before: null,
        after: 'letters',
        raw: 'letters',
        issue: {
          code: 'invalid_value',
          message: 'Enter a valid number.',
          columnId: 'quantity'
        }
      },
      {
        point: { rowId: 'draft_row', columnId: 'title' },
        before: null,
        after: null,
        raw: '',
        issue: { code: 'required', message: 'Title is required.', columnId: 'title' }
      }
    ]
  };

  const issues = projectDraftCellIssues(draft, 'invalid');
  assert.equal(issues[0]?.token, '#VALUE!');
  assert.equal(issues[0]?.showCellToken, true);
  assert.equal(issues[1]?.showCellToken, false);
  assert.equal(draft.changes[0]?.raw, 'letters');
});

test('stale drafts keep raw values visible while server issues target useful cells', () => {
  const draft: GridEditDraft = {
    id: 'draft_insert',
    kind: 'insert',
    index: 0,
    row: { id: 'draft_row', title: 'iPhoneTX', price: '50000' },
    changes: [
      {
        point: { rowId: 'draft_row', columnId: 'title' },
        before: null,
        after: 'iPhoneTX',
        raw: 'iPhoneTX'
      },
      {
        point: { rowId: 'draft_row', columnId: 'price' },
        before: null,
        after: '50000',
        raw: '50000'
      }
    ]
  };

  assert.deepEqual(projectDraftCellIssues(draft, 'stale'), []);
  const rejected = applyServerDraftIssues(draft, [{
    columnId: 'price',
    code: 'invalid_decimal',
    message: 'Enter a valid number.'
  }]);
  assert.equal(rejected.changes[0]!.issue, undefined);
  assert.equal(rejected.changes[1]!.issue?.message, 'Enter a valid number.');
});

test('schema revalidation clears only stale envelope issues', () => {
  const draft: GridEditDraft = {
    id: 'draft_insert',
    kind: 'insert',
    index: 0,
    row: { id: 'draft_row', title: 'iPhoneTX', price: '50000' },
    changes: [
      {
        point: { rowId: 'draft_row', columnId: 'title' },
        before: null,
        after: 'iPhoneTX',
        raw: 'iPhoneTX',
        issue: { code: 'schema_changed', message: 'The file schema changed' }
      },
      {
        point: { rowId: 'draft_row', columnId: 'price' },
        before: null,
        after: '50000',
        raw: '50000',
        issue: { code: 'invalid_decimal', message: 'Enter a valid number.' }
      }
    ]
  };

  const revalidating = draftForSchemaRevalidation(draft);
  assert.equal(revalidating.changes[0]!.issue, undefined);
  assert.equal(revalidating.changes[1]!.issue?.code, 'invalid_decimal');
});

test('row-version retry permits unchanged targets and detects real concurrent edits', () => {
  const draft: GridEditDraft = {
    id: 'draft_update',
    kind: 'cells',
    source: 'edit',
    changes: [{
      point: { rowId: 'row-2', columnId: 'title' },
      before: 'iPhone X2',
      after: 'iPhone X2 updated',
      raw: 'iPhone X2 updated'
    }]
  };

  //A version-only mismatch is safe to retry because the target cell still
  // holds the exact value the editor started from.
  assert.deepEqual(conflictingDraftTargets(draft, [{
    id: 'row-2',
    title: 'iPhone X2',
    price: '60000'
  }]), []);

  //Another action applying the same intended value is also safe and does not
  // need to be reported as destructive contention.
  assert.deepEqual(conflictingDraftTargets(draft, [{
    id: 'row-2',
    title: 'iPhone X2 updated',
    price: '60000'
  }]), []);

  //A genuinely different target value remains an explicit conflict so the
  // retry can never overwrite it silently.
  assert.deepEqual(conflictingDraftTargets(draft, [{
    id: 'row-2',
    title: 'Changed elsewhere',
    price: '60000'
  }]), draft.changes);
});
