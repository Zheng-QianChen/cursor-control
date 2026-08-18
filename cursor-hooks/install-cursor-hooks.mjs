#!/usr/bin/env node
// install-cursor-hooks.mjs — install the cursor-control hooks into Cursor.
// Steps:
//   1. checks Cursor is reachable on the CDP port (health gate, non-fatal)
//   2. creates ~/.cursor/hooks/targets.json from --targets / CURSOR_HOOKS_TARGETS / existing file
//   3. copies approve.mjs + inject.mjs into ~/.cursor/hooks/
//   4. merges the hook entries into ~/.cursor/hooks.json (flat {version:1,hooks:{...}})
// Usage:
//   node install-cursor-hooks.mjs [--targets conv1,conv2,...] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { CDP_HOST, CDP_PORT, cursorHooksDir } from '../scripts/config.mjs';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = cursorHooksDir();
const HOOKS_JSON = path.join(os.homedir(), '.cursor', 'hooks.json');

const argIdx = process.argv.indexOf('--targets');
const targetsArg = argIdx > -1 && process.argv[argIdx + 1] ? process.argv[argIdx + 1] : process.env.CURSOR_HOOKS_TARGETS;
const dryRun = process.argv.includes('--dry-run');

function done(msg) { console.log(msg); process.exit(0); }

// 1. health gate — Cursor on CDP port?
try {
  const res = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(2500) });
  if (res.ok) console.log(`[ok] Cursor reachable on CDP ${CDP_HOST}:${CDP_PORT} (version endpoint ok)`);
  else console.log(`[warn] Cursor CDP endpoint responded ${res.status}`);
} catch (e) {
  console.log(`[warn] Cursor not reachable on :${CDP_PORT} — hooks will still install, but ` +
    `cursor-control CDP scripts need Cursor started with --remote-debugging-port=${CDP_PORT} to work.`);
}

fs.mkdirSync(HOOKS_DIR, { recursive: true });

// 2. targets.json — keep existing ids, merge new ones
const targetsFile = path.join(HOOKS_DIR, 'targets.json');
let existing = [];
try { existing = JSON.parse(fs.readFileSync(targetsFile, 'utf8')); } catch {}
if (!Array.isArray(existing)) existing = [];
const incoming = (targetsArg || '').split(',').map(s => s.trim()).filter(Boolean);
const merged = [...new Set([...existing, ...incoming])];
if (!merged.length) {
  console.log(`[warn] no targets configured. Set targets.json (${targetsFile}) or pass --targets "<conv-uuid>,..."`);
} else {
  if (!dryRun) fs.writeFileSync(targetsFile, JSON.stringify(merged, null, 2) + '\n');
  console.log(`[ok] targets (${merged.length}): ${merged.join(', ')} -> ${targetsFile}`);
}

// 3. copy hook scripts
for (const f of ['approve.mjs', 'inject.mjs']) {
  const dst = path.join(HOOKS_DIR, f);
  if (!dryRun) fs.copyFileSync(path.join(SRC_DIR, f), dst);
  console.log(`[${dryRun ? 'dry' : 'copy'}] ${f} -> ${dst}`);
}

// 4. merge hooks.json (flat format: {"version":1,"hooks":{"step":[{"command":...}]}})
let cfg = { version: 1, hooks: {} };
try { cfg = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8')); } catch {}
if (!cfg.hooks || typeof cfg.hooks !== 'object') cfg.hooks = {};
const nodeCmd = 'node';
const hookEntry = (name) => [{
  matcher: '*',
  command: nodeCmd,
  args: [path.join(HOOKS_DIR, name)],
  timeout: 30
}, { command: nodeCmd, args: [path.join(HOOKS_DIR, name)], timeout: 30 }];

// approve → preToolUse + beforeShellExecution; inject → stop
function setHook(step, name) {
  const entries = hookEntry(name);
  const prev = cfg.hooks[step];
  const prevArgs = Array.isArray(prev) ? prev.map(e => e.args && e.args[0]).filter(Boolean) : [];
  const fresh = entries.find(e => !prevArgs.includes(e.args[0]));
  if (fresh) {
    if (!dryRun) cfg.hooks[step] = [...(Array.isArray(prev) ? prev : []), fresh];
    console.log(`[${dryRun ? 'dry' : 'add'}] hooks:${step} += ${name}`);
  } else {
    console.log(`[ok] hooks:${step} already has ${name}`);
  }
}
setHook('preToolUse', 'approve.mjs');
setHook('beforeShellExecution', 'approve.mjs');
setHook('stop', 'inject.mjs');

if (!dryRun) {
  fs.writeFileSync(HOOKS_JSON, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`[ok] wrote ${HOOKS_JSON}`);
}
console.log('Done. Cursor hot-reloads hooks.json; open a fresh Cursor window if the new step is not picked up.');
