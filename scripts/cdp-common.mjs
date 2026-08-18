// cdp-common.mjs — CDP client for Cursor (dynamic page discovery, connect, evaluate).
// Usage: import { connect, getPages, getPageWsUrl } from './cdp-common.mjs'
import { CDP_HOST, CDP_PORT } from './config.mjs';

export async function getPages() {
  const res = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json`);
  return await res.json();
}

// titleMatch: string (substring match) or regex or undefined (first page)
export async function getPageWsUrl(titleMatch) {
  const list = await getPages();
  let page;
  if (titleMatch === undefined) {
    page = list.find(t => t.type === 'page' && t.title === 'Cursor Agents') || list.find(t => t.type === 'page');
  } else if (titleMatch instanceof RegExp) {
    page = list.find(t => t.type === 'page' && titleMatch.test(t.title));
  } else {
    page = list.find(t => t.type === 'page' && t.title.includes(titleMatch));
  }
  if (!page) throw new Error('no page target found, is Cursor running with --remote-debugging-port?');
  return page.webSocketDebuggerUrl;
}

export function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pend = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => {
    const i = ++id;
    pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id);
      pend.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const open = new Promise((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = e => rej(new Error('WS ERROR ' + (e.message || '')));
  });

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('JS ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  };

  const close = () => { try { ws.close(); } catch {} };

  return { ws, open, send, evalJS, sleep, close };
}
