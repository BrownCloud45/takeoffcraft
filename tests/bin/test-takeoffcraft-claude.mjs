#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-takeoffcraft-claude.mjs — Ask Claude (claude.js) against a stand-in for the Claude API: no key, no network.
 *
 *   node bin/test-takeoffcraft-claude.mjs [--build dev|x.y]
 *
 * What is checked: the request (model, headers, tools from host.control, the history sent back unchanged), the tool loop
 * through host.control.handle() (so Settings › Assistants still decides: a refused tool comes back as an error result,
 * assistants turned off stop the chat), the answer to a refusal, an HTTP error, and Stop.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
let APP = path.join(ROOT, 'public_html/assets/apps/takeoffcraft', opt('--build', 'dev'));
if (!fs.existsSync(APP)) APP = path.join(ROOT, '..', 'app');   // run straight from a clone: node tests/bin/test-takeoffcraft-claude.mjs
const load = (f) => import(pathToFileURL(path.join(APP, f)).href);
const C = await load('claude.js');
const H = await load('host.js');

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== '' ? ' — ' + extra : '')); } };

function makeControl(groups = ['read']) {
  const host = H.getHost({ app: 'claudetest-' + Math.random().toString(36).slice(2), assistants: false, recentList: false });
  const c = host.control;
  c.configure({ enabled: true, groups, title: 'TakeoffCraft' });
  c.tool({ name: 'takeoff_estimate', group: 'read', title: 'Estimate', description: 'The priced estimate.', run: async () => ({ total: '$1,234.00', totalCents: 123400 }) });
  c.tool({ name: 'items_add', group: 'edit', title: 'Add items', description: 'Add items.', inputSchema: { type: 'object', properties: { items: { type: 'array' } }, required: ['items'], additionalProperties: false }, run: async () => ({ added: 1 }) });
  return c;
}
/** A stand-in for api.anthropic.com: answers in order, records each request. */
function fakeApi(answers) {
  const seen = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, headers: init.headers, body: JSON.parse(JSON.stringify(body)) });
    const a = answers.shift();
    if (typeof a === 'function') return a(init);
    const { status = 200, ...json } = a;
    return { ok: status < 400, status, json: async () => json };
  };
  return { fetch, seen };
}

console.log('claude.js — tool definitions');
{
  const tools = C.toClaudeTools([{ name: 'a_b', description: 'd', inputSchema: { type: 'object', properties: { x: { type: 'string' } } } }, { name: 'bad name', description: 'x' }, { name: 'c', title: 'T' }]);
  ok(tools.length === 2 && tools[0].input_schema.properties.x && tools[1].description === 'T' && tools[1].input_schema.type === 'object', 'MCP tools become Claude tools (bad names dropped, a missing schema is an empty object)', JSON.stringify(tools));
  const r = C.toToolResult('tu1', { result: { content: [{ type: 'text', text: '{"a":1}' }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }], isError: true } });
  ok(r.tool_use_id === 'tu1' && r.is_error === true && r.content[1].source.media_type === 'image/png', 'a tool result keeps its text, images and error flag');
  ok(C.toToolResult('x', { error: { message: 'nope' } }).content[0].text === 'nope', 'a JSON-RPC error becomes an error result');
  ok(C.apiError(401, {}).code === 'key' && C.apiError(529, {}).code === 'overloaded' && C.apiError(429, {}).code === 'rate', 'HTTP errors are named for the panel');
}

console.log('claude.js — the tool loop');
{
  const control = makeControl(['read']);
  const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
  const api = fakeApi([
    { id: 'm1', model: C.CLAUDE_MODEL, stop_reason: 'tool_use', content: [thinking, { type: 'text', text: 'Let me look.' }, { type: 'tool_use', id: 'tu1', name: 'takeoff_estimate', input: {} }, { type: 'tool_use', id: 'tu2', name: 'items_add', input: { items: [] } }] },
    { id: 'm2', model: C.CLAUDE_MODEL, stop_reason: 'end_turn', content: [{ type: 'text', text: 'The estimate totals $1,234.00.' }] },
  ]);
  const chat = C.createClaudeChat({ control, apiKey: () => 'sk-test', fetch: api.fetch });
  const ev = [];
  chat.on((e) => ev.push(e));
  await chat.send('What does the estimate total?');
  const [r1, r2] = api.seen;
  ok(r1 && r1.url === C.CLAUDE_API && r1.body.model === 'claude-opus-5-5' && r1.headers['x-api-key'] === 'sk-test' && r1.headers['anthropic-dangerous-direct-browser-access'] === 'true', 'the request goes to the Messages API with the person\'s key and the model');
  ok(r1.body.fallbacks === 'default' && /server-side-fallback/.test(r1.headers['anthropic-beta']) && r1.body.cache_control && r1.body.thinking === undefined, 'fallbacks and caching are on; thinking is left to the model (adaptive)');
  ok(r1.body.tools.map((t) => t.name).join() === 'takeoff_estimate', 'only the tools Settings › Assistants allows are sent (Read: no items_add)', r1.body.tools.map((t) => t.name).join());
  ok(r2 && JSON.stringify(r2.body.messages[1].content[0]) === JSON.stringify(thinking), 'the assistant turn goes back unchanged (thinking block and all)');
  const results = r2.body.messages[2].content;
  ok(results.length === 2 && results.every((b) => b.type === 'tool_result'), 'both tool results go back in one message');
  ok(/1,234/.test(results[0].content[0].text) && !results[0].is_error, 'the read tool ran through host.control');
  ok(results[1].is_error === true && /permission/.test(results[1].content[0].text), 'an Edit tool without the Edit permission is refused, not run', JSON.stringify(results[1]));
  ok(ev.filter((e) => e.type === 'text').map((e) => e.text).join('|') === 'Let me look.|The estimate totals $1,234.00.', 'the text reaches the panel');
  ok(ev.some((e) => e.type === 'tool' && e.name === 'takeoff_estimate') && ev.at(-1).type === 'idle' && !chat.busy, 'tool events, then idle');
  ok(control.log.some((e) => e.tool === 'takeoff_estimate' && e.client === C.CLAUDE_CLIENT.name), 'the call is in the activity log as Claude\'s');
  ok(chat.messages.length === 4 && chat.messages[3].role === 'assistant', 'the history is kept for the next question');
}

console.log('claude.js — refusals, errors, assistants off, stop');
{
  const control = makeControl();
  const api = fakeApi([{ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }]);
  const chat = C.createClaudeChat({ control, apiKey: 'k', fetch: api.fetch });
  const ev = []; chat.on((e) => ev.push(e));
  await chat.send('x');
  ok(ev.some((e) => e.type === 'refusal' && e.category === 'cyber'), 'a refusal is reported');
}
{
  const control = makeControl();
  const api = fakeApi([{ status: 401, error: { type: 'authentication_error', message: 'invalid x-api-key' } }]);
  const chat = C.createClaudeChat({ control, apiKey: 'k', fetch: api.fetch });
  const ev = []; chat.on((e) => ev.push(e));
  await chat.send('x');
  ok(ev.some((e) => e.type === 'error' && e.code === 'key') && chat.messages.length === 0, 'a bad key is reported and the unanswered question is taken out of the history');
}
{
  const control = makeControl();
  control.configure({ enabled: false });
  const api = fakeApi([]);
  const chat = C.createClaudeChat({ control, apiKey: 'k', fetch: api.fetch });
  const ev = []; chat.on((e) => ev.push(e));
  await chat.send('x');
  ok(ev.some((e) => e.type === 'error' && e.code === 'off') && api.seen.length === 0, 'assistants turned off: nothing is sent to Anthropic');
}
{
  const control = makeControl();
  const chat = C.createClaudeChat({ control, apiKey: '', fetch: async () => { throw new Error('should not be called'); } });
  const ev = []; chat.on((e) => ev.push(e));
  await chat.send('x');
  ok(ev.some((e) => e.type === 'error' && e.code === 'no-key'), 'no key: asks for one');
}
{
  const control = makeControl();
  const api = fakeApi([(init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))]);
  const chat = C.createClaudeChat({ control, apiKey: 'k', fetch: api.fetch });
  const ev = []; chat.on((e) => ev.push(e));
  const p = chat.send('x');
  await new Promise((r) => setTimeout(r, 20));
  chat.stop();
  await p;
  ok(ev.some((e) => e.type === 'stopped') && !chat.busy && chat.messages.length === 0, 'Stop ends the request');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
