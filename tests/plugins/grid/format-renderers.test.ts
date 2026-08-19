//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import { canonicalJsonValue } from '../../../src/plugins/capability/helpers/value-contracts.js';
import {
  escapeFormatText,
  renderCellFormat,
  type FormatRenderOptions
} from '../../../src/plugins/grid/helpers/format-renderers.js';

const enUtc = {
  locale: { value: 'en-US', source: 'format' },
  timeZone: { value: 'UTC', source: 'workspace' }
} satisfies FormatRenderOptions;

test('plain, clipped, and wrapped output always escape canonical text without mutation', () => {
  const value = '<img src=x onerror=alert(1)> & "quoted"';
  for (const format of ['plain', 'clipped', 'wrapped'] as const) {
    const rendered = renderCellFormat(format, value);
    assert.equal(rendered.status, 'rendered');
    assert.equal(rendered.canonicalText, value);
    assert.equal(rendered.text, value);
    assert.doesNotMatch(rendered.html, /<img/i);
    assert.match(rendered.html, /&lt;img/);
    assert.match(rendered.html, /&quot;quoted&quot;/);
  }
  assert.equal(value, '<img src=x onerror=alert(1)> & "quoted"');
  assert.equal(escapeFormatText("<'&\">"), '&lt;&#39;&amp;&quot;&gt;');
});

test('text transforms are visual and require explicit locale metadata', () => {
  const rendered = renderCellFormat('text-transform', 'istanbul izmir', { transform: 'title' }, {
    locale: { value: 'tr-TR', source: 'user' }
  });
  assert.equal(rendered.text, 'İstanbul İzmir');
  assert.equal(rendered.canonicalText, 'istanbul izmir');
  assert.deepEqual(rendered.metadata.locale, { value: 'tr-TR', source: 'user' });

  const missingLocale = renderCellFormat('text-transform', '<b>x</b>', { transform: 'upper' });
  assert.equal(missingLocale.status, 'fallback');
  assert.equal(missingLocale.diagnostic?.code, 'invalid_config');
  assert.equal(missingLocale.html, '&lt;b&gt;x&lt;/b&gt;');
});

test('link renderers allow-list targets, escape labels, and harden external navigation', () => {
  const link = renderCellFormat('link', 'https://example.com/?q=<safe>', { label: '<Open>' });
  assert.equal(link.status, 'rendered');
  assert.match(link.html, /^<a /);
  assert.match(link.html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(link.html, /&lt;Open&gt;/);
  assert.doesNotMatch(link.html, /<Open>/);

  const email = renderCellFormat('email-link', 'person@example.com', { label: 'Email & reply' });
  assert.match(email.html, /href="mailto:person@example.com"/);
  assert.match(email.html, /Email &amp; reply/);

  const phone = renderCellFormat('phone-link', '+63 (917) 123-4567 ext. 9');
  assert.match(phone.html, /href="tel:\+639171234567;ext=9"/);

  for (const target of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd'
  ]) {
    const unsafe = renderCellFormat('link', target);
    assert.equal(unsafe.status, 'fallback');
    assert.equal(unsafe.diagnostic?.code, 'unsafe_target');
    assert.doesNotMatch(unsafe.html, /<a\b/i);
    assert.equal(unsafe.text, target);
  }
});

test('number and currency Formats preserve exact decimal text beyond IEEE-754 precision', () => {
  const number = renderCellFormat('number', '9007199254740993.005', {
    decimals: 2,
    grouping: true
  }, enUtc);
  assert.equal(number.status, 'rendered');
  assert.equal(number.text, '9,007,199,254,740,993.01');
  assert.equal(number.canonicalText, '9007199254740993.005');

  const percent = renderCellFormat('number', '0.125', {
    decimals: 1,
    grouping: false,
    style: 'percent'
  }, enUtc);
  assert.equal(percent.text, '12.5%');

  const currency = renderCellFormat('currency', '-12345678901234567890.555', {
    currency: 'USD',
    decimals: 2,
    grouping: true,
    sign: 'accounting'
  }, enUtc);
  assert.equal(currency.text, '($12,345,678,901,234,567,890.56)');

  const invalid = renderCellFormat('number', '1e50', { decimals: 0 }, enUtc);
  assert.equal(invalid.status, 'fallback');
  assert.equal(invalid.diagnostic?.code, 'invalid_value');
  assert.equal(invalid.text, '1e50');
});

test('rating, Yes/No, label, country, currency-code, and color output remain safe text', () => {
  const rating = renderCellFormat('rating', '3', { maximum: 5 }, enUtc);
  assert.equal(rating.text, '★★★☆☆ 3/5');
  assert.match(rating.html, /aria-label="3 of 5"/);

  assert.equal(renderCellFormat('yes-no', false, { falseLabel: 'Disabled' }).text, 'Disabled');
  const yes = renderCellFormat('yes-no', true, { trueLabel: '<Yes>' });
  assert.equal(yes.text, '<Yes>');
  assert.match(yes.html, /&lt;Yes&gt;/);

  const label = renderCellFormat('label', 'open', { labels: { open: '<Open>' } });
  assert.equal(label.text, '<Open>');
  assert.match(label.html, /&lt;Open&gt;/);

  const country = renderCellFormat('country-label', 'PH', {}, enUtc);
  assert.equal(country.text, 'Philippines');
  const currency = renderCellFormat('currency-label', 'PHP', {}, enUtc);
  assert.match(currency.text, /Philippine peso/i);

  const color = renderCellFormat('color', '#12aBcD');
  assert.match(color.html, /background-color:#12aBcD/);
  const injectedColor = renderCellFormat('color', 'red; background:url(javascript:alert(1))');
  assert.equal(injectedColor.status, 'fallback');
  assert.doesNotMatch(injectedColor.html, /style=/);
});

test('date, time, instant, and relative Formats use explicit locale and IANA timezone metadata', () => {
  const date = renderCellFormat('date', '2026-08-13', { dateStyle: 'long' }, enUtc);
  assert.equal(date.text, 'August 13, 2026');
  assert.equal(date.metadata.timeZone?.value, 'UTC');

  const time = renderCellFormat('time', '23:15:30', { timeStyle: 'medium', hourCycle: 'h23' }, enUtc);
  assert.equal(time.text, '23:15:30');

  const manila = {
    locale: { value: 'en-US', source: 'workspace' },
    timeZone: { value: 'Asia/Manila', source: 'format' }
  } satisfies FormatRenderOptions;
  const instant = renderCellFormat('date-time', '2026-08-13T00:30:00Z', {
    dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23'
  }, manila);
  assert.match(instant.text, /Aug 13, 2026/);
  assert.match(instant.text, /08:30/);
  assert.deepEqual(instant.metadata.timeZone, { value: 'Asia/Manila', source: 'format' });

  const relative = renderCellFormat('relative-time', '2026-08-14', {}, {
    ...manila,
    now: '2026-08-13T04:00:00Z'
  });
  assert.equal(relative.text, 'tomorrow');

  const implicitZone = renderCellFormat('date-time', '2026-08-13T00:30:00Z', {}, {
    locale: enUtc.locale
  });
  assert.equal(implicitZone.status, 'fallback');
  assert.equal(implicitZone.diagnostic?.code, 'invalid_config');
  const invalidZone = renderCellFormat('date-time', '2026-08-13T00:30:00Z', {}, {
    locale: enUtc.locale,
    timeZone: { value: 'Not/A_Zone', source: 'format' }
  });
  assert.equal(invalidZone.status, 'fallback');
});

test('code output escapes source and rejects non-allow-listed grammar names', () => {
  const code = renderCellFormat('code-highlighting', '<script>alert(1)</script>', {
    language: 'javascript'
  });
  assert.match(code.html, /class="language-javascript"/);
  assert.match(code.html, /&lt;script&gt;/);
  assert.doesNotMatch(code.html, /<script>/);

  const badLanguage = renderCellFormat('code-highlighting', '<svg onload=alert(1)>', {
    language: 'javascript" onmouseover="alert(1)'
  });
  assert.equal(badLanguage.status, 'fallback');
  assert.doesNotMatch(badLanguage.html, /<svg/);
});

test('Markdown permits a small safe grammar while escaping raw HTML and disabling active schemes', () => {
  const source = [
    '# Hello <img src=x onerror=alert(1)>',
    '',
    '**bold** [safe](https://example.com) [bad](javascript:alert(1))',
    '<script>alert(2)</script>'
  ].join('\n');
  const markdown = renderCellFormat('markdown', source);
  assert.equal(markdown.status, 'rendered');
  assert.match(markdown.html, /<h1>Hello &lt;img/);
  assert.match(markdown.html, /<strong>bold<\/strong>/);
  assert.match(markdown.html, /href="https:\/\/example.com\/"/);
  assert.doesNotMatch(markdown.html, /javascript:/i);
  assert.doesNotMatch(markdown.html, /<script>|<img/i);
  assert.match(markdown.html, /&lt;script&gt;/);
  assert.equal(markdown.canonicalText, source);
});

test('Metadata, List, Spread, and Tags previews are bounded and escaped', () => {
  const metadataValue = canonicalJsonValue(JSON.stringify({
    '<key>': '<script>', second: 2, third: true, fourth: null
  }));
  const metadata = renderCellFormat('metadata', metadataValue, { maxEntries: 2, maxTextLength: 20 });
  assert.equal(metadata.metadata.overflow, 2);
  assert.match(metadata.html, /&lt;key&gt;/);
  assert.match(metadata.html, /&lt;script&gt;/);
  assert.doesNotMatch(metadata.html, /<script>/);
  assert.match(metadata.html, /\+2 more/);

  const listValue = canonicalJsonValue(JSON.stringify(['<img>', 'two', 'three', 'four']));
  const list = renderCellFormat('list', listValue, { maxItems: 2, maxTextLength: 8 });
  assert.equal(list.metadata.overflow, 2);
  assert.doesNotMatch(list.html, /<img>/);
  assert.match(list.html, /&lt;img&gt;/);

  const spread = renderCellFormat('spread', listValue, { maxItems: 3, separator: ' • ' });
  assert.match(spread.html, / • /);
  const tags = renderCellFormat('tags', listValue, { maxItems: 3 });
  assert.equal((tags.html.match(/class="tabular-format-tag"/g) ?? []).length, 3);

  const tooMany = renderCellFormat('list', listValue, { maxItems: 21 });
  assert.equal(tooMany.status, 'fallback');
  assert.equal(tooMany.diagnostic?.code, 'invalid_config');
  assert.equal(tooMany.html, escapeFormatText(listValue.source));
});

test('raw HTML, executable formulas, unknown config, and unexpected renderer errors all fail closed', () => {
  for (const format of ['html', 'formula']) {
    const result = renderCellFormat(format, '<svg onload=alert(1)>');
    assert.equal(result.status, 'fallback');
    assert.equal(result.diagnostic?.code, 'unsupported_format');
    assert.doesNotMatch(result.html, /<svg/);
  }

  const unknownConfig = renderCellFormat('plain', '<b>value</b>', { dangerouslySetInnerHTML: '<b>value</b>' });
  assert.equal(unknownConfig.status, 'fallback');
  assert.equal(unknownConfig.diagnostic?.code, 'invalid_config');
  assert.equal(unknownConfig.html, '&lt;b&gt;value&lt;/b&gt;');

  const hostileConfig = new Proxy({}, {
    ownKeys() {
      throw new Error('hostile metadata trap');
    }
  });
  const contained = renderCellFormat('plain', '<script>still safe</script>', hostileConfig);
  assert.equal(contained.status, 'fallback');
  assert.equal(contained.diagnostic?.code, 'renderer_failure');
  assert.equal(contained.html, '&lt;script&gt;still safe&lt;/script&gt;');
  assert.equal(contained.diagnostic?.message, 'Format renderer failed safely');
});
