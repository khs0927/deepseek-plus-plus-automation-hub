#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(rootDir, 'dist/edge-mv3');
// --ci writes only to ignored dist/ so source packaging keeps a clean git
// working tree. Normal user-facing package:custom keeps the historical path.
const ciMode = process.argv.includes('--ci');
const canonicalDir = resolve(rootDir, 'integrations/deepseek-pp-custom/extension');
const targetDir = ciMode ? resolve(rootDir, 'dist/deepseek-pp-custom') : canonicalDir;
const initializerPath = resolve(rootDir, 'integrations/deepseek-pp-custom/custom-default-initializer.js');
const customDefaultsPath = resolve(canonicalDir, 'defaults.json');
const targetManifestPath = resolve(targetDir, 'manifest.json');
const sourceManifestPath = resolve(canonicalDir, 'manifest.json');
const verifyOnly = process.argv.includes('--verify');

if (!existsSync(sourceDir)) {
  throw new Error('dist/edge-mv3 is missing; run npm run build:edge first.');
}
if (!existsSync(initializerPath)) {
  throw new Error(`Custom initializer is missing: ${initializerPath}`);
}

const sourceManifest = readJson(resolve(sourceDir, 'manifest.json'));
const previousManifest = existsSync(sourceManifestPath)
  ? readJson(sourceManifestPath)
  : null;
const defaults = existsSync(customDefaultsPath)
  ? readFileSync(customDefaultsPath)
  : null;
const initializer = readFileSync(initializerPath, 'utf8').trim();
const customIdentity = {
  name: previousManifest?.name ?? 'DeepSeek++ Custom (딥식++ 커스텀)',
  description: previousManifest?.description
    ?? 'DeepSeek++ Custom: All-in-One AI Agent Workspace with Pre-loaded MCPs, Skills, Watchdog & Concurrency Fixes',
  key: previousManifest?.key,
};

if (verifyOnly) {
  verifyPackage(sourceManifest, customIdentity, defaults, initializer);
  console.log('Custom extension package is synchronized with dist/edge-mv3.');
} else {
  if (!defaults) {
    throw new Error(`Custom extension defaults.json is missing: ${customDefaultsPath}`);
  }
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });

  const manifest = {
    ...sourceManifest,
    ...customIdentity,
    version: sourceManifest.version,
  };
  if (!manifest.key) delete manifest.key;
  writeJson(resolve(targetDir, 'manifest.json'), manifest);
  writeFileSync(resolve(targetDir, 'defaults.json'), defaults);

  const backgroundPath = resolve(targetDir, 'background.js');
  const background = readFileSync(backgroundPath, 'utf8').trimEnd();
  writeFileSync(backgroundPath, `${background}\n\n${initializer}\n`);
  console.log(`Packaged custom extension from ${relative(rootDir, sourceDir)}.`);
}

function verifyPackage(manifest, identity, defaultsBytes, initializerText) {
  if (!existsSync(targetDir)) throw new Error('Custom extension directory is missing.');
  const targetManifest = readJson(resolve(targetDir, 'manifest.json'));
  if (targetManifest.version !== manifest.version) {
    throw new Error(`Custom manifest version ${targetManifest.version} does not match ${manifest.version}.`);
  }
  for (const field of ['name', 'description', 'key']) {
    if ((targetManifest[field] ?? null) !== (identity[field] ?? null)) {
      throw new Error(`Custom manifest field ${field} is out of sync.`);
    }
  }
  if (!defaultsBytes || !readFile(resolve(targetDir, 'defaults.json')).equals(defaultsBytes)) {
    throw new Error('Custom defaults.json is missing or unreadable.');
  }

  const sourceFiles = collectFiles(sourceDir);
  const targetFiles = collectFiles(targetDir);
  const expectedFiles = new Set([...sourceFiles, 'defaults.json']);
  const actualFiles = new Set(targetFiles);
  for (const file of expectedFiles) {
    if (!actualFiles.has(file)) throw new Error(`Custom package is missing ${file}.`);
  }
  for (const file of actualFiles) {
    if (!expectedFiles.has(file)) throw new Error(`Custom package contains stale file ${file}.`);
  }

  for (const file of sourceFiles) {
    if (file === 'manifest.json' || file === 'background.js') continue;
    if (!readFile(resolve(sourceDir, file)).equals(readFile(resolve(targetDir, file)))) {
      throw new Error(`Custom package drift detected in ${file}.`);
    }
  }
  const sourceBackground = readFile(resolve(sourceDir, 'background.js'), 'utf8').trimEnd();
  const targetBackground = readFile(resolve(targetDir, 'background.js'), 'utf8').trimEnd();
  if (targetBackground !== `${sourceBackground}\n\n${initializerText}`) {
    throw new Error('Custom background is not the canonical build plus the custom initializer.');
  }
}

function collectFiles(directory, prefix = '') {
  const files = [];
  const currentDirectory = resolve(directory, prefix);
  for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...collectFiles(directory, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

function readFile(path, encoding) {
  return readFileSync(path, encoding);
}

function readJson(path) {
  // Strip a leading UTF-8 BOM (U+FEFF) so BOM-prefixed manifests parse cleanly.
  return JSON.parse(readFile(path, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
