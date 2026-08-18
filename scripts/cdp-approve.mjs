// CDP approve handler: detect approval buttons, read command context, decide, click, log.
// Usage: node cdp-approve.mjs
// Policy: auto-approve unless the command deletes files without backup (rm/del/unlink).
import { getPageWsUrl, connect } from './cdp-common.mjs';
import { appendLog, APPROVE_LOG, DELETE_RE, BACKUP_RE } from './config.mjs';

const wsUrl = await getPageWsUrl();
const c = connect(wsUrl);
await c.open;

try {
  const state = await c.evalJS(`(() => {
    const out = [];
    for (const b of document.querySelectorAll('button,[role=button]')) {
      if (!(b.offsetWidth || b.offsetHeight)) continue;
      const t = (b.textContent || '').trim();
      const isRun = /^Run/.test(t) && !/Always/.test(t);
      if (isRun || /^Always Run/.test(t) || t === 'Skip' || /^Allow/.test(t)) {
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

  if (!state.length) {
    console.log('NO_APPROVAL_PENDING');
    process.exit(0);
  }

  console.log('approvals found:', state.length);
  const run = state.find(b => /^Run/.test(b.text));
  if (!run) {
    console.log('NO_RUN_BUTTON (only skip/allow?)');
    process.exit(0);
  }

  const ctxText = run.ctx;
  console.log('ctx sample:', ctxText.slice(0, 400));

  const isDelete = DELETE_RE.test(ctxText);
  const hasBackup = BACKUP_RE.test(ctxText);
  console.log('delete-match:', isDelete, 'backup-match:', hasBackup);

  if (isDelete && !hasBackup) {
    console.log('DANGER: delete without backup — NOT approving. Report to user.');
    process.exit(2);
  }

  const clicked = await c.evalJS(`(() => {
    const btns = [...document.querySelectorAll('button,[role=button]')].filter(b => (b.offsetWidth || b.offsetHeight) && /^Run/.test((b.textContent || '').trim()) && !/Always/.test(b.textContent));
    if (!btns.length) return 'not-found';
    btns[0].click();
    return 'clicked';
  })()`);
  console.log('click:', clicked);

  appendLog(APPROVE_LOG, `AUTO-APPROVED Cursor (CDP): ${(ctxText || '').replace(/\s+/g, ' ').slice(0, 120)}`);
  process.exit(0);
} catch (e) {
  console.error('APPROVE FAIL', e.message);
  process.exit(1);
} finally {
  c.close();
}
