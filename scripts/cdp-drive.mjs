// cdp-drive.mjs — activity-driven Cursor agent monitor core.
// Zero-UI when nothing to do; touches Cursor UI only when a tracked session shows a
// pending tool-request (approval) that needs a Run click.
// Usage: node cdp-drive.mjs [--agents "Title A,Title B"]  (env CURSOR_CONTROL_AGENTS also works)
import { connect, getPageWsUrl } from './cdp-common.mjs';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import {
  agentTitles, appendLog, APPROVE_LOG, cursorDbPath,
  TOOL_REQUEST_RE, DELETE_RE, BACKUP_RE
} from './config.mjs';

let agents = agentTitles();
const argIdx = process.argv.indexOf('--agents');
if (argIdx > -1 && process.argv[argIdx + 1]) {
  agents = process.argv[argIdx + 1].split(',').map(s => s.trim()).filter(Boolean);
}
const PING_TITLE = process.env.CURSOR_CONTROL_PING_SESSION || 'Availability check';

const db = new DatabaseSync(cursorDbPath(), { readOnly: true });
const tail = (title, n = 2) => {
  const c = db.prepare('SELECT fts_rowid, updated_at FROM conversations WHERE title=?').get(title);
  if (!c) return { updated: null, tail: [] };
  const b = db.prepare('SELECT body FROM conversation_fts WHERE rowid=?').get(c.fts_rowid);
  const msgs = b.body.split(/\n\s*\n/).map(m => m.trim()).filter(Boolean);
  return { updated: c.updated_at, tail: msgs.slice(-n) };
};

// ---- 1. read-only activity scan (no UI) ----
const scan = {};
for (const t of agents) scan[t] = tail(t);
const ping = tail(PING_TITLE, 2);
db.close();

const needsApproval = [];
for (const t of agents) {
  const recent = scan[t].tail.join(' ').slice(0, 2000);
  if (TOOL_REQUEST_RE.test(recent)) needsApproval.push(t);
  console.log(`[drive] ${t}: messages=${scan[t].tail.length} updated=${scan[t].updated}`);
}
console.log('[drive] needs-approval-check:', needsApproval.length ? needsApproval : 'none');

// ---- 2. UI only if a tool-request (approval) is pending ----
let approved = 0, danger = 0;
if (needsApproval.length) {
  const { open, evalJS, sleep, close } = connect(await getPageWsUrl());
  await open;

  for (const session of needsApproval) {
    const clicked = await evalJS(`(() => {
      const leaf = [...document.querySelectorAll('div,span')].find(e => (e.textContent || '').trim() === ${JSON.stringify(session)} && e.offsetWidth && e.offsetHeight && e.children.length === 0);
      if (!leaf) return 'not-found';
      let el = leaf;
      for (let i = 0; i < 5 && el; i++) { if (/ui-sidebar-menu-button/.test(el.className)) break; el = el.parentElement; }
      (el || leaf).click();
      return 'clicked';
    })()`);
    if (clicked === 'not-found') { console.log('[drive]', session, 'switch failed'); continue; }
    await sleep(2200);

    const state = await evalJS(`(() => {
      const out = [];
      for (const b of document.querySelectorAll('button,[role=button]')) {
        if (!(b.offsetWidth || b.offsetHeight)) continue;
        const t = (b.textContent || '').trim();
        if ((/^Run/.test(t) && !/Always/.test(t)) || /^Always Run/.test(t) || t === 'Skip' || /^Allow/.test(t)) {
          let ctx = '';
          let el = b;
          for (let i = 0; i < 7 && el; i++) {
            const t2 = (el.innerText || '').trim();
            if (/执行|目的|风险|可逆|ssh|curl|rm |mkdir|cp |python|sbatch|scancel|cd /i.test(t2) && t2.length > 25) { ctx = t2; break; }
            el = el.parentElement;
          }
          if (!ctx) {
            el = b;
            for (let i = 0; i < 4 && el; i++) {
              const t2 = (el.innerText || '').trim();
              if (t2.length > 25 && !/^Allowlist/.test(t2)) { ctx = t2; break; }
              el = el.parentElement;
            }
          }
          out.push({ text: t.slice(0, 30), ctx: ctx.slice(0, 600) });
        }
      }
      return out;
    })()`);

    if (!state.length) { console.log('[drive]', session, ': no actual approval buttons (stale tool request)'); continue; }
    console.log('[drive]', session, ': approvals =', state.length);

    const run = state.find(b => /^Run/.test(b.text));
    if (!run) { console.log('[drive]', session, ': NO_RUN_BUTTON (only skip/allow) — report'); continue; }

    const isDelete = DELETE_RE.test(run.ctx);
    const hasBackup = BACKUP_RE.test(run.ctx);
    if (isDelete && !hasBackup) {
      console.log('DANGER:', session, 'delete-without-backup — NOT approving. Report to user.');
      console.log('ctx:', run.ctx.slice(0, 400));
      danger++;
      continue;
    }

    const clickedRun = await evalJS(`(() => {
      const btns = [...document.querySelectorAll('button,[role=button]')].filter(b => (b.offsetWidth || b.offsetHeight) && /^Run/.test((b.textContent || '').trim()) && !/Always/.test(b.textContent));
      if (!btns.length) return 'not-found';
      btns[0].click();
      return 'clicked';
    })()`);
    const summary = run.ctx.replace(/\s+/g, ' ').slice(0, 120);
    appendLog(APPROVE_LOG, `AUTO-APPROVED Cursor ${session}: ${summary}`);
    console.log('[drive]', session, 'Run click:', clickedRun, '| logged:', summary);
    approved++;
    await sleep(2000);
  }
  close();
}

console.log('[drive] approved:', approved, '| danger-blocked:', danger);
