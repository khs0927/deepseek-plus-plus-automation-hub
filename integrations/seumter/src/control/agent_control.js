const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const DEFAULT_CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const SEUMTER_URL_PATTERN = /https?:\/\/([^\/]*\.)?eais\.go\.kr(?:\/|$)|https?:\/\/www\.eais\.go\.kr(?:\/|$)/i;
const ALLOWED_CDP_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const sessionCache = new Map();

function normalizeCdpUrl(value = DEFAULT_CDP_URL) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !ALLOWED_CDP_HOSTS.has(url.hostname)) {
    throw new Error('CDP_URL must use http on localhost, 127.0.0.1, or ::1');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function isSeumterUrl(value) {
  try {
    return SEUMTER_URL_PATTERN.test(new URL(value).toString());
  } catch {
    return false;
  }
}

async function publicPageSummary(page) {
  return {
    title: typeof page.title === 'function' ? await page.title() : '',
    url: typeof page.url === 'function' ? page.url() : '',
    closed: typeof page.isClosed === 'function' ? page.isClosed() : false,
  };
}

function selectSeumterPage(pages) {
  return pages.find(page => {
    if (typeof page.isClosed === 'function' && page.isClosed()) return false;
    return isSeumterUrl(typeof page.url === 'function' ? page.url() : '');
  }) || null;
}

function probeCdp(endpoint = DEFAULT_CDP_URL) {
  const normalized = normalizeCdpUrl(endpoint);
  return new Promise(resolve => {
    const request = http.get(`${normalized}/json/version`, { timeout: 1500 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          resolve({ ready: false, endpoint: normalized, error: `HTTP ${response.statusCode}` });
          return;
        }
        try {
          const info = JSON.parse(body);
          resolve({
            ready: true,
            endpoint: normalized,
            browser: typeof info.Browser === 'string' ? info.Browser : null,
            protocolVersion: typeof info['Protocol-Version'] === 'string' ? info['Protocol-Version'] : null,
          });
        } catch (error) {
          resolve({ ready: false, endpoint: normalized, error: `Invalid CDP response: ${error.message}` });
        }
      });
    });
    request.on('timeout', () => {
      request.destroy();
      resolve({ ready: false, endpoint: normalized, error: 'TIMEOUT' });
    });
    request.on('error', error => {
      resolve({ ready: false, endpoint: normalized, error: error.code || error.message });
    });
  });
}

async function openCdpSession({ endpoint = DEFAULT_CDP_URL } = {}) {
  const normalized = normalizeCdpUrl(endpoint);
  const cached = sessionCache.get(normalized);
  if (cached && typeof cached.browser.isConnected === 'function' && cached.browser.isConnected()) {
    return cached;
  }

  const browser = await chromium.connectOverCDP(normalized, { timeout: 10000 });
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('Connected Edge browser has no persistent context');
  }
  const session = { browser, context, endpoint: normalized };
  sessionCache.set(normalized, session);
  return session;
}

async function openSeumterSession({ endpoint = DEFAULT_CDP_URL, createIfMissing = false, focus = false } = {}) {
  const base = await openCdpSession({ endpoint });
  let page = selectSeumterPage(base.context.pages());
  if (!page && createIfMissing) {
    page = await base.context.newPage();
    await page.goto('https://www.eais.go.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  if (!page) {
    throw new Error('No open EAIS/Seumter tab was found in the CDP Edge profile');
  }
  if (focus) await page.bringToFront().catch(() => {});
  return { ...base, page };
}

async function closeSeumterSession() {
  // Do not call browser.close() here. On Chromium CDP it terminates the user's
  // dedicated Edge process. The owning CLI/server process ends its own transport.
}

async function inspectPage(page, { maxElements = 120, maxTextLength = 6000 } = {}) {
  const safeMaxElements = Math.min(Math.max(Number(maxElements) || 120, 1), 300);
  const safeMaxTextLength = Math.min(Math.max(Number(maxTextLength) || 6000, 200), 20000);
  const url = page.url();
  const title = await page.title();
  const state = await page.evaluate(({ elementLimit, textLimit }) => {
    const text = document.body ? document.body.innerText : '';
    const compact = value => (value || '').replace(/\s+/g, ' ').trim();
    const visible = element => Boolean(element.offsetParent || element.getClientRects().length);
    const cssEscape = value => window.CSS && window.CSS.escape ? window.CSS.escape(value) : String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
    const sessionRep = window.$p && typeof window.$p.getComponentById === 'function'
      ? window.$p.getComponentById('ds_SessionRep')
      : null;
    const elements = Array.from(document.querySelectorAll(
      'a,button,input:not([type="hidden"]),textarea,select,[role="button"],[role="tab"],[role="link"]'
    )).filter(visible).slice(0, elementLimit).map((element, index) => {
      const id = element.id || '';
      const label = compact(element.getAttribute('aria-label') || element.innerText || element.value || element.getAttribute('title'));
      return {
        ref: `e${index + 1}`,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || null,
        type: element.getAttribute('type') || null,
        text: label.slice(0, 160),
        id: id || null,
        name: element.getAttribute('name') || null,
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        selectorHint: id ? `#${cssEscape(id)}` : null,
      };
    });
    const loginRequired = /로그인/.test(text) && !/로그아웃/.test(text);
    const loggedOut = /로그아웃/.test(text);
    return {
      hasWebSquare: typeof window.$p !== 'undefined',
      sessionRepPresent: Boolean(sessionRep),
      loginState: loggedOut ? 'authenticated' : (loginRequired ? 'login_required' : 'unknown'),
      bodyLength: text.length,
      bodyPreview: text.slice(0, textLimit),
      elements,
    };
  }, { elementLimit: safeMaxElements, textLimit: safeMaxTextLength });

  return { title, url, isSeumter: isSeumterUrl(url), ...state };
}

async function getStatus({ endpoint = DEFAULT_CDP_URL } = {}) {
  const cdp = await probeCdp(endpoint);
  if (!cdp.ready) return { status: 'cdp_offline', cdp, seumterPageFound: false };
  let session;
  try {
    session = await openSeumterSession({ endpoint });
    const inspected = await inspectPage(session.page, { maxElements: 30, maxTextLength: 1000 });
    return {
      status: 'connected',
      cdp,
      seumterPageFound: true,
      page: { title: inspected.title, url: inspected.url },
      loginState: inspected.loginState,
      hasWebSquare: inspected.hasWebSquare,
      sessionRepPresent: inspected.sessionRepPresent,
    };
  } catch (error) {
    return { status: 'connected_without_seumter_page', cdp, seumterPageFound: false, error: error.message };
  } finally {
    await closeSeumterSession(session);
  }
}

async function listTabs({ endpoint = DEFAULT_CDP_URL } = {}) {
  const cdp = await probeCdp(endpoint);
  if (!cdp.ready) return { status: 'cdp_offline', cdp, tabs: [] };
  const session = await openCdpSession({ endpoint });
  const pages = session.context.pages();
  const tabs = await Promise.all(pages.map(async page => {
    const summary = await publicPageSummary(page);
    return { ...summary, isSeumter: isSeumterUrl(summary.url) };
  }));
  return { status: 'connected', cdp, tabs };
}

function validateTarget({ selector, text }) {
  const hasSelector = typeof selector === 'string' && selector.trim().length > 0;
  const hasText = typeof text === 'string' && text.trim().length > 0;
  if (hasSelector === hasText) throw new Error('Provide exactly one of selector or text');
  if ((selector && selector.length > 500) || (text && text.length > 300)) throw new Error('Target is too long');
}

async function clickTarget({ selector, text, confirm = false }, options = {}) {
  if (confirm !== true) throw new Error('Write action requires confirm: true');
  validateTarget({ selector, text });
  let session;
  try {
    session = await openSeumterSession({ ...options, focus: true });
    if (selector) {
      await session.page.locator(selector).first().click({ timeout: 7000 });
    } else {
      const clicked = await session.page.evaluate(targetText => {
        const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
        const elements = Array.from(document.querySelectorAll('a,button,[role="button"],[role="tab"],[role="link"],input[type="button"]'))
          .filter(element => (element.offsetParent || element.getClientRects().length) && !element.disabled);
        const target = elements.find(element => normalize(element.innerText || element.value || element.getAttribute('aria-label')) === targetText);
        if (!target) return false;
        target.click();
        return true;
      }, text.trim());
      if (!clicked) throw new Error(`No visible clickable element matched text: ${text.trim()}`);
    }
    return { status: 'clicked', target: selector ? { selector } : { text: text.trim() }, url: session.page.url() };
  } finally {
    await closeSeumterSession(session);
  }
}

async function fillTarget({ selector, value, confirm = false }, options = {}) {
  if (confirm !== true) throw new Error('Write action requires confirm: true');
  if (typeof selector !== 'string' || !selector.trim()) throw new Error('selector is required');
  if (typeof value !== 'string') throw new Error('value must be a string');
  if (selector.length > 500 || value.length > 20000) throw new Error('selector or value is too long');
  let session;
  try {
    session = await openSeumterSession({ ...options, focus: true });
    try {
      await session.page.locator(selector).first().fill(value, { timeout: 5000 });
    } catch (error) {
      const componentId = selector.replace(/^#/, '');
      const componentFilled = await session.page.evaluate(({ id, nextValue }) => {
        const component = window.$p && typeof window.$p.getComponentById === 'function'
          ? window.$p.getComponentById(id)
          : null;
        if (!component || typeof component.setValue !== 'function') return false;
        component.setValue(String(nextValue));
        return true;
      }, { id: componentId, nextValue: value });
      if (!componentFilled) throw error;
    }
    return { status: 'filled', selector, valueLength: value.length, url: session.page.url() };
  } finally {
    await closeSeumterSession(session);
  }
}

function safeScreenshotPath(filename, scratchDirectory) {
  const requested = typeof filename === 'string' && filename.trim() ? filename.trim() : `seumter_${Date.now()}.png`;
  const base = path.basename(requested);
  if (requested !== base || base === '.' || base === '..') throw new Error('Screenshot path escapes the scratch directory');
  if (!base.toLowerCase().endsWith('.png')) throw new Error('Screenshot filename must end in .png');
  const target = path.resolve(scratchDirectory, base);
  const root = path.resolve(scratchDirectory);
  if (path.dirname(target) !== root) throw new Error('Screenshot path escapes the scratch directory');
  return target;
}

async function takeScreenshot({ filename, confirm = false } = {}, options = {}) {
  if (confirm !== true) throw new Error('Screenshot capture requires confirm: true');
  let session;
  try {
    session = await openSeumterSession({ ...options, focus: false });
    const scratchDirectory = path.resolve(__dirname, '../../scratch');
    fs.mkdirSync(scratchDirectory, { recursive: true });
    const filePath = safeScreenshotPath(filename, scratchDirectory);
    await session.page.screenshot({ path: filePath, fullPage: false });
    return { status: 'saved', filePath };
  } finally {
    await closeSeumterSession(session);
  }
}

module.exports = {
  DEFAULT_CDP_URL,
  clickTarget,
  closeSeumterSession,
  fillTarget,
  getStatus,
  inspectPage,
  isSeumterUrl,
  listTabs,
  normalizeCdpUrl,
  openCdpSession,
  openSeumterSession,
  probeCdp,
  safeScreenshotPath,
  selectSeumterPage,
  takeScreenshot,
  validateTarget,
};
