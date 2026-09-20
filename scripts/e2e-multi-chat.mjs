#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = {
    browser: 'chrome',
    extensionPath: null,
    profileDir: null,
    chatUrls: [],
    keepOpen: false,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--browser') args.browser = required(argv, ++index, token).toLowerCase();
    else if (token === '--extension-path') args.extensionPath = required(argv, ++index, token);
    else if (token === '--profile-dir') args.profileDir = required(argv, ++index, token);
    else if (token === '--chat-url') args.chatUrls.push(required(argv, ++index, token));
    else if (token === '--keep-open') args.keepOpen = true;
    else if (token === '--timeout-ms') args.timeoutMs = Number(required(argv, ++index, token));
    else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown option: ${token}`);
  }
  if (!['chrome', 'edge'].includes(args.browser)) {
    throw new Error('This harness currently runs Chromium MV3 builds. Firefox uses the same manual scenario, but Playwright add-on loading is intentionally not guessed.');
  }
  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs < 1_000) throw new Error('--timeout-ms must be at least 1000.');
  return args;
}

function required(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

function printHelp() {
  console.log(`DeepSeek++ real-browser multi-chat smoke harness

Usage:
  npm run e2e:browser -- --browser chrome --chat-url https://chat.deepseek.com/
  npm run e2e:browser -- --browser edge --chat-url <conversation-a> --chat-url <conversation-b>

Options:
  --browser <chrome|edge>       Chromium browser channel (default: chrome)
  --extension-path <directory>  Unpacked build (default: dist/<browser>-mv3)
  --profile-dir <directory>     Persistent browser profile directory
  --chat-url <url>              Open one real DeepSeek tab; repeat for multiple conversations
  --keep-open                   Leave the browser open after assertions
  --timeout-ms <number>         Navigation/assertion timeout (default: 30000)

The harness never logs in, reads credentials, or sends a user message. Open a
logged-in profile yourself when testing project memory and real MCP calls.
`);
}

function defaultExtensionPath(browser) {
  return resolve(`dist/${browser}-mv3`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const extensionPath = resolve(args.extensionPath ?? defaultExtensionPath(args.browser));
  if (!existsSync(resolve(extensionPath, 'manifest.json'))) {
    throw new Error(`Built extension manifest not found: ${resolve(extensionPath, 'manifest.json')}. Run npm run build:${args.browser}.`);
  }
  const profileDir = resolve(args.profileDir ?? `.tmp-deepseek-e2e/${args.browser}`);
  mkdirSync(profileDir, { recursive: true });
  const channel = args.browser === 'edge' ? 'msedge' : 'chrome';
  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  let failed = false;
  try {
    const worker = context.serviceWorkers()[0]
      ?? await context.waitForEvent('serviceworker', { timeout: args.timeoutMs });
    const workerUrl = new URL(worker.url());
    // Node's URL implementation reports `null` for chrome-extension:// and
    // edge-extension:// origins. Preserve the extension scheme and host.
    const extensionOrigin = `${workerUrl.protocol}//${workerUrl.host}`;
    console.log(`Extension worker ready: ${worker.url()}`);

    const panel = await context.newPage();
    await panel.goto(`${extensionOrigin}/sidepanel.html`, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
    await panel.waitForTimeout(500);
    const panelText = await panel.locator('body').innerText();
    if (!/Projects|项目/i.test(panelText)) {
      throw new Error('Sidepanel did not render the Projects entry point.');
    }
    console.log('Extension sidepanel rendered.');

    const urls = args.chatUrls.length > 0 ? args.chatUrls : ['https://chat.deepseek.com/'];
    const pages = [];
    for (const url of urls) {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
      pages.push(page);
      console.log(`Chat tab opened: ${url}`);
    }
    if (pages.length > 1) {
      console.log(`Multi-chat isolation fixture ready: ${pages.length} independent DeepSeek tabs.`);
    }
    console.log('Manual next step: in tab A create/assign a project and record a decision; in tab B verify project knowledge provenance, then run independent MCP reads and a same-file write conflict check.');
    if (!args.keepOpen) await context.close();
  } catch (error) {
    failed = true;
    await context.close();
    throw error;
  } finally {
    if (failed) console.error(`Browser E2E failed. Persistent profile kept at ${profileDir}`);
  }
}

main().catch(error => {
  console.error(`\nBrowser E2E failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
