/* SPDX-License-Identifier: Apache-2.0 */
/**
 * claude-ui.js — the Ask Claude panel (claude.js): an app-bar button "Claude" and a side panel with the conversation.
 * The person pastes their own Anthropic API key (kept for this tab, or in this browser when they tick Remember); what
 * Claude may do is still Settings › Assistants, and the panel says so when assistants are off.
 *
 *   mountClaude({ host, doc })   once, after installAgents() has registered the tools
 */
import { el } from './ui-util.js';
import { t } from './i18n.js';
import { createClaudeChat } from './claude.js';

const KEY_STORE = 'cc-claude-key';   // localStorage, only when the person ticks Remember

const readKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
const writeKey = (k) => { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch { /* storage blocked */ } };

export function mountClaude({ host, doc = document }) {
  const bar = doc.querySelector('.app-bar');
  if (!bar || bar.__ccClaude) return null;
  bar.__ccClaude = true;
  const control = host.control;
  let key = readKey();
  const chat = createClaudeChat({ control, apiKey: () => key });

  // ---- the app-bar button
  const btn = el('button', { type: 'button', className: 'app-bar-btn app-bar-claude', dataset: { claudeOpen: '' }, 'aria-expanded': 'false', 'aria-controls': 'cc-claude', title: t('claude.btn.title') },
    el('i', { className: 'bi bi-stars', 'aria-hidden': 'true' }), el('span', { className: 'app-bar-btn-label' }, t('claude.btn')));
  const before = bar.querySelector('.app-bar-help, [data-help-open]');
  if (before) bar.insertBefore(btn, before); else bar.append(btn);

  // ---- the panel
  const log = el('div', { className: 'cc-claude-log', role: 'log', 'aria-live': 'polite', dataset: { claudeLog: '' } });
  const input = el('textarea', { className: 'tc-input cc-claude-input', rows: 3, maxlength: 20000, id: 'cc-claude-q', placeholder: t('claude.placeholder'), dataset: { claudeInput: '' } });
  const sendBtn = el('button', { type: 'button', className: 'btn-plot', dataset: { claudeSend: '' } }, t('claude.send'));
  const stopBtn = el('button', { type: 'button', className: 'btn-line', dataset: { claudeStop: '' }, hidden: true }, t('claude.stop'));
  const newBtn = el('button', { type: 'button', className: 'btn-line', dataset: { claudeNew: '' }, title: t('claude.new.title') }, t('claude.new'));
  const closeBtn = el('button', { type: 'button', className: 'cc-claude-x', 'aria-label': t('claude.close') }, el('i', { className: 'bi bi-x-lg', 'aria-hidden': 'true' }));
  const offNote = el('div', { className: 'cc-claude-note', dataset: { claudeOff: '' }, hidden: true },
    el('p', {}, t('claude.off')),
    el('button', { type: 'button', className: 'btn-line', onclick: () => { const s = doc.querySelector('[data-settings-open]'); if (s) s.click(); } }, t('claude.off.settings')));
  const perms = el('p', { className: 'cc-claude-perms', dataset: { claudePerms: '' } });

  // the key form
  const keyIn = el('input', { type: 'password', className: 'tc-input', id: 'cc-claude-key', autocomplete: 'off', spellcheck: false, placeholder: 'sk-ant-…', dataset: { claudeKey: '' } });
  const remember = el('input', { type: 'checkbox', dataset: { claudeRemember: '' } });
  const keySave = el('button', { type: 'button', className: 'btn-plot', dataset: { claudeKeySave: '' } }, t('claude.key.save'));
  const keyForm = el('div', { className: 'cc-claude-keyform', dataset: { claudeKeyform: '' } },
    el('p', {}, t('claude.key.lead')),
    el('label', { for: 'cc-claude-key' }, t('claude.key.label')), keyIn,
    el('label', { className: 'tc-check' }, remember, ' ', t('claude.key.remember')),
    el('p', { className: 'cc-claude-fine' }, t('claude.key.where')),
    keySave);
  const forget = el('button', { type: 'button', className: 'cc-claude-link', dataset: { claudeForget: '' } }, t('claude.key.forget'));

  const chatBox = el('div', { className: 'cc-claude-chat', dataset: { claudeChat: '' } },
    log,
    el('label', { for: 'cc-claude-q', className: 'visually-hidden' }, t('claude.placeholder')), input,
    el('div', { className: 'cc-claude-row' }, newBtn, el('span', { className: 'cc-claude-grow' }), stopBtn, sendBtn),
    el('p', { className: 'cc-claude-fine' }, t('claude.privacy'), ' ', forget));

  const panel = el('aside', { className: 'cc-claude', id: 'cc-claude', 'aria-label': t('claude.h'), hidden: true, dataset: { claudePanel: '' } },
    el('div', { className: 'cc-claude-head' }, el('h2', {}, el('i', { className: 'bi bi-stars', 'aria-hidden': 'true' }), ' ', t('claude.h')), closeBtn),
    offNote, perms, keyForm, chatBox);
  doc.body.append(panel);

  // ---- state
  const groupWord = (g) => t('claude.perm.' + g);
  function render() {
    const on = !!control.enabled;
    offNote.hidden = on;
    perms.hidden = !on;
    if (on) perms.textContent = t('claude.perms', { groups: (control.groups || []).map(groupWord).join(', ') });
    keyForm.hidden = !!key;
    chatBox.hidden = !key;
    const busy = chat.busy;
    sendBtn.disabled = busy || !on;
    stopBtn.hidden = !busy;
    newBtn.disabled = busy;
  }
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const line = (cls, text) => { const p = el('div', { className: 'cc-claude-msg ' + cls }, text); log.append(p); scroll(); return p; };
  const toolLines = new Map();

  chat.on((ev) => {
    if (ev.type === 'text') line('cc-claude-ai', ev.text);
    else if (ev.type === 'tool') toolLines.set(ev.id, line('cc-claude-tool', t('claude.tool.run', { tool: ev.name })));
    else if (ev.type === 'tool-done') { const p = toolLines.get(ev.id); if (p) { p.textContent = t(ev.error ? 'claude.tool.fail' : 'claude.tool.done', { tool: ev.name }); p.classList.toggle('is-error', ev.error); } toolLines.delete(ev.id); }
    else if (ev.type === 'refusal') line('cc-claude-err', t('claude.refusal'));
    else if (ev.type === 'stopped') line('cc-claude-err', t('claude.stopped'));
    else if (ev.type === 'error') {
      const known = ['key', 'forbidden', 'rate', 'overloaded', 'too-long', 'server', 'network', 'off', 'turns', 'cut', 'no-key'];
      line('cc-claude-err', known.includes(ev.code) ? t('claude.err.' + ev.code) : t('claude.err.other', { message: ev.message }));
      if (ev.code === 'key') { key = ''; writeKey(''); }
    }
    if (ev.type === 'busy' || ev.type === 'idle') render();
    if (ev.type === 'idle') render();
  });
  control.on('change', render);

  // ---- actions
  function open(show) {
    panel.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
    doc.body.classList.toggle('cc-claude-open', show);
    render();
    if (show) (key ? input : keyIn).focus();
  }
  btn.addEventListener('click', () => open(panel.hidden));
  closeBtn.addEventListener('click', () => { open(false); btn.focus(); });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); open(false); btn.focus(); } });

  keySave.addEventListener('click', () => {
    const k = keyIn.value.trim();
    if (!k) { keyIn.focus(); return; }
    key = k; keyIn.value = '';
    writeKey(remember.checked ? k : '');
    render(); input.focus();
  });
  keyIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); keySave.click(); } });
  forget.addEventListener('click', () => { chat.reset(); key = ''; writeKey(''); log.replaceChildren(); render(); keyIn.focus(); });

  async function ask() {
    const q = input.value.trim();
    if (!q || chat.busy || !control.enabled) return;
    input.value = '';
    line('cc-claude-you', q);
    await chat.send(q);
  }
  sendBtn.addEventListener('click', ask);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(); } });
  stopBtn.addEventListener('click', () => chat.stop());
  newBtn.addEventListener('click', () => { chat.reset(); log.replaceChildren(); input.focus(); });

  render();
  return { chat, open, panel };
}
