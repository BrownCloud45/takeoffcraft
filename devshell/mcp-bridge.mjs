/* SPDX-License-Identifier: Apache-2.0 */
/**
 * mcp-bridge.mjs — let an MCP assistant (Claude Code, Claude Desktop, …) use the app running in the dev shell.
 * Opt-in: `node devshell/serve.mjs --mcp`.
 *
 *   assistant ──POST /mcp (Streamable HTTP, JSON answers, Bearer token)──▶ serve.mjs
 *   serve.mjs ◀──long poll /__bridge/poll · answers /__bridge/reply──▶ the app's browser tab
 *
 * The tab gets a channel (window.takeoffdeskBridge, mcp-shim.js) that host.js's control dispatcher listens on, so every
 * request gets the app's own tools, Settings › Assistants permissions, undo steps and activity log. Nothing here knows the
 * tools.
 *
 * Safety: loopback only (the server refuses --mcp on another --host); the assistant needs the token in
 * devshell/.mcp-token (made once, git-ignored); the tab's endpoints need a per-start page token sent in a custom
 * header (so other sites' pages cannot reach them); Host and Origin are checked against DNS rebinding.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const POLL_MS = 25_000;        // a tab's long poll is answered (empty) after this
const PRESENT_MS = 40_000;     // a tab counts as open this long after its last poll
const CALL_MS = 10 * 60_000;   // an answer is awaited this long (a legend count on a big set can take minutes)
const MAX_BODY = 8 << 20;

export function loadToken(file) {
  try { const t = fs.readFileSync(file, 'utf8').trim(); if (/^[A-Za-z0-9_-]{32,}$/.test(t)) return t; } catch { /* none yet */ }
  const t = crypto.randomBytes(24).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, t + '\n', { mode: 0o600 });
  return t;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function createBridge({ token, port, log = () => {} }) {
  const pageToken = crypto.randomBytes(18).toString('base64url');
  const queue = [];                 // requests waiting for a tab
  const waiters = new Set();        // tabs' open polls: (items) => void
  const pending = new Map();        // rid → { resolve, timer }
  const sessions = new Map();       // Mcp-Session-Id → { client }
  let lastPoll = 0, status = null;

  const hostOk = (req) => {
    const h = String(req.headers.host || '').toLowerCase();
    return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(h);
  };
  const originOk = (req) => {
    const o = req.headers.origin;
    return !o || /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(o);
  };
  const json = (res, code, body, head = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...head });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  function flush() {
    if (!queue.length || !waiters.size) return;
    const items = queue.splice(0);
    const w = waiters.values().next().value;   // one tab takes them all
    waiters.delete(w);
    w(items);
  }

  /** One JSON-RPC message → the tab's answer (null for a notification). */
  function forward(message, sid, client) {
    const rid = crypto.randomBytes(9).toString('base64url');
    const isCall = message && typeof message === 'object' && 'id' in message;
    queue.push({ rid, sid, client, message });
    flush();
    if (!isCall) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(rid); resolve(rpcError(message.id, -32603, 'The app did not answer in time.')); }, CALL_MS);
      pending.set(rid, { resolve, timer });
    });
  }

  const NO_TAB = 'TakeoffDesk is not open. Start it with `npm run mcp` (or `node devshell/serve.mjs --mcp`), open ' +
    `http://127.0.0.1:${port}/ in a browser, and turn on Settings › TakeoffDesk › Assistants. Keep that tab open.`;

  async function mcp(req, res) {
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ') || !eq(auth.slice(7).trim(), token)) {
      return json(res, 401, rpcError(null, -32001, 'Wrong or missing token: use the one in devshell/.mcp-token.'), { 'WWW-Authenticate': 'Bearer' });
    }
    if (req.method === 'GET') { res.writeHead(405, { Allow: 'POST, DELETE' }); return res.end(); }   // no server-sent stream
    if (req.method === 'DELETE') { sessions.delete(String(req.headers['mcp-session-id'] || '')); res.writeHead(200); return res.end(); }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST, DELETE' }); return res.end(); }
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, rpcError(null, -32700, 'Not JSON.')); }
    const batch = Array.isArray(body), msgs = batch ? body : [body];
    let sid = String(req.headers['mcp-session-id'] || '');
    const head = {};
    const init = msgs.find((m) => m && m.method === 'initialize');
    if (init) {
      sid = crypto.randomUUID();
      const ci = (init.params && init.params.clientInfo) || {};
      sessions.set(sid, { client: { name: String(ci.name || 'assistant').slice(0, 100), version: String(ci.version || '').slice(0, 40) } });
      head['Mcp-Session-Id'] = sid;
      log(`assistant connected: ${sessions.get(sid).client.name}`);
    }
    const sess = sessions.get(sid) || { client: null };
    const calls = msgs.filter((m) => m && typeof m === 'object' && 'id' in m);
    if (!calls.length) { msgs.forEach((m) => forward(m, sid || 'devshell', sess.client)); res.writeHead(202, head); return res.end(); }
    if (Date.now() - lastPoll > PRESENT_MS) {
      const out = calls.map((m) => rpcError(m.id, -32001, NO_TAB));
      return json(res, 200, batch ? out : out[0], head);
    }
    const answers = (await Promise.all(msgs.map((m) => forward(m, sid || 'devshell', sess.client)))).filter((a) => a);
    return json(res, 200, batch ? answers : answers[0], head);
  }

  async function page(req, res, u) {
    if (!eq(String(req.headers['x-cc-bridge'] || ''), pageToken)) { res.writeHead(403); return res.end(); }
    if (u.pathname === '/__bridge/poll' && req.method === 'GET') {
      lastPoll = Date.now();
      if (queue.length) { const items = queue.splice(0); return json(res, 200, items); }
      let done = false;
      const w = (items) => { if (done) return; done = true; clearTimeout(timer); lastPoll = Date.now(); json(res, 200, items); };
      const timer = setTimeout(() => { if (done) return; done = true; waiters.delete(w); lastPoll = Date.now(); res.writeHead(204); res.end(); }, POLL_MS);
      req.on('close', () => { if (!done) { done = true; clearTimeout(timer); waiters.delete(w); } });
      waiters.add(w);
      return;
    }
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { res.writeHead(400); return res.end(); }
    if (u.pathname === '/__bridge/reply') {
      const p = body && pending.get(body.rid);
      if (p) { pending.delete(body.rid); clearTimeout(p.timer); p.resolve(body.answer); }
      res.writeHead(204); return res.end();
    }
    if (u.pathname === '/__bridge/status') {
      const was = status && status.enabled;
      status = body;
      if (!!(status && status.enabled) !== !!was) log(status && status.enabled ? `assistants on in the app (${(status.groups || []).join(', ')})` : 'assistants off in the app');
      res.writeHead(204); return res.end();
    }
    res.writeHead(404); return res.end();
  }

  return {
    pageToken,
    /** true when the request was the bridge's (and is answered). */
    async handle(req, res, u) {
      const mine = u.pathname === '/mcp' || u.pathname.startsWith('/__bridge/');
      if (!mine) return false;
      if (!hostOk(req) || !originOk(req)) { res.writeHead(403); res.end('Refused: the MCP bridge answers only on this computer.'); return true; }
      if (u.pathname === '/mcp') await mcp(req, res);
      else if (u.pathname === '/__bridge/shim.js' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(new URL('./mcp-shim.js', import.meta.url)));
      } else await page(req, res, u);
      return true;
    },
    /** The page's <head> gets the channel before the app's modules run. */
    inject(html) {
      const tag = `<script>window.__ccBridge=${JSON.stringify({ token: pageToken })};</script><script src="/__bridge/shim.js"></script>`;
      return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : tag + html;
    },
  };
}
