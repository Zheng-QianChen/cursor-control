#!/usr/bin/env node
// Deployable Cursor hook (stop event): inject queued messages as followup.
// External processes write a pending/<conversation_id>.json file {message: "..."} in the
// hooks dir; when the tracked agent stops, this hook returns it as followup_message and
// Cursor submits it as the next user message — zero UI interaction.
// Target conversation UUIDs come from targets.json next to this script (or CURSOR_HOOKS_TARGETS).
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
const PENDING_DIR = path.join(HOOKS_DIR, 'pending');

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
try { data = JSON.parse(input); } catch { log(`inject: BAD JSON input=${input.slice(0, 200)}`); }

const { conversation_id, hook_event_name } = data;
const isTarget = TARGETS.has(conversation_id);
log(`inject: event=${hook_event_name} conv=${conversation_id} target=${isTarget} keys=${Object.keys(data).join(',')}`);
if (!isTarget) { process.stdout.write(JSON.stringify({})); process.exit(0); }
if (hook_event_name !== 'stop') { process.stdout.write(JSON.stringify({})); process.exit(0); }

const file = path.join(PENDING_DIR, `${conversation_id}.json`);
let queued = null;
try { queued = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
if (!queued || !queued.message) { process.stdout.write(JSON.stringify({})); process.exit(0); }

try { fs.unlinkSync(file); } catch {}
log(`inject: INJECT followup to conv=${conversation_id}: ${String(queued.message).slice(0, 120)}`);
process.stdout.write(JSON.stringify({ followup_message: queued.message }));
process.exit(0);
