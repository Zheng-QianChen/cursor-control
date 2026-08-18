// CDP status check: busy state, approval buttons, active session, last messages.
// Usage: node cdp-status.mjs [sessionName] [lines]
import { getPageWsUrl, connect } from './cdp-common.mjs';

const sessionName = process.argv[2];
const lines = parseInt(process.argv[3] || '25', 10);

const wsUrl = await getPageWsUrl();
const c = connect(wsUrl);
await c.open;

try {
  const s = await c.evalJS(`(() => {
    const out = { busy: 0, idle: 0, runBtns: [], otherBtns: [] };
    for (const e of document.querySelectorAll('[aria-label]')) {
      const l = e.getAttribute('aria-label') || '';
      if (l.includes('Stop generation')) out.busy++;
      if (l.includes('voice input')) out.idle++;
    }
    for (const b of document.querySelectorAll('button,[role=button]')) {
      if (!(b.offsetWidth || b.offsetHeight)) continue;
      const t = (b.textContent || '').trim();
      const l = b.getAttribute('aria-label') || '';
      if ((/^Run/.test(t) && !/Always/.test(t)) || /^Always Run/.test(t) || t === 'Skip' || /^Allow/.test(t)) out.runBtns.push(t.slice(0,30));
      else if (l.includes('voice') || l.includes('Send') || l.includes('Stop')) out.otherBtns.push((l||t).slice(0,30));
    }
    return out;
  })()`);
  console.log('== state ==', JSON.stringify(s));

  if (sessionName) {
    const clicked = await c.evalJS(`(() => {
      const leaf = [...document.querySelectorAll('div,span')].find(e => (e.textContent||'').trim() === ${JSON.stringify(sessionName)} && e.offsetWidth && e.offsetHeight && e.children.length === 0);
      if (!leaf) return 'session-not-found';
      let el = leaf;
      for (let i = 0; i < 5 && el; i++) { if (/ui-sidebar-menu-button/.test(el.className)) break; el = el.parentElement; }
      (el || leaf).click();
      return 'clicked';
    })()`);
    console.log('== switch', sessionName, '=>', clicked);
    await c.sleep(2200);
  }

  const txt = await c.evalJS(`document.body.innerText`);
  const arr = txt.split('\n').map(l => l.trim()).filter(l => l && l.length > 2);
  console.log('== last', lines, 'lines of', arr.length, '==');
  arr.slice(-lines).forEach(l => console.log('  ' + l.slice(0, 120)));
} catch (e) {
  console.error('FAIL', e.message);
} finally {
  c.close();
  process.exit(0);
}
