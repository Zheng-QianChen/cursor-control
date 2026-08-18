#!/usr/bin/env node
// Deployable Cursor hook: auto-approve tool calls in tracked sessions.
// Install to ~/.cursor/hooks/ via install-cursor-hooks.mjs. Target conversation UUIDs
// are read from targets.json next to this script (created by the installer), or from
// the CURSOR_HOOKS_TARGETS env var (comma-separated).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));

function loadTargets() {
  const fromEnv = (process.env.CURSOR_HOOKS_TARGETS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (fromEnv.length) return new Set(fromEnv);
  try {
    const ids = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'targets.json'), 'utf8'));
    return new Set(Array.isArray(ids) ? ids : []);
  } catch { return new Set(); }
}
const TARGETS = loadTargets();
const LOG = path.join(HOOKS_DIR, 'hook-log.txt');
const DELETE_RE = /\b(rm\s|rm\s+-|rmdir\b|\bdel\b|unlink\b)/i;
const BACKUP_RE = /backup|备份|\.bak|cp\s|mv\s/i;

let input = '';
try { input = fs.readFileSync(0).toString('utf8').replace(/^\uFEFF/, ''); } catch {}
const log = msg => {
  try {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    fs.appendFileSync(LOG, `[${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}] ${msg}\n`);
  } catch {}
};
let data = {};
try { data = JSON.parse(input); } catch {}

const { conversation_id, tool_name, tool_input, hook_event_name } = data;
const isTarget = TARGETS.has(conversation_id);
if (!isTarget) {
  log(`SKIP (non-target) event=${hook_event_name} conv=${conversation_id} tool=${tool_name}`);
  process.stdout.write(JSON.stringify({ permission: 'ask' }));
  process.exit(0);
}
// beforeShellExecution puts command at top level; preToolUse nests it in tool_input
const cmd = (() => {
  const ti = tool_input || {};
  const parts = [data.command || ti.command, ti.content, ti.file_path, ti.query].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);
})();
log(`event=${hook_event_name} conv=${conversation_id} tool=${tool_name} cmd=${cmd}`);

if (DELETE_RE.test(cmd) && !BACKUP_RE.test(cmd)) {
  log(`DENY delete-without-backup: ${cmd}`);
  process.stdout.write(JSON.stringify({
    permission: 'deny',
    user_message: 'ZCode hook: 该命令包含无备份删除(rm/del/unlink),按规则拒绝。需要时请带备份或改用可逆操作。',
    agent_message: '该命令包含无备份删除,被拒绝。请改用带备份的可逆操作,或说明备份方式后重试。'
  }));
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  permission: 'allow',
  agent_message: 'ZCode hook: 已按授权自动批准。'
}));
process.exit(0);
