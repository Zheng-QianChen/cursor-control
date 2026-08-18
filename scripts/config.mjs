// config.mjs — single source of truth for cursor-control.
// Everything user/machine-specific lives here so the rest of the scripts stay portable.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export const CDP_PORT = Number(process.env.CURSOR_CONTROL_PORT || 9222);
export const CDP_HOST = process.env.CURSOR_CONTROL_HOST || '127.0.0.1';

// Cursor conversation-search.db (read-only source of agent activity/progress).
export function cursorDbPath() {
  const over = process.env.CURSOR_CONTROL_DB;
  if (over) return over;
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'Cursor', 'User', 'globalStorage', 'conversation-search.db');
}

// Cursor-side hooks live in ~/.cursor/hooks; we keep the approve log next to them.
export function cursorHooksDir() {
  const over = process.env.CURSOR_CONTROL_HOOKS_DIR;
  if (over) return over;
  return path.join(os.homedir(), '.cursor', 'hooks');
}
export const APPROVE_LOG = path.join(cursorHooksDir(), 'approve-log.txt');

// Session titles to watch. Override with CURSOR_CONTROL_AGENTS="A,B,C".
export function agentTitles() {
  const fromEnv = (process.env.CURSOR_CONTROL_AGENTS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  // New default set (titles, not ids) — harmless generic example; point it at your agents.
  return [];
}

// Targets for the auto-approve / follow-up-injection hooks: conversation UUIDs.
// Read from CURSOR_HOOKS_TARGETS or ~/.cursor/hooks/targets.json (created by install-hooks.mjs).
export function loadHookTargets() {
  const fromEnv = (process.env.CURSOR_HOOKS_TARGETS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  try {
    const f = path.join(cursorHooksDir(), 'targets.json');
    if (fs.existsSync(f)) {
      const ids = JSON.parse(fs.readFileSync(f, 'utf8'));
      return Array.isArray(ids) ? ids : [];
    }
  } catch {}
  return [];
}

export const TOOL_REQUEST_RE = /正在执行[\s\S]{0,200}?目的[:：]|目的[:：][\s\S]{0,200}?风险[:：]/;
// "deletes files without backup" guard
export const DELETE_RE = /\b(rm\s|rm\s+-|rmdir\b|\bdel\b|unlink\b)/i;
export const BACKUP_RE = /backup|备份|\.bak|cp\s|mv\s/i;

export const now = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export function appendLog(file, line) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `[${now()}] ${line}\n`);
  } catch {}
}
