// CDP send: switch session + send message (Enter key, no button click).
// Usage: node cdp-send.mjs "<session-name>" "<message>"
// Notes:
//  - Uses a robust editor selector: tiptap input is a contenteditable inside the
//    composer-bar (.ui-prompt-input-editor__input or plain [contenteditable]).
//  - Restores the previously active tracked session afterwards.
import { connect, getPageWsUrl } from './cdp-common.mjs';
import { agentTitles } from './config.mjs';

const WS_URL = await getPageWsUrl();
const [sessionName, message] = process.argv.slice(2);
if (!sessionName || !message) {
  console.error('usage: node cdp-send.mjs "<session>" "<message>"');
  process.exit(1);
}

const candidates = [...agentTitles(), sessionName].filter(Boolean);
const names = [...new Set(candidates)];

const ws = new WebSocket(WS_URL);
let id = 0;
const pend = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
ws.onerror = e => { console.error('WS ERROR', e.message); process.exit(1); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('JS ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
};

const findAndClick = (name, outLabel) => evalJS(`(() => {
  const leaf = [...document.querySelectorAll('div,span')].find(e => (e.textContent||'').trim() === ${JSON.stringify(name)} && e.offsetWidth && e.offsetHeight && e.children.length === 0);
  if (!leaf) return 'not-found';
  let el = leaf;
  for (let i = 0; i < 5 && el; i++) { if (/ui-sidebar-menu-button/.test(el.className)) break; el = el.parentElement; }
  (el || leaf).click();
  return 'clicked';
})()`);

// focus the composer's contenteditable via several fallback selectors
const focusEditor = () => evalJS(`(() => {
  const sels = [
    '[class*="composer-bar"] [contenteditable="true"]',
    '[class*="composer-bar"] [contenteditable]',
    'div[class*="editor__input"][contenteditable="true"]',
    '[contenteditable="true"]',
    '[contenteditable]'
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el && el.offsetParent !== null) { el.focus(); return 'focused:' + s; }
  }
  return 'no-editor';
})()`);

ws.onopen = async () => {
  try {
    // 0. remember currently active tracked session (leaf text near top, y<100)
    const activeBefore = await evalJS(`(() => {
      const leaves = [...document.querySelectorAll('div,span')].filter(e => e.children.length === 0 && e.offsetWidth && e.offsetHeight && (${JSON.stringify(names)}).includes((e.textContent||'').trim()));
      const top = leaves.filter(e => e.getBoundingClientRect().y < 100);
      return top.length ? top[0].textContent.trim() : (leaves[0] ? leaves[0].textContent.trim() : 'unknown');
    })()`);
    console.log('active before:', activeBefore);

    // 1. switch session if not already active
    await findAndClick(sessionName, 'switch');
    console.log('switch done');
    await sleep(2000);

    // 2. focus composer, clear stale content, insert text
    const focusRes = await focusEditor();
    console.log('focus:', focusRes);
    await sleep(300);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await sleep(200);
    await send('Input.insertText', { text: message });
    await sleep(300);
    const content = await evalJS(`(() => { const el = document.querySelector('[contenteditable="true"]'); return el ? el.innerText : 'no-editor'; })()`);
    console.log('composer:', JSON.stringify(content));

    // 3. send via Enter key (keydown+keyup), never click the submit button
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    console.log('sent Enter');
    await sleep(3000);

    // 4. verify message appeared in conversation
    const verify = await evalJS(`(() => {
      const txt = document.body.innerText;
      return { hit: txt.includes(${JSON.stringify(message.slice(0, 30))}) };
    })()`);
    console.log('verify:', JSON.stringify(verify));

    // 5. switch back to the session the user had active before
    if (activeBefore && activeBefore !== sessionName) {
      await findAndClick(activeBefore, 'restore');
      console.log('restore: switched back to', activeBefore);
    } else {
      console.log('restore: was already on target session');
    }
    process.exit(0);
  } catch (e) {
    console.error('FAIL', e.message);
    process.exit(1);
  }
};
