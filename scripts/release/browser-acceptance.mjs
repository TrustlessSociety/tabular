//node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const origin = requiredOrigin(process.env.TABULAR_ACCEPTANCE_ORIGIN);
const username = requiredCredential(
  process.env.TABULAR_ACCEPTANCE_USERNAME,
  'TABULAR_ACCEPTANCE_USERNAME'
);
const password = requiredCredential(
  process.env.TABULAR_ACCEPTANCE_PASSWORD,
  'TABULAR_ACCEPTANCE_PASSWORD'
);
delete process.env.TABULAR_ACCEPTANCE_PASSWORD;
let browserDiagnostic = '';

async function main() {
const chromeExecutable = await resolveChromeExecutable(
  process.env.TABULAR_BROWSER_EXECUTABLE
);
const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tabular-browser-'));
const browser = spawn(chromeExecutable, [
  '--headless=new',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-default-browser-check',
  '--no-first-run',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileRoot}`,
  'about:blank'
], {
  stdio: ['ignore', 'ignore', 'pipe']
});
browser.stderr.on('data', (chunk) => {
  browserDiagnostic = bounded(browserDiagnostic, String(chunk));
});

let connection;
try {
  const port = await devtoolsPort(profileRoot, browser);
  const version = await json(`http://127.0.0.1:${port}/json/version`);
  assert.equal(typeof version.webSocketDebuggerUrl, 'string');
  connection = await CdpConnection.connect(version.webSocketDebuggerUrl);
  const results = [];

  // Each context starts with a fresh cookie jar and reaches the ordinary origin.
  const desktop = await BrowserPage.create(connection, { width: 1280, height: 800 });
  results.push(await visibleSignIn(desktop, username, password));
  results.push(await explorerJourney(desktop));
  results.push(await unknownTargetsFailClosed(desktop));

  // A second independent sign-in proves acceptance does not reuse an injected session.
  const second = await BrowserPage.create(connection, { width: 1280, height: 800 });
  results.push(await visibleSignIn(second, username, password, 'second-session'));
  results.push(await secondSessionJourney(second));
  results.push(await twoSessionLiveSync(desktop, second));
  results.push(await rotateOneBrowserSession(desktop, second));
  results.push(await activityJourney(desktop));

  // The narrow context repeats the public entry and product navigation from signed out.
  const narrow = await BrowserPage.create(connection, { width: 390, height: 844 });
  results.push(await visibleSignIn(narrow, username, password, 'narrow-session'));
  results.push(await narrowJourney(narrow));
  results.push(await visibleLogout(narrow));
  await desktop.waitForSelector('a[href="/auth/account"]');
  await second.waitForSelector('a[href="/auth/account"]');
  results.push('sessions:logout-revokes-only-current-cookie-jar');

  for (const page of [desktop, second, narrow]) {
    assert.deepEqual(page.unexpectedSignals(), [], 'Browser emitted unexpected failures');
    await page.close();
  }

  process.stdout.write(`${JSON.stringify({
    result: 'passed',
    browser: String(version.Browser || 'Chromium'),
    origin,
    freshContexts: 3,
    sessionInjection: false,
    directServiceCalls: false,
    steps: results
  }, null, 2)}\n`);
} finally {
  await connection?.close().catch(() => undefined);
  browser.kill('SIGTERM');
  await waitForExit(browser).catch(() => browser.kill('SIGKILL'));
  await fs.rm(profileRoot, { recursive: true, force: true });
}
}

/** Signs in through the visible PostgreSQL form from a clean browser context. */
async function visibleSignIn(page, role, submittedPassword, label = 'desktop-session') {
  await page.navigate(origin);
  await page.waitForSelector('#postgres-login-form');
  assert.match(await page.url(), /\/auth\/login(?:[?#]|$)/);
  await page.fill('#postgres-role', role);
  await page.fill('#postgres-password', submittedPassword);
  submittedPassword = '';
  await page.click('#postgres-login-submit');
  try {
    await page.waitForUrl((url) => url.origin === origin && url.pathname === '/');
  } catch {
    throw new Error(`Visible sign-in did not navigate: ${JSON.stringify(await page.loginDiagnostic())}`);
  }
  try {
    await page.waitForSelector('a[href="/auth/account"]');
  } catch {
    throw new Error(`Signed-in shell did not render: ${JSON.stringify(await page.surfaceDiagnostic())}`);
  }
  assert.equal(
    await page.textIncludes(documentBody, 'Acme Inc.'),
    false,
    'The signed-in product shell still contains the fabricated connection label'
  );
  return `${label}:visible-postgresql-login`;
}

/** Exercises normal visible Explorer and table navigation against seeded PostgreSQL data. */
async function explorerJourney(page) {
  await page.waitForSelector('[aria-label="File explorer"]');
  await page.clickByText('a.explorer-item', 'Operations');
  await page.waitForUrl((url) => url.pathname === '/pages/browse.html'
    && url.searchParams.get('folder') === 'operations');
  await page.waitForSelector('a[href="/pages/table.html?folder=operations&table=customer-orders"]');
  await page.click('a[href="/pages/table.html?folder=operations&table=customer-orders"]');
  await page.waitForUrl((url) => url.pathname === '/pages/table.html');
  await page.waitForSelector('.workbench-shell');
  await page.waitForSelector('.grid-stage[data-grid-ready="true"]');
  return 'desktop:explorer-to-live-postgresql-grid';
}

/** Proves guessed route and file identities do not become product or review pages. */
async function unknownTargetsFailClosed(page) {
  const route = await page.navigate(`${origin}/not-a-tabular-route`);
  assert.equal(route.status, 404);
  const file = await page.navigate(
    `${origin}/pages/table.html?folder=operations&table=unknown-file`
  );
  assert.equal(file.status, 404);
  await page.navigate(origin);
  await page.waitForSelector('[aria-label="File explorer"]');
  return 'desktop:unknown-route-and-file-404';
}

/** Confirms a separately authenticated context reaches the same normal product entry. */
async function secondSessionJourney(page) {
  await page.waitForSelector('[aria-label="File explorer"]');
  await page.clickByText('a.explorer-item', 'Finance');
  await page.waitForUrl((url) => url.searchParams.get('folder') === 'finance');
  await page.waitForSelector('[role="tab"][aria-selected="true"]');
  return 'second-session:independent-cookie-jar';
}

/** Proves two independently authenticated contexts remain live and receive one SSE edit. */
async function twoSessionLiveSync(first, second) {
  const editor = '.tabulator-cell.tabulator-editing input, .tabulator-cell.tabulator-editing textarea';
  await openCustomerOrders(first);
  await openCustomerOrders(second);
  const previous = await first.cellValue('ord-4001', 'Notes');
  const expected = previous === 'Two-session release sync A'
    ? 'Two-session release sync B'
    : 'Two-session release sync A';
  await first.doubleClickCell('ord-4001', 'Notes');
  await first.fill(editor, expected);
  if (await first.evaluate((selector) => Boolean(document.querySelector(selector)), editor)) {
    await first.pressEnter();
  }
  assert.equal(
    await first.cellValue('ord-4001', 'Notes'),
    expected,
    'The visible cell must contain exactly the replacement value before autosave'
  );
  await waitUntil(
    () => first.evaluate(() => (
      document.querySelector('output[aria-live="polite"]')?.textContent?.trim().startsWith('Saved')
    )),
    20_000,
    'automatic blur save'
  );
  await waitUntil(
    async () => await second.cellValue('ord-4001', 'Notes') === expected,
    20_000,
    'second browser session SSE update'
  );
  await first.waitForSelector('a[href="/auth/account"]');
  await second.waitForSelector('a[href="/auth/account"]');
  return 'two-session:visible-edit-and-live-sse-sync';
}

/** Rotates one browser cookie through the public session route without affecting its peer. */
async function rotateOneBrowserSession(first, second) {
  // Leave the grid first so rotation does not strand an intentionally revoked SSE request.
  await first.navigate(origin);
  await first.waitForSelector('[aria-label="File explorer"]');
  const proof = await first.evaluate(async () => {
    const beforeResponse = await fetch('/auth/session', { headers: { accept: 'application/json' } });
    const before = await beforeResponse.json();
    const rotateResponse = await fetch('/auth/session/rotate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tabular-csrf': before.csrfToken
      },
      body: '{}'
    });
    const rotated = await rotateResponse.json();
    const afterResponse = await fetch('/auth/session', { headers: { accept: 'application/json' } });
    const after = await afterResponse.json();
    return {
      beforeStatus: beforeResponse.status,
      rotateStatus: rotateResponse.status,
      afterStatus: afterResponse.status,
      sameIdentity: before.identity?.id === after.identity?.id,
      csrfRotated: typeof rotated.csrfToken === 'string'
        && rotated.csrfToken !== before.csrfToken,
      absolutePreserved: before.expires?.absolute === rotated.expires?.absolute
    };
  });
  assert.deepEqual(proof, {
    beforeStatus: 200,
    rotateStatus: 200,
    afterStatus: 200,
    sameIdentity: true,
    csrfRotated: true,
    absolutePreserved: true
  });
  await first.navigate(origin);
  await first.waitForSelector('a[href="/auth/account"]');
  await second.waitForSelector('a[href="/auth/account"]');
  return 'sessions:public-rotation-preserves-peer-session';
}

/** Opens the normal authenticated activity page and confirms authorized durable records render. */
async function activityJourney(page) {
  await page.click('a[href="/pages/system-activity.html"]');
  await page.waitForUrl((url) => url.pathname === '/pages/system-activity.html');
  await page.waitForSelector('.activity-shell');
  assert.ok(await page.visibleText('authorized operations'));
  assert.ok(await page.visibleText('Import values'));
  return 'desktop:authorized-system-activity';
}

/** Opens the representative table through the ordinary visible Explorer controls. */
async function openCustomerOrders(page) {
  await page.navigate(origin);
  await page.waitForSelector('[aria-label="File explorer"]');
  await page.clickByText('a.explorer-item', 'Operations');
  await page.waitForUrl((url) => url.searchParams.get('folder') === 'operations');
  await page.click('a[href="/pages/table.html?folder=operations&table=customer-orders"]');
  await page.waitForSelector('.grid-stage[data-grid-ready="true"]');
}

/** Confirms the normal narrow Explorer and import surfaces do not overflow the viewport. */
async function narrowJourney(page) {
  await page.waitForSelector('[aria-label="File explorer"]');
  await page.clickByText('a.explorer-item', 'Operations');
  await page.waitForUrl((url) => url.searchParams.get('folder') === 'operations');
  assert.ok(await page.visibleText('Import'));
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  assert.equal(widths.viewport, 390);
  assert.ok(widths.document <= widths.viewport);
  return 'narrow:390x844-folder';
}

/** Signs out with the visible account and logout forms and observes the cleared session. */
async function visibleLogout(page) {
  await page.click('a[href="/auth/account"]');
  await page.waitForSelector('#signed-in-identity');
  await page.waitForSelector('#logout-form');
  await page.click('#logout-submit');
  await page.waitForSelector('#postgres-login-form');
  assert.match(await page.url(), /\/auth\/login(?:[?#]|$)/);
  return 'narrow:visible-server-revoked-logout';
}

/** Holds one isolated Chromium context and its attached DevTools session. */
class BrowserPage {
  constructor(connection, contextId, targetId, sessionId, viewport) {
    this.connection = connection;
    this.contextId = contextId;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.viewport = viewport;
    this.responses = [];
    this.requests = [];
    this.signals = [];
    connection.on('Network.requestWillBeSent', sessionId, ({ request, type }) => {
      if (type === 'Document') {
        this.requests.push({
          url: request.url,
          method: request.method,
          origin: request.headers?.Origin || request.headers?.origin || null,
          referer: request.headers?.Referer || request.headers?.referer || null
        });
      }
    });
    connection.on('Network.responseReceived', sessionId, ({ response, type }) => {
      if (type === 'Document') {
        this.responses.push({ url: response.url, status: response.status });
      } else if (response.status >= 400) {
        this.signals.push(`response:${response.status}:${response.url}`);
      }
    });
    connection.on('Runtime.exceptionThrown', sessionId, ({ exceptionDetails }) => {
      this.signals.push(`exception:${exceptionDetails.text || 'unknown browser error'}`);
    });
    connection.on('Log.entryAdded', sessionId, ({ entry }) => {
      if (entry.level === 'error' || entry.level === 'warning') {
        this.signals.push(`console:${entry.level}:${entry.text}`);
      }
    });
  }

  /** Creates a fresh browser context without importing or injecting session state. */
  static async create(connection, viewport) {
    const { browserContextId } = await connection.send('Target.createBrowserContext');
    const { targetId } = await connection.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId
    });
    const { sessionId } = await connection.send('Target.attachToTarget', {
      targetId,
      flatten: true
    });
    const page = new BrowserPage(
      connection,
      browserContextId,
      targetId,
      sessionId,
      viewport
    );
    await Promise.all([
      page.send('Page.enable'),
      page.send('Runtime.enable'),
      page.send('Network.enable'),
      page.send('Log.enable'),
      page.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width <= 390
      })
    ]);
    return page;
  }

  /** Sends one command through this page's attached target session. */
  send(method, params = {}) {
    return this.connection.send(method, params, this.sessionId);
  }

  /** Navigates through the browser and returns the observed top-level status. */
  async navigate(url) {
    const responseStart = this.responses.length;
    const result = await this.send('Page.navigate', { url });
    if (result.errorText) throw new Error(`Browser navigation failed: ${result.errorText}`);
    await this.waitForReadyState();
    const finalUrl = await this.url();
    const response = this.responses.slice(responseStart).reverse()
      .find((candidate) => candidate.url === finalUrl);
    return { url: finalUrl, status: response?.status || 0 };
  }

  /** Returns the current top-level document URL. */
  url() {
    return this.evaluate(() => window.location.href);
  }

  /** Waits until the current document and hydration-ready selector are available. */
  async waitForReadyState() {
    await waitUntil(async () => {
      const state = await this.evaluate(() => document.readyState);
      return state === 'interactive' || state === 'complete';
    }, 15_000, 'document readiness');
  }

  /** Waits for a selector that is present and visibly rendered. */
  async waitForSelector(selector) {
    await waitUntil(
      () => this.evaluate((candidate) => {
        const element = document.querySelector(candidate);
        if (!(element instanceof HTMLElement)) return false;
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return bounds.width > 0 && bounds.height > 0
          && style.display !== 'none' && style.visibility !== 'hidden';
      }, selector),
      20_000,
      `visible selector ${selector}`
    );
  }

  /** Waits for the top-level URL to satisfy one expected public-navigation shape. */
  async waitForUrl(predicate) {
    await waitUntil(async () => predicate(new URL(await this.url())), 20_000, 'browser URL');
  }

  /** Enters text through the focused browser input using trusted DevTools input events. */
  async fill(selector, value) {
    await this.waitForSelector(selector);
    const point = await this.evaluate((candidate) => {
      const element = document.querySelector(candidate);
      if (!(element instanceof HTMLElement)) throw new Error('Browser input is unavailable');
      const bounds = element.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    }, selector);
    await this.mouseMultiClick(point, 3);
    await this.send('Input.insertText', { text: value });
  }

  /** Activates one visible browser control with a trusted DevTools mouse gesture. */
  async click(selector) {
    await this.waitForSelector(selector);
    const point = await this.evaluate((candidate) => {
      const element = document.querySelector(candidate);
      if (!(element instanceof HTMLElement)) throw new Error('Browser control is unavailable');
      const bounds = element.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    }, selector);
    await this.mouseClick(point);
  }

  /** Activates one visible control with exact normalized text. */
  async clickByText(selector, text) {
    const point = await waitUntil(
      () => this.evaluate((candidate, expected) => {
        const element = [...document.querySelectorAll(candidate)].find((entry) =>
          entry.textContent?.replace(/\s+/g, ' ').trim().startsWith(expected)
        );
        if (!(element instanceof HTMLElement)) return false;
        const bounds = element.getBoundingClientRect();
        return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      }, selector, text),
      20_000,
      `visible ${text} control`
    );
    await this.mouseClick(point);
  }

  /** Double-clicks a visible data cell identified by its row token and column label. */
  async doubleClickCell(rowText, columnText) {
    const point = await waitUntil(
      () => this.evaluate((expectedRow, expectedColumn) => {
        const header = [...document.querySelectorAll('.tabulator-col[tabulator-field]')]
          .find((entry) => entry.textContent?.replace(/\s+/g, ' ').includes(expectedColumn));
        const field = header?.getAttribute('tabulator-field');
        const row = [...document.querySelectorAll('.tabulator-row')]
          .find((entry) => entry.textContent?.includes(expectedRow));
        const cell = field ? row?.querySelector(`[tabulator-field="${field}"]`) : undefined;
        if (!(cell instanceof HTMLElement)) return false;
        const bounds = cell.getBoundingClientRect();
        return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      }, rowText, columnText),
      20_000,
      `visible ${rowText} ${columnText} cell`
    );
    await this.mouseDoubleClick(point);
  }

  /** Reads one rendered grid value by the same visible row and column labels. */
  cellValue(rowText, columnText) {
    return this.evaluate((expectedRow, expectedColumn) => {
      const header = [...document.querySelectorAll('.tabulator-col[tabulator-field]')]
        .find((entry) => entry.textContent?.replace(/\s+/g, ' ').includes(expectedColumn));
      const field = header?.getAttribute('tabulator-field');
      const row = [...document.querySelectorAll('.tabulator-row')]
        .find((entry) => entry.textContent?.includes(expectedRow));
      const cell = field ? row?.querySelector(`[tabulator-field="${field}"]`) : undefined;
      const editor = cell?.querySelector('input, textarea');
      return editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement
        ? editor.value
        : cell?.textContent?.trim();
    }, rowText, columnText);
  }

  /** Dispatches one trusted primary-button gesture at a previously observed point. */
  async mouseClick(point) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 1,
      clickCount: 1
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 0,
      clickCount: 1
    });
  }

  /** Dispatches one trusted primary-button double-click at a previously observed point. */
  async mouseDoubleClick(point) {
    await this.mouseMultiClick(point, 2);
  }

  /** Dispatches a trusted multi-click sequence at a previously observed point. */
  async mouseMultiClick(point, count) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y
    });
    for (let clickCount = 1; clickCount <= count; clickCount += 1) {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: point.x,
        y: point.y,
        button: 'left',
        buttons: 1,
        clickCount
      });
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: point.x,
        y: point.y,
        button: 'left',
        buttons: 0,
        clickCount
      });
    }
  }

  /** Submits the focused visible form exactly as a keyboard user can. */
  async pressEnter() {
    await this.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'char',
      key: 'Enter',
      code: 'Enter',
      text: '\r',
      unmodifiedText: '\r',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13
    });
  }

  /** Reports whether the current visible document contains one text token. */
  visibleText(text) {
    return this.evaluate((expected) => document.body.innerText.includes(expected), text);
  }

  /** Reports whether a selected source contains one text token. */
  textIncludes(selector, text) {
    return this.evaluate((candidate, expected) => {
      const element = document.querySelector(candidate);
      return element?.textContent?.includes(expected) || false;
    }, selector, text);
  }

  /** Returns a credential-redacted login diagnostic for a failed browser transition. */
  async loginDiagnostic() {
    const document = await this.evaluate(() => {
      const form = document.querySelector('#postgres-login-form');
      const username = document.querySelector('#postgres-role');
      const password = document.querySelector('#postgres-password');
      return {
        url: window.location.href,
        usernameLength: username instanceof HTMLInputElement ? username.value.length : -1,
        passwordLength: password instanceof HTMLInputElement ? password.value.length : -1,
        formValid: form instanceof HTMLFormElement ? form.checkValidity() : false,
        activeId: document.activeElement?.id || '',
        errorVisible: Boolean(document.querySelector('#postgres-login-error'))
      };
    });
    return {
      document,
      requests: this.requests.slice(-6),
      responses: this.responses.slice(-6)
    };
  }

  /** Returns a bounded, credential-free document diagnostic after authentication. */
  async surfaceDiagnostic() {
    const document = await this.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 1_000),
      accountLinks: document.querySelectorAll('a[href="/auth/account"]').length
    }));
    return {
      document,
      requests: this.requests.slice(-8),
      responses: this.responses.slice(-8),
      signals: this.signals.slice(-8)
    };
  }

  /** Evaluates a small browser-side interaction and returns only cloned output. */
  async evaluate(callback, ...args) {
    const expression = `(${callback.toString()})(...${JSON.stringify(args)})`;
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || 'Browser evaluation failed');
    }
    return result.result.value;
  }

  /** Returns unexpected browser signals while ignoring the intentional 404 probes. */
  unexpectedSignals() {
    return this.signals.filter((signal) =>
      !/^response:404:/.test(signal)
      && !/Failed to load resource: the server responded with a status of 404/.test(signal)
    );
  }

  /** Closes only this disposable browser context. */
  async close() {
    await this.connection.send('Target.disposeBrowserContext', {
      browserContextId: this.contextId
    });
  }
}

/** Multiplexes DevTools commands and events without a browser automation dependency. */
class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener('message', (event) => this.receive(String(event.data)));
  }

  /** Opens the DevTools WebSocket and waits for its ordinary open event. */
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpConnection(socket);
  }

  /** Sends one protocol command and resolves its matching response. */
  send(method, params = {}, sessionId) {
    const id = ++this.sequence;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  /** Registers a bounded event listener for one attached target. */
  on(method, sessionId, listener) {
    this.listeners.push({ method, sessionId, listener });
  }

  /** Dispatches protocol replies and target events. */
  receive(body) {
    const message = JSON.parse(body);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
      return;
    }
    for (const listener of this.listeners) {
      if (listener.method === message.method && listener.sessionId === message.sessionId) {
        listener.listener(message.params || {});
      }
    }
  }

  /** Closes the protocol connection after outstanding work has completed. */
  async close() {
    this.socket.close();
  }
}

const documentBody = 'body';

/** Waits for the exact Chrome profile marker containing its loopback DevTools port. */
async function devtoolsPort(profile, child) {
  const marker = path.join(profile, 'DevToolsActivePort');
  return waitUntil(async () => {
    if (child.exitCode !== null) {
      throw new Error(`Chromium exited before startup: ${browserDiagnostic.slice(-800)}`);
    }
    const body = await fs.readFile(marker, 'utf8').catch(() => '');
    const port = Number(body.split(/\r?\n/)[0]);
    return Number.isInteger(port) && port > 0 ? port : undefined;
  }, 15_000, 'Chromium DevTools port');
}

/** Resolves only an explicit executable or a known local Chromium installation. */
async function resolveChromeExecutable(explicit) {
  const candidates = [
    explicit,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch(() => undefined);
    if (stat?.isFile()) return candidate;
  }
  throw new Error('A Chromium executable is required for fresh browser acceptance');
}

/** Loads one local DevTools response and rejects non-success status. */
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
  assert.equal(response.status, 200);
  return response.json();
}

/** Polls one bounded condition without trusting retained acceptance artifacts. */
async function waitUntil(operation, timeout, label) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

/** Waits briefly for a child process to honor SIGTERM. */
function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('Chromium shutdown timed out')),
      5_000
    ))
  ]);
}

/** Validates the ordinary loopback or configured HTTP(S) application origin. */
function requiredOrigin(value) {
  if (!value) throw new Error('TABULAR_ACCEPTANCE_ORIGIN is required');
  const parsed = new URL(value);
  if (parsed.origin !== value || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('TABULAR_ACCEPTANCE_ORIGIN must be an exact HTTP(S) origin');
  }
  return parsed.origin;
}

/** Reads one transient browser credential without including it in output. */
function requiredCredential(value, name) {
  if (!value || /[\u0000-\u001f\u007f]/.test(value) || value.length > 1_024) {
    throw new Error(`${name} is required and must be bounded`);
  }
  return value;
}

/** Bounds a Chromium diagnostic without serializing browser form values. */
function bounded(current, chunk) {
  return `${current}${chunk}`.slice(-8_000);
}

await main();
