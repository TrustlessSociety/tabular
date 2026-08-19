//node
import assert from 'node:assert/strict';
import test from 'node:test';

//modules
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

//client
import {
  CheckboxListFieldEditor,
  ExpandedFieldEditor,
  MetadataFieldEditor,
  MultiSelectFieldEditor,
  TagsFieldEditor,
  TextListFieldEditor,
  expandedEditorKeyIntent
} from '../../../src/plugins/grid/components/expanded-field-editors.js';
import { decodeExpandedFieldValue } from '../../../src/plugins/grid/helpers/field-codecs.js';

const noCommit = () => undefined;

test('Metadata editor retains and escapes exact canonical source', () => {
  const value = decodeExpandedFieldValue(
    'metadata',
    ' { "label": "<unsafe>", "amount": 9007199254740993 } '
  );
  const html = renderToStaticMarkup(createElement(MetadataFieldEditor, {
    value,
    onCommit: noCommit
  }));

  assert.match(html, /data-field="metadata"/);
  assert.match(html, /Metadata JSON object/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /9007199254740993/);
  assert.match(html, /Set SQL NULL/);
  assert.match(html, />Cancel</);
  assert.doesNotMatch(html, /defaultValue=/);
});

test('Tags and Text List editors project stored order and duplicate policy visibly', () => {
  const tags = renderToStaticMarkup(createElement(TagsFieldEditor, {
    value: decodeExpandedFieldValue('tags', '["beta","alpha"]'),
    onCommit: noCommit
  }));
  const textList = renderToStaticMarkup(createElement(TextListFieldEditor, {
    value: decodeExpandedFieldValue('text-list', '["same","same"]'),
    onCommit: noCommit
  }));

  assert.ok(tags.indexOf('value="beta"') < tags.indexOf('value="alpha"'));
  assert.match(tags, /Add tag/);
  assert.equal((textList.match(/value="same"/g) || []).length, 2);
  assert.match(textList, /Add item/);
});

test('choice editors reflect stored selections without selecting a default', () => {
  const options = [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' }
  ];
  const selected = renderToStaticMarkup(createElement(MultiSelectFieldEditor, {
    value: decodeExpandedFieldValue('multi-select', '["closed"]'),
    options,
    onCommit: noCommit
  }));
  const blank = renderToStaticMarkup(createElement(CheckboxListFieldEditor, {
    value: null,
    options,
    onCommit: noCommit
  }));

  assert.match(selected, /data-field="multi-select"/);
  assert.equal((selected.match(/checked=""/g) || []).length, 1);
  assert.match(blank, /data-field="checkbox-list"/);
  assert.match(blank, /SQL NULL/);
  assert.equal((blank.match(/checked=""/g) || []).length, 0);
});

test('empty collection remains distinct from SQL NULL in editor output', () => {
  const empty = renderToStaticMarkup(createElement(TextListFieldEditor, {
    value: decodeExpandedFieldValue('text-list', '[]'),
    onCommit: noCommit
  }));
  const sqlNull = renderToStaticMarkup(createElement(TextListFieldEditor, {
    value: null,
    onCommit: noCommit
  }));

  assert.match(empty, /Empty collection/);
  assert.doesNotMatch(empty, />SQL NULL</);
  assert.match(sqlNull, />SQL NULL</);
  assert.doesNotMatch(sqlNull, /Empty collection/);
});

test('editor keyboard intent preserves composition, multiline input, and button activation', () => {
  assert.equal(expandedEditorKeyIntent('Enter'), 'commit');
  assert.equal(expandedEditorKeyIntent('Enter', { shiftKey: true }), 'none');
  assert.equal(expandedEditorKeyIntent('Enter', { isButton: true }), 'none');
  assert.equal(expandedEditorKeyIntent('Enter', { isComposing: true }), 'none');
  assert.equal(expandedEditorKeyIntent('Escape'), 'cancel');
  assert.equal(expandedEditorKeyIntent('Tab'), 'none');
});

test('dispatcher exposes every expanded Field family through one integration boundary', () => {
  const fields = [
    'metadata',
    'tags',
    'text-list',
    'multi-select',
    'checkbox-list'
  ] as const;

  for (const field of fields) {
    const source = field === 'metadata' ? '{}' : '[]';
    const html = renderToStaticMarkup(createElement(ExpandedFieldEditor, {
      field,
      value: decodeExpandedFieldValue(field, source),
      options: [],
      onCommit: noCommit
    }));
    assert.match(html, new RegExp(`data-field="${field}"`));
    assert.match(html, />Apply</);
    assert.match(html, /Set SQL NULL/);
  }
});
