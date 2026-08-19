//client
import type { FileFormatKind } from '../../files/helpers/contracts.js';
import type { CanonicalJsonValue } from '../../capability/helpers/value-contracts.js';
import type { GridCellValue } from './contracts.js';

export type FormatMetadataSource = 'format' | 'workspace' | 'user';

export type ResolvedFormatMetadata = {
  value: string,
  source: FormatMetadataSource,
};

export type FormatRenderOptions = {
  locale?: ResolvedFormatMetadata,
  timeZone?: ResolvedFormatMetadata,
  now?: string | Date,
};

export type FormatDiagnostic = {
  code: 'unsupported_format' | 'invalid_config' | 'invalid_value'
    | 'unsafe_target' | 'renderer_failure',
  message: string,
};

export type FormatRenderResult = {
  format: string,
  status: 'rendered' | 'fallback',
  canonicalText: string,
  text: string,
  /** Safe, escaped markup produced only by this module. */
  html: string,
  diagnostic?: FormatDiagnostic,
  metadata: {
    locale?: ResolvedFormatMetadata,
    timeZone?: ResolvedFormatMetadata,
    overflow?: number,
    truncated?: boolean,
  },
};

type RendererOutput = Pick<FormatRenderResult, 'text' | 'html'> & {
  metadata?: FormatRenderResult['metadata'],
};

const MAX_COLLECTION_ITEMS = 20;
const MAX_PREVIEW_TEXT = 500;
const NUMBER_PARTS = new Set(['integer', 'group', 'decimal', 'fraction']);
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const CODE_LANGUAGES = new Set([
  'plain', 'bash', 'css', 'html', 'javascript', 'json', 'markdown',
  'postgresql', 'sql', 'typescript', 'xml'
]);

/**
 * Render one canonical grid value without mutating it or trusting caller HTML.
 * Every exception is contained as an escaped canonical fallback diagnostic.
 */
export function renderCellFormat(
  format: FileFormatKind | string,
  value: GridCellValue,
  config: Record<string, unknown> = {},
  options: FormatRenderOptions = {}
): FormatRenderResult {
  const canonicalText = canonicalValueText(value);
  try {
    const output = renderKnownFormat(format, value, config, options);
    return {
      format,
      status: 'rendered',
      canonicalText,
      text: output.text,
      html: output.html,
      metadata: output.metadata ?? {}
    };
  } catch (cause) {
    const diagnostic = diagnosticFor(cause);
    return {
      format,
      status: 'fallback',
      canonicalText,
      text: canonicalText,
      html: escapeHtml(canonicalText),
      diagnostic,
      metadata: {}
    };
  }
}

/** Escape text for a text or quoted-attribute position in generated markup. */
export function escapeFormatText(value: string): string {
  return escapeHtml(value);
}

function renderKnownFormat(
  format: string,
  value: GridCellValue,
  config: Record<string, unknown>,
  options: FormatRenderOptions
): RendererOutput {
  switch (format) {
    case 'plain':
    case 'plain-text': return renderPlain(value, config, 'plain');
    case 'clipped':
    case 'clipped-text': return renderPlain(value, config, 'clipped');
    case 'wrapped': return renderPlain(value, config, 'wrapped');
    case 'text-transform': return renderTextTransform(value, config, options);
    case 'email':
    case 'email-link': return renderEmail(value, config);
    case 'phone-link': return renderPhone(value, config);
    case 'link': return renderLink(value, config);
    case 'number': return renderNumber(value, config, options);
    case 'currency': return renderCurrency(value, config, options);
    case 'rating': return renderRating(value, config, options);
    case 'date': return renderTemporal('date', value, config, options);
    case 'time': return renderTemporal('time', value, config, options);
    case 'date-time': return renderTemporal('date-time', value, config, options);
    case 'relative-time': return renderRelative(value, config, options);
    case 'yes-no': return renderYesNo(value, config);
    case 'color': return renderColor(value, config);
    case 'country-label': return renderDisplayLabel('region', value, config, options);
    case 'currency-label': return renderDisplayLabel('currency', value, config, options);
    case 'label':
    case 'badge':
    case 'related-record': return renderConfiguredLabel(format, value, config);
    case 'code-highlighting': return renderCode(value, config);
    case 'markdown': return renderMarkdown(value, config);
    case 'metadata': return renderMetadata(value, config);
    case 'list': return renderCollection('list', value, config);
    case 'spread': return renderCollection('spread', value, config);
    case 'tags': return renderCollection('tags', value, config);
    default: throw renderError('unsupported_format', 'Raw HTML, formulas, media, and unknown Formats are not supported');
  }
}

function renderPlain(
  value: GridCellValue,
  config: Record<string, unknown>,
  mode: 'plain' | 'clipped' | 'wrapped'
): RendererOutput {
  assertKeys(config, []);
  const text = canonicalValueText(value);
  const className = `tabular-format-text tabular-format-text--${mode}`;
  return { text, html: `<span class="${className}">${escapeHtml(text)}</span>` };
}

function renderTextTransform(
  value: GridCellValue,
  config: Record<string, unknown>,
  options: FormatRenderOptions
): RendererOutput {
  assertKeys(config, ['transform']);
  const transform = config.transform;
  if (!['upper', 'lower', 'title'].includes(String(transform))) {
    throw renderError('invalid_config', 'Text transform must be upper, lower, or title');
  }
  const locale = resolvedLocale(options);
  const source = requireText(value);
  const text = transform === 'upper'
    ? source.toLocaleUpperCase(locale.value)
    : transform === 'lower'
      ? source.toLocaleLowerCase(locale.value)
      : source.replace(/\p{L}[\p{L}\p{M}'’-]*/gu, (word) =>
        `${word[0]!.toLocaleUpperCase(locale.value)}${word.slice(1).toLocaleLowerCase(locale.value)}`);
  return {
    text,
    html: `<span class="tabular-format-text-transform">${escapeHtml(text)}</span>`,
    metadata: { locale }
  };
}

function renderEmail(value: GridCellValue, config: Record<string, unknown>): RendererOutput {
  assertKeys(config, ['label']);
  const email = requireText(value);
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email) || hasControl(email)) {
    throw renderError('unsafe_target', 'Email target is malformed');
  }
  const label = optionalLabel(config.label, email);
  return safeAnchor(label, `mailto:${email}`, false);
}

function renderPhone(value: GridCellValue, config: Record<string, unknown>): RendererOutput {
  assertKeys(config, ['label']);
  const phone = requireText(value);
  if (!/^\+?[0-9(). -]{3,40}(?:\s?(?:x|ext\.?)\s*[0-9]{1,8})?$/i.test(phone) || hasControl(phone)) {
    throw renderError('unsafe_target', 'Phone target is malformed');
  }
  const extension = /(?:ext\.?|x)\s*(\d+)$/i.exec(phone);
  const base = extension ? phone.slice(0, extension.index) : phone;
  const target = `${base.replace(/[^+0-9]/g, '')}${extension ? `;ext=${extension[1]}` : ''}`;
  return safeAnchor(optionalLabel(config.label, phone), `tel:${target}`, false);
}

function renderLink(value: GridCellValue, config: Record<string, unknown>): RendererOutput {
  assertKeys(config, ['label', 'protocols']);
  const source = requireText(value);
  const configured = config.protocols ?? ['http', 'https'];
  if (!Array.isArray(configured) || configured.length < 1 || configured.length > 4
    || configured.some((item) => typeof item !== 'string'
      || !SAFE_LINK_PROTOCOLS.has(`${item.toLowerCase()}:`))) {
    throw renderError('invalid_config', 'Link protocols must use the closed safe protocol list');
  }
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw renderError('unsafe_target', 'Link target must be an absolute safe URL');
  }
  const allowed = new Set(configured.map((item) => `${String(item).toLowerCase()}:`));
  if (!allowed.has(parsed.protocol) || !SAFE_LINK_PROTOCOLS.has(parsed.protocol)) {
    throw renderError('unsafe_target', 'Link protocol is not allowed');
  }
  return safeAnchor(optionalLabel(config.label, source), parsed.href,
    parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

function safeAnchor(text: string, href: string, external: boolean): RendererOutput {
  const attributes = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return {
    text,
    html: `<a class="tabular-format-link" href="${escapeHtml(href)}"${attributes}>${escapeHtml(text)}</a>`
  };
}

function renderNumber(
  value: GridCellValue,
  config: Record<string, unknown>,
  options: FormatRenderOptions
): RendererOutput {
  assertKeys(config, ['decimals', 'grouping', 'style', 'sign']);
  const locale = resolvedLocale(options);
  const decimals = boundedInteger(config.decimals ?? 2, 'decimals', 0, 20);
  const grouping = optionalBoolean(config.grouping, true);
  const style = config.style ?? 'decimal';
  const sign = config.sign ?? 'auto';
  if (!['decimal', 'percent'].includes(String(style)) || !['auto', 'always'].includes(String(sign))) {
    throw renderError('invalid_config', 'Number style or sign configuration is invalid');
  }
  let parsed = exactDecimal(value);
  if (style === 'percent') parsed = shiftDecimal(parsed, 2);
  const text = formatExact(parsed, locale.value, decimals, grouping, {
    style: style as 'decimal' | 'percent',
    signDisplay: sign === 'always' ? 'always' : 'auto'
  });
  return { text, html: `<span class="tabular-format-number">${escapeHtml(text)}</span>`, metadata: { locale } };
}

function renderCurrency(
  value: GridCellValue,
  config: Record<string, unknown>,
  options: FormatRenderOptions
): RendererOutput {
  assertKeys(config, ['currency', 'decimals', 'grouping', 'sign', 'currencyDisplay']);
  const locale = resolvedLocale(options);
  const currency = String(config.currency ?? '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw renderError('invalid_config', 'Currency requires an ISO 4217 code');
  const decimals = boundedInteger(config.decimals ?? 2, 'decimals', 0, 20);
  const grouping = optionalBoolean(config.grouping, true);
  const sign = config.sign ?? 'auto';
  const currencyDisplay = config.currencyDisplay ?? 'symbol';
  if (!['auto', 'always', 'accounting'].includes(String(sign))
    || !['symbol', 'narrowSymbol', 'code', 'name'].includes(String(currencyDisplay))) {
    throw renderError('invalid_config', 'Currency display configuration is invalid');
  }
  const text = formatExact(exactDecimal(value), locale.value, decimals, grouping, {
    style: 'currency', currency, currencyDisplay: currencyDisplay as Intl.NumberFormatOptions['currencyDisplay'],
    currencySign: sign === 'accounting' ? 'accounting' : 'standard',
    signDisplay: sign === 'always' ? 'always' : 'auto'
  });
  return { text, html: `<span class="tabular-format-currency">${escapeHtml(text)}</span>`, metadata: { locale } };
}

function renderRating(
  value: GridCellValue,
  config: Record<string, unknown>,
  options: FormatRenderOptions
): RendererOutput {
  assertKeys(config, ['maximum', 'icon', 'showValue']);
  const maximum = boundedInteger(config.maximum ?? 5, 'maximum', 1, 20);
  const icon = config.icon ?? '★';
  if (typeof icon !== 'string' || Array.from(icon).length !== 1 || hasControl(icon)) {
    throw renderError('invalid_config', 'Rating icon must be one safe character');
  }
  const showValue = optionalBoolean(config.showValue, true);
  const locale = resolvedLocale(options);
  const parsed = exactDecimal(value);
  const whole = BigInt(parsed.integer || '0');
  if (parsed.negative || whole > BigInt(maximum)
    || (whole === BigInt(maximum) && /[1-9]/.test(parsed.fraction))) {
    throw renderError('invalid_value', 'Rating is outside configured bounds');
  }
  const filled = Number(whole);
  const icons = `${icon.repeat(filled)}${'☆'.repeat(maximum - filled)}`;
  const exact = formatExact(parsed, locale.value, Math.min(parsed.fraction.length, 20), false, { style: 'decimal' });
  const text = showValue ? `${icons} ${exact}/${maximum}` : icons;
  return {
    text,
    html: `<span class="tabular-format-rating" aria-label="${escapeHtml(`${exact} of ${maximum}`)}">${escapeHtml(text)}</span>`,
    metadata: { locale }
  };
}

function renderTemporal(
  kind: 'date' | 'time' | 'date-time',
  value: GridCellValue,
  config: Record<string, unknown>,
  options: FormatRenderOptions
): RendererOutput {
  assertKeys(config, ['dateStyle', 'timeStyle', 'hourCycle']);
  const locale = resolvedLocale(options);
  const source = requireText(value);
  const dateStyle = enumValue(config.dateStyle ?? 'medium', ['short', 'medium', 'long', 'full'], 'date style');
  const timeStyle = enumValue(config.timeStyle ?? 'short', ['short', 'medium', 'long', 'full'], 'time style');
  const hourCycle = config.hourCycle === undefined ? undefined
    : enumValue(config.hourCycle, ['h11', 'h12', 'h23', 'h24'], 'hour cycle') as Intl.LocaleHourCycleKey;
  let instant: Date;
  let timeZone: ResolvedFormatMetadata | undefined;
  let formatOptions: Intl.DateTimeFormatOptions;

  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    if (kind !== 'date') throw renderError('invalid_value', 'Calendar dates are compatible only with Date output');
    instant = parseCalendarDate(source);
    timeZone = { value: 'UTC', source: 'format' };
    formatOptions = { dateStyle: dateStyle as Intl.DateTimeFormatOptions['dateStyle'], timeZone: 'UTC' };
  } else if (/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(source)) {
    if (kind !== 'time') throw renderError('invalid_value', 'Wall-clock times are compatible only with Time output');
    instant = parseWallTime(source);
    timeZone = { value: 'UTC', source: 'format' };
    formatOptions = { timeStyle: timeStyle as Intl.DateTimeFormatOptions['timeStyle'], timeZone: 'UTC', hourCycle };
  } else {
    instant = parseInstant(source);
    timeZone = resolvedTimeZone(options);
    formatOptions = kind === 'date'
      ? { dateStyle: dateStyle as Intl.DateTimeFormatOptions['dateStyle'], timeZone: timeZone.value }
      : kind === 'time'
        ? { timeStyle: timeStyle as Intl.DateTimeFormatOptions['timeStyle'], timeZone: timeZone.value, hourCycle }
        : {
            dateStyle: dateStyle as Intl.DateTimeFormatOptions['dateStyle'],
            timeStyle: timeStyle as Intl.DateTimeFormatOptions['timeStyle'],
            timeZone: timeZone.value,
            hourCycle
          };
  }
  const text = new Intl.DateTimeFormat(locale.value, formatOptions).format(instant);
  return {
    text,
    html: `<time class="tabular-format-${kind}" datetime="${escapeHtml(source)}">${escapeHtml(text)}</time>`,
    metadata: { locale, timeZone }
  };
}

function renderRelative(
  value: GridCellValue,
  config: Record<string, unknown>,
  options: FormatRenderOptions
): RendererOutput {
  assertKeys(config, ['numeric']);
  const locale = resolvedLocale(options);
  const timeZone = resolvedTimeZone(options);
  const numeric = enumValue(config.numeric ?? 'auto', ['always', 'auto'], 'relative numeric');
  const source = requireText(value);
  const now = options.now instanceof Date ? options.now : parseInstant(String(options.now ?? ''));
  let amount: number;
  let unit: Intl.RelativeTimeFormatUnit;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    const targetDay = Date.UTC(...calendarParts(source));
    const current = dateInZone(now, locale.value, timeZone.value);
    amount = Math.round((targetDay - Date.UTC(current.year, current.month - 1, current.day)) / 86_400_000);
    unit = 'day';
  } else {
    const deltaSeconds = (parseInstant(source).getTime() - now.getTime()) / 1000;
    const absolute = Math.abs(deltaSeconds);
    if (absolute < 60) [amount, unit] = [Math.round(deltaSeconds), 'second'];
    else if (absolute < 3600) [amount, unit] = [Math.round(deltaSeconds / 60), 'minute'];
    else if (absolute < 86_400) [amount, unit] = [Math.round(deltaSeconds / 3600), 'hour'];
    else if (absolute < 2_592_000) [amount, unit] = [Math.round(deltaSeconds / 86_400), 'day'];
    else if (absolute < 31_536_000) [amount, unit] = [Math.round(deltaSeconds / 2_592_000), 'month'];
    else [amount, unit] = [Math.round(deltaSeconds / 31_536_000), 'year'];
  }
  const text = new Intl.RelativeTimeFormat(locale.value, { numeric: numeric as 'always' | 'auto' }).format(amount, unit);
  return {
    text,
    html: `<time class="tabular-format-relative" datetime="${escapeHtml(source)}">${escapeHtml(text)}</time>`,
    metadata: { locale, timeZone }
  };
}

function renderYesNo(value: GridCellValue, config: Record<string, unknown>): RendererOutput {
  assertKeys(config, ['trueLabel', 'falseLabel', 'nullLabel']);
  const labels = {
    true: boundedPlain(config.trueLabel ?? 'Yes', 'true label', 80),
    false: boundedPlain(config.falseLabel ?? 'No', 'false label', 80),
    null: boundedPlain(config.nullLabel ?? '', 'null label', 80)
  };
  if (value !== null && typeof value !== 'boolean') throw renderError('invalid_value', 'Yes/No requires a boolean value');
  const key = value === null ? 'null' : String(value) as 'true' | 'false';
  const text = labels[key];
  return { text, html: `<span class="tabular-format-yes-no" data-value="${key}">${escapeHtml(text)}</span>` };
}

function renderColor(value: GridCellValue, config: Record<string, unknown>): RendererOutput {
  assertKeys(config, ['showValue']);
  const color = requireText(value);
  if (!safeCssColor(color)) throw renderError('invalid_value', 'Color is not in the safe color grammar');
  const showValue = optionalBoolean(config.showValue, true);
  const text = showValue ? color : 'Color swatch';
  return {
    text,
    html: `<span class="tabular-format-color"><span class="tabular-format-color__swatch" style="background-color:${escapeHtml(color)}" aria-hidden="true"></span>${showValue ? escapeHtml(color) : '<span class="sr-only">Color swatch</span>'}</span>`
  };
}

function renderDisplayLabel(
  type: 'region' | 'currency',
  value: GridCellValue,
  config: Record<string, unknown>,
  options: FormatRenderOptions
): RendererOutput {
  assertKeys(config, ['fallback']);
  const locale = resolvedLocale(options);
  const code = requireText(value).toUpperCase();
  const pattern = type === 'region' ? /^[A-Z]{2}$/ : /^[A-Z]{3}$/;
  if (!pattern.test(code)) throw renderError('invalid_value', `Invalid ${type} code`);
  const fallback = enumValue(config.fallback ?? 'code', ['code', 'code-and-label'], 'label fallback');
  let label: string | undefined;
  try {
    label = new Intl.DisplayNames([locale.value], { type, fallback: 'none' }).of(code);
  } catch {
    throw renderError('invalid_value', `Unknown ${type} code`);
  }
  if (!label) label = code;
  const text = fallback === 'code-and-label' && label !== code ? `${label} (${code})` : label;
  return { text, html: `<span class="tabular-format-label">${escapeHtml(text)}</span>`, metadata: { locale } };
}

function renderConfiguredLabel(
  format: string,
  value: GridCellValue,
  config: Record<string, unknown>
): RendererOutput {
  assertKeys(config, ['labels']);
  if (isCanonicalJson(value)) throw renderError('invalid_value', 'Labels require scalar values');
  const source = canonicalValueText(value);
  const labels = config.labels;
  if (labels !== undefined && (!labels || typeof labels !== 'object' || Array.isArray(labels)
    || Object.getPrototypeOf(labels) !== Object.prototype)) {
    throw renderError('invalid_config', 'Labels must be a plain mapping');
  }
  const mapped = labels ? (labels as Record<string, unknown>)[source] : undefined;
  const text = mapped === undefined ? source : boundedPlain(mapped, 'label', 200);
  const className = format === 'badge' ? 'tabular-format-badge' : 'tabular-format-label';
  return { text, html: `<span class="${className}">${escapeHtml(text)}</span>` };
}

function renderCode(value: GridCellValue, config: Record<string, unknown>): RendererOutput {
  assertKeys(config, ['language']);
  const source = requireText(value);
  const language = String(config.language ?? 'plain').toLowerCase();
  if (!CODE_LANGUAGES.has(language)) throw renderError('invalid_config', 'Code language is not allow-listed');
  return {
    text: source,
    html: `<pre class="tabular-format-code"><code class="language-${language}">${escapeHtml(source)}</code></pre>`
  };
}

function renderMarkdown(value: GridCellValue, config: Record<string, unknown>): RendererOutput {
  assertKeys(config, []);
  const source = requireText(value);
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let list: 'ul' | 'ol' | undefined;
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = undefined;
  };
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const unordered = /^[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      html.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`);
    } else if (unordered || ordered) {
      const next = unordered ? 'ul' : 'ol';
      if (list !== next) {
        closeList();
        list = next;
        html.push(`<${next}>`);
      }
      html.push(`<li>${inlineMarkdown((unordered ?? ordered)![1]!)}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  closeList();
  return { text: source, html: `<div class="tabular-format-markdown">${html.join('')}</div>` };
}

function inlineMarkdown(source: string): string {
  const expression = /(`[^`\n]*`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*)/g;
  let output = '';
  let cursor = 0;
  for (const match of source.matchAll(expression)) {
    output += escapeHtml(source.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('`')) output += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    else if (match[2] !== undefined) {
      const href = safeMarkdownHref(match[3]!);
      output += href
        ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(match[2])}</a>`
        : escapeHtml(match[2]);
    } else if (match[4] !== undefined) output += `<strong>${escapeHtml(match[4])}</strong>`;
    else output += `<em>${escapeHtml(match[5]!)}</em>`;
    cursor = (match.index ?? 0) + token.length;
  }
  return output + escapeHtml(source.slice(cursor));
}

function safeMarkdownHref(source: string): string | undefined {
  try {
    const url = new URL(source);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function renderMetadata(value: GridCellValue, config: Record<string, unknown>): RendererOutput {
  assertKeys(config, ['maxEntries', 'maxTextLength']);
  const json = requireJson(value, 'object');
  const parsed = JSON.parse(json.source) as Record<string, unknown>;
  if (!parsed || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
    throw renderError('invalid_value', 'Metadata requires a top-level JSON object');
  }
  const entries = Object.entries(parsed);
  if (entries.some(([, item]) => item !== null && typeof item === 'object')) {
    throw renderError('invalid_value', 'Metadata preview accepts JSON scalar properties only');
  }
  const maximum = boundedInteger(config.maxEntries ?? 3, 'max entries', 1, MAX_COLLECTION_ITEMS);
  const maxText = boundedInteger(config.maxTextLength ?? 80, 'max text length', 8, MAX_PREVIEW_TEXT);
  let truncated = false;
  const previewText: string[] = [];
  const visible = entries.slice(0, maximum).map(([key, item]) => {
    const raw = typeof item === 'string' ? item : JSON.stringify(item);
    const preview = truncateText(raw, maxText);
    truncated ||= preview !== raw;
    previewText.push(`${key}: ${preview}`);
    return `<span class="tabular-format-metadata__entry"><strong>${escapeHtml(key)}</strong>: ${escapeHtml(preview)}</span>`;
  });
  const overflow = Math.max(0, entries.length - visible.length);
  if (overflow) {
    visible.push(`<span class="tabular-format-overflow">+${overflow} more</span>`);
    previewText.push(`+${overflow} more`);
  }
  const text = previewText.join(', ');
  return {
    text,
    html: `<span class="tabular-format-metadata">${visible.join(', ')}</span>`,
    metadata: { overflow, truncated }
  };
}

function renderCollection(
  mode: 'list' | 'spread' | 'tags',
  value: GridCellValue,
  config: Record<string, unknown>
): RendererOutput {
  assertKeys(config, mode === 'spread'
    ? ['maxItems', 'maxTextLength', 'separator']
    : ['maxItems', 'maxTextLength']);
  const parsed = JSON.parse(requireJson(value, 'string-array').source) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw renderError('invalid_value', 'Collection Format requires a JSON string array');
  }
  const maximum = boundedInteger(config.maxItems ?? 3, 'max items', 1, MAX_COLLECTION_ITEMS);
  const maxText = boundedInteger(config.maxTextLength ?? 80, 'max text length', 8, MAX_PREVIEW_TEXT);
  const separator = mode === 'spread'
    ? boundedPlain(config.separator ?? ', ', 'separator', 10)
    : ', ';
  let truncated = false;
  const visible = parsed.slice(0, maximum).map((item) => {
    const preview = truncateText(item, maxText);
    truncated ||= preview !== item;
    return preview;
  });
  const overflow = Math.max(0, parsed.length - visible.length);
  let html: string;
  if (mode === 'tags') {
    html = visible.map((item) => `<span class="tabular-format-tag">${escapeHtml(item)}</span>`).join(' ');
  } else {
    html = visible.map((item) => `<span class="tabular-format-list__item">${escapeHtml(item)}</span>`)
      .join(escapeHtml(separator));
  }
  if (overflow) html += `${html ? ' ' : ''}<span class="tabular-format-overflow">+${overflow} more</span>`;
  const previewText = `${visible.join(separator)}${overflow ? `${visible.length ? ' ' : ''}+${overflow} more` : ''}`;
  return {
    text: previewText,
    html: `<span class="tabular-format-${mode}">${html}</span>`,
    metadata: { overflow, truncated }
  };
}

type ExactDecimal = { negative: boolean, integer: string, fraction: string, };

function exactDecimal(value: GridCellValue): ExactDecimal {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw renderError('invalid_value', 'Numeric Format requires canonical decimal text or a finite number');
  }
  const source = String(value);
  if (typeof value === 'number' && !Number.isFinite(value)) throw renderError('invalid_value', 'Number must be finite');
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(source);
  if (!match) throw renderError('invalid_value', 'Numeric value is not canonical decimal text');
  return {
    negative: match[1] === '-' && !/^0+$/.test(`${match[2]}${match[3] ?? ''}`),
    integer: match[2]!.replace(/^0+(?=\d)/, ''),
    fraction: match[3] ?? ''
  };
}

function shiftDecimal(value: ExactDecimal, places: number): ExactDecimal {
  const digits = `${value.integer}${value.fraction}`.padEnd(value.integer.length + places, '0');
  const point = value.integer.length + places;
  return {
    negative: value.negative,
    integer: digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0',
    fraction: digits.slice(point)
  };
}

function formatExact(
  value: ExactDecimal,
  locale: string,
  decimals: number,
  grouping: boolean,
  options: Intl.NumberFormatOptions
): string {
  const rounded = roundDecimal(value, decimals);
  const formatter = new Intl.NumberFormat(locale, {
    ...options,
    useGrouping: grouping,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  const digits = localizedDigits(locale);
  const sampleParts = formatter.formatToParts(rounded.negative ? -1.1 : 1.1);
  const integerParts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(123456789)
    .filter((part) => part.type === 'integer').map((part) => Array.from(part.value).length);
  const groupSizes = integerParts.slice(0, -1).reverse();
  const separator = sampleParts.find((part) => part.type === 'group')?.value
    ?? new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(12345).find((part) => part.type === 'group')?.value
    ?? ',';
  const decimal = sampleParts.find((part) => part.type === 'decimal')?.value ?? '.';
  const grouped = grouping ? groupInteger(rounded.integer, groupSizes, separator) : rounded.integer;
  const core = `${grouped}${decimals ? `${decimal}${rounded.fraction}` : ''}`
    .replace(/\d/g, (digit) => digits[Number(digit)]!);
  let inserted = false;
  let text = '';
  for (const part of sampleParts) {
    if (NUMBER_PARTS.has(part.type)) {
      if (!inserted) text += core;
      inserted = true;
    } else {
      text += part.value;
    }
  }
  return inserted ? text : core;
}

function roundDecimal(value: ExactDecimal, decimals: number): ExactDecimal {
  const retained = value.fraction.slice(0, decimals).padEnd(decimals, '0');
  const roundUp = Number(value.fraction[decimals] ?? '0') >= 5;
  const scale = 10n ** BigInt(decimals);
  let units = BigInt(value.integer) * scale + BigInt(retained || '0');
  if (roundUp) units += 1n;
  const source = units.toString().padStart(decimals + 1, '0');
  return {
    negative: value.negative && units !== 0n,
    integer: decimals ? source.slice(0, -decimals) : source,
    fraction: decimals ? source.slice(-decimals) : ''
  };
}

function groupInteger(integer: string, sizes: number[], separator: string): string {
  const groups: string[] = [];
  let cursor = integer.length;
  let index = 0;
  while (cursor > 0) {
    const size = sizes[index] ?? sizes.at(-1) ?? 3;
    const start = Math.max(0, cursor - size);
    groups.unshift(integer.slice(start, cursor));
    cursor = start;
    index += 1;
  }
  return groups.join(separator);
}

function localizedDigits(locale: string): string[] {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  return Array.from({ length: 10 }, (_, digit) => formatter.format(digit));
}

function requireJson(value: GridCellValue, shape: CanonicalJsonValue['shape']): CanonicalJsonValue {
  if (!isCanonicalJson(value) || value.shape !== shape) {
    throw renderError('invalid_value', `Format requires canonical JSON ${shape} transport`);
  }
  return value;
}

function isCanonicalJson(value: GridCellValue): value is CanonicalJsonValue {
  return Boolean(value && typeof value === 'object' && (value as CanonicalJsonValue).type === 'json'
    && typeof (value as CanonicalJsonValue).source === 'string');
}

function canonicalValueText(value: GridCellValue): string {
  if (value === null) return '';
  if (isCanonicalJson(value)) return value.source;
  return String(value);
}

function requireText(value: GridCellValue): string {
  if (typeof value !== 'string') throw renderError('invalid_value', 'Format requires canonical text');
  return value;
}

function optionalLabel(value: unknown, fallback: string): string {
  return value === undefined ? fallback : boundedPlain(value, 'label', 200);
}

function boundedPlain(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || Array.from(value).length > maximum || hasControl(value)) {
    throw renderError('invalid_config', `${label} must be bounded plain text`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw renderError('invalid_config', `${label} is outside the supported bound`);
  }
  return Number(value);
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw renderError('invalid_config', 'Boolean Format configuration is invalid');
  return value;
}

function enumValue(value: unknown, values: string[], label: string): string {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw renderError('invalid_config', `${label} is not supported`);
  }
  return value;
}

function assertKeys(config: Record<string, unknown>, keys: string[]): void {
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.getPrototypeOf(config) !== Object.prototype) {
    throw renderError('invalid_config', 'Format configuration must be a plain object');
  }
  const allowed = new Set(keys);
  if (Object.keys(config).some((key) => !allowed.has(key))) {
    throw renderError('invalid_config', 'Format configuration contains an unknown field');
  }
}

function resolvedLocale(options: FormatRenderOptions): ResolvedFormatMetadata {
  const locale = options.locale;
  if (!locale || !['format', 'workspace', 'user'].includes(locale.source)
    || typeof locale.value !== 'string' || Intl.DateTimeFormat.supportedLocalesOf([locale.value]).length !== 1) {
    throw renderError('invalid_config', 'Locale must be explicitly resolved from Format, workspace, or user metadata');
  }
  return { ...locale };
}

function resolvedTimeZone(options: FormatRenderOptions): ResolvedFormatMetadata {
  const timeZone = options.timeZone;
  if (!timeZone || !['format', 'workspace', 'user'].includes(timeZone.source)
    || typeof timeZone.value !== 'string') {
    throw renderError('invalid_config', 'Timezone must be explicitly resolved from Format, workspace, or user metadata');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZone.value }).format(0);
  } catch {
    throw renderError('invalid_config', 'Timezone must be a valid IANA identifier');
  }
  return { ...timeZone };
}

function parseCalendarDate(source: string): Date {
  const [year, month, day] = calendarParts(source);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    throw renderError('invalid_value', 'Calendar date is invalid');
  }
  return date;
}

function calendarParts(source: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  if (!match) throw renderError('invalid_value', 'Calendar date is invalid');
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

function parseWallTime(source: string): Date {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/.exec(source);
  if (!match) throw renderError('invalid_value', 'Wall-clock time is invalid');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw renderError('invalid_value', 'Wall-clock time is invalid');
  return new Date(Date.UTC(2000, 0, 1, hour, minute, second,
    Number((match[4] ?? '').padEnd(3, '0').slice(0, 3))));
}

function parseInstant(source: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(source)) {
    throw renderError('invalid_value', 'Instant requires an explicit offset');
  }
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) throw renderError('invalid_value', 'Instant is invalid');
  return date;
}

function dateInZone(date: Date, locale: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

function safeCssColor(value: string): boolean {
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return true;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(value);
  if (rgb) return rgb.slice(1, 4).every((part) => Number(part) <= 255)
    && (rgb[4] === undefined || Number(rgb[4]) <= 1);
  const hsl = /^hsla?\(\s*-?\d+(?:\.\d+)?(?:deg)?\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(value);
  return Boolean(hsl && Number(hsl[1]) <= 100 && Number(hsl[2]) <= 100
    && (hsl[3] === undefined || Number(hsl[3]) <= 1));
}

function truncateText(value: string, maximum: number): string {
  const characters = Array.from(value);
  return characters.length > maximum ? `${characters.slice(0, maximum - 1).join('')}…` : value;
}

function hasControl(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]!);
}

function renderError(code: FormatDiagnostic['code'], message: string): Error {
  return Object.assign(new Error(message), { formatDiagnosticCode: code });
}

function diagnosticFor(cause: unknown): FormatDiagnostic {
  if (cause instanceof Error && 'formatDiagnosticCode' in cause) {
    return {
      code: (cause as Error & { formatDiagnosticCode: FormatDiagnostic['code'] }).formatDiagnosticCode,
      message: cause.message
    };
  }
  return { code: 'renderer_failure', message: 'Format renderer failed safely' };
}
