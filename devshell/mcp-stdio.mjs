#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * mcp-stdio.mjs — for assistants that start MCP servers as a command (Claude Desktop's claude_desktop_config.json):
 * passes stdin/stdout JSON-RPC to the dev shell's /mcp (serve.mjs --mcp must be running). Node 20.19+, no packages.
 *
 *   node devshell/mcp-stdio.mjs [--port 8000]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf('--port') + 1]) || 8000;
const url = `http://127.0.0.1:${port}/mcp`;
let sid = null;

const token = () => { try { return fs.readFileSync(path.join(HERE, '.mcp-token'), 'utf8').trim(); } catch { return ''; } };
const out = (m) => process.stdout.write(JSON.stringify(m) + '\n');

let chain = Promise.resolve();   // keep the order the assistant sent
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    let msg;
    try { msg = JSON.parse(line); } catch { return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Not JSON.' } }); }
    try {
      const r = await fetch(url, { method: 'POST', body: line, headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer ' + token(), ...(sid ? { 'Mcp-Session-Id': sid } : {}) } });
      if (r.headers.get('mcp-session-id')) sid = r.headers.get('mcp-session-id');
      if (r.status === 202) return;
      const text = await r.text();
      if (text) out(JSON.parse(text));
    } catch (e) {
      if (msg && msg.id !== undefined) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: `The TakeoffCraft dev shell is not running at ${url} (${e.message}). Start it with: npm run mcp` } });
    }
  });
});
