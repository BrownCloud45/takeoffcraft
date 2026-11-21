/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file — messages here are read by the assistant program, not shown to the person. */
/**
 * mcp-shim.js — the dev shell's stand-in for CadCraft Studio's window channel (window.cadcraftStudio), loaded only by
 * `serve.mjs --mcp` (mcp-bridge.mjs). host.js wires its control dispatcher to this channel when Settings › Assistants
 * is on; requests arrive by long poll from the dev server and answers go back to it.
 */
(function () {
  var cfg = window.__ccBridge;
  if (!cfg || window.cadcraftStudio) return;
  var handlers = {};
  var H = { 'X-CC-Bridge': cfg.token, 'Content-Type': 'application/json' };
  function send(url, data) {
    return fetch(url, { method: 'POST', headers: H, body: JSON.stringify(data), cache: 'no-store' }).catch(function () {});
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  window.cadcraftStudio = {
    on: function (type, fn) {
      (handlers[type] = handlers[type] || []).push(fn);
      return function () { handlers[type] = (handlers[type] || []).filter(function (f) { return f !== fn; }); };
    },
    post: function (type, data) {
      if (type === 'control.response') send('/__bridge/reply', data);
      else if (type === 'control.status') send('/__bridge/status', data);
    },
  };

  function dispatch(it) {
    var hs = handlers['control.request'] || [];
    if (!hs.length) {
      var m = it.message || {};
      send('/__bridge/reply', { rid: it.rid, answer: m.id === undefined ? null : { jsonrpc: '2.0', id: m.id, error: { code: -32001,
        message: 'TakeoffCraft is open but assistants are off: the person turns them on in Settings › TakeoffCraft › Assistants ("Let AI assistants and scripts use TakeoffCraft").' } } });
      return;
    }
    hs.forEach(function (h) { try { h({ rid: it.rid, sid: it.sid, client: it.client, message: it.message }, { from: 'devshell' }); } catch (e) { console.warn('assistant bridge:', e); } });
  }

  (async function loop() {
    for (;;) {
      try {
        var r = await fetch('/__bridge/poll', { headers: { 'X-CC-Bridge': cfg.token }, cache: 'no-store' });
        if (r.status === 204) continue;
        if (!r.ok) { await wait(3000); continue; }
        (await r.json()).forEach(dispatch);
      } catch (e) { await wait(3000); }
    }
  })();
})();
