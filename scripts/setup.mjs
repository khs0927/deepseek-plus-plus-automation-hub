#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const minimumNode = [18, 17];
const browsers = new Set(['chrome', 'edge', 'firefox', 'chromium', 'all']);

function parseArgs(argv) {
  const args = {
    command: 'install',
    browser: 'all',
    chromeExtensionId: null,
    edgeExtensionId: null,
    chromiumExtensionId: null,
    skipDependencies: false,
    skipBuild: false,
    skipShell: false,
    skipOfficecli: false,
  };
  const tokens = [...argv];
  if (tokens[0] === 'status') args.command = tokens.shift();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--browser') args.browser = requiredValue(tokens, ++index, token).toLowerCase();
    else if (token === '--extension-id') {
      const value = requiredValue(tokens, ++index, token);
      args.chromeExtensionId ??= value;
      args.edgeExtensionId ??= value;
      args.chromiumExtensionId ??= value;
    } else if (token === '--chrome-extension-id') args.chromeExtensionId = requiredValue(tokens, ++index, token);
    else if (token === '--edge-extension-id') args.edgeExtensionId = requiredValue(tokens, ++index, token);
    else if (token === '--chromium-extension-id') args.chromiumExtensionId = requiredValue(tokens, ++index, token);
    else if (token === '--skip-dependencies') args.skipDependencies = true;
    else if (token === '--skip-build') args.skipBuild = true;
    else if (token === '--skip-shell') args.skipShell = true;
    else if (token === '--skip-officecli') args.skipOfficecli = true;
    else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown option: ${token}`);
  }
  if (!browsers.has(args.browser)) throw new Error(`Unsupported browser: ${args.browser}`);
  return args;
}

function requiredValue(tokens, index, option) {
  const value = tokens[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

function printHelp() {
  console.log(`DeepSeek++ cross-platform setup

Usage:
  npm run setup -- [options]
  npm run setup:status -- --browser chrome

Options:
  --browser <name>             all, chrome, edge, chromium, or firefox (default: all)
  --extension-id <id>          Use the same local extension id for Chromium browsers
  --chrome-extension-id <id>   Install Chrome Native Host for this extension id
  --edge-extension-id <id>     Install Edge Native Host for this extension id
  --chromium-extension-id <id> Install Chromium Native Host for this extension id
  --skip-dependencies          Do not run npm ci
  --skip-build                 Do not build the extension
  --skip-shell                 Do not install the Shell Native Host
  --skip-officecli             Do not install the optional OfficeCLI binary
`);
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < minimumNode[0] || (major === minimumNode[0] && minor < minimumNode[1])) {
    throw new Error(`Node.js ${minimumNode.join('.')} or newer is required; found ${process.versions.node}.`);
  }
}

function npmCommand() {
  return platform() === 'win32' ? 'npm.cmd' : 'npm';
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status ?? 'unknown'}.`);
}

function buildArgs(browser) {
  if (browser === 'firefox') return ['run', 'build:firefox'];
  if (browser === 'edge') return ['run', 'build:edge'];
  return ['run', 'build:chrome'];
}

function buildOutput(browser) {
  if (browser === 'firefox') return 'dist/firefox-mv3';
  if (browser === 'edge') return 'dist/edge-mv3';
  return 'dist/chrome-mv3';
}

function installShell(browser, extensionId, skipOfficecli) {
  const extra = skipOfficecli ? ['--skip-officecli'] : [];
  if (browser === 'firefox') {
    run(process.execPath, ['scripts/install-shell-host.mjs', 'install', '--browser', 'firefox', ...extra]);
    return true;
  }
  if (!extensionId) {
    console.log(`Native Host for ${browser} is pending: load ${buildOutput(browser)} first, then rerun with --${browser}-extension-id <id>.`);
    return false;
  }
  run(process.execPath, ['scripts/install-shell-host.mjs', 'install', '--browser', browser, '--extension-id', extensionId, ...extra]);
  return true;
}

function install(args) {
  assertNodeVersion();
  const npm = npmCommand();
  if (!args.skipDependencies && !existsSync(resolve(root, 'node_modules'))) run(npm, ['ci']);
  const selected = args.browser === 'all' ? ['chrome', 'edge', 'firefox'] : [args.browser];
  if (!args.skipBuild) for (const browser of selected) run(npm, buildArgs(browser));
  const installed = [];
  if (!args.skipShell) {
    for (const browser of selected) {
      const id = browser === 'chrome'
        ? args.chromeExtensionId
        : browser === 'edge'
          ? args.edgeExtensionId
          : browser === 'chromium'
            ? args.chromiumExtensionId
            : null;
      if (installShell(browser, id, args.skipOfficecli)) installed.push(browser);
    }
  }
  console.log('\nDeepSeek++ setup completed.');
  for (const browser of selected) console.log(`  ${browser}: load ${buildOutput(browser)} as an unpacked extension.`);
  for (const browser of installed) console.log(`  ${browser}: Shell Native Host installed; restart the browser.`);
  console.log('  Login, API keys, and MCP credentials remain user-managed.');
}

function status(args) {
  assertNodeVersion();
  const selected = args.browser === 'all' ? ['chrome', 'edge', 'firefox'] : [args.browser];
  for (const browser of selected) run(process.execPath, ['scripts/install-shell-host.mjs', 'status', '--browser', browser]);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'status') status(args);
  else install(args);
} catch (error) {
  console.error(`\nSetup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
