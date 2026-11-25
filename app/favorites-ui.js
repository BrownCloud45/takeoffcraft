/* SPDX-License-Identifier: Apache-2.0 */
/**
 * favorites-ui.js — the Space bar favorites menu and its editor (favorites.js holds the list and the rules).
 *
 * A tap of Space (no drag: Space held with a drag still pans) opens a small menu where the pointer is. 1–9 or a click
 * picks a favorite: its item becomes the active one (added to the takeoff first if it has none, from the library when
 * the library has it) and its tool starts. Arrows move, Enter picks, Esc or Space closes. "Edit favorites…" at the
 * bottom opens the editor: rename, change the kind, reorder, remove, add, or go back to the defaults.
 *
 *   mountFavorites(ctx) → { open(), close(), edit(), isOpen() }
 *   ctx: { root, model, status, setActive, setTool, loadLib, hasSheet }
 */
import { t } from './i18n.js';
import { el, ask, icon } from './ui-util.js';
import { FAV_KEY, FAV_MAX, FAV_TYPES, DEFAULT_FAVORITES, readFavorites, checkFavorites, resolveFavorite, toolOf } from './favorites.js';

export function mountFavorites(ctx) {
  const { root, model, status, setActive, setTool, loadLib, hasSheet } = ctx;

  const load = () => { try { const s = localStorage.getItem(FAV_KEY); return readFavorites(s === null ? null : JSON.parse(s)); } catch { return readFavorites(null); } };
  const save = (list) => { try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); return true; } catch { return false; } };
  let favs = load();

  // where the pointer last was, so the menu opens under it
  let px = null, py = null;
  root.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; }, { passive: true });

  let menu = null, back = null;
  const isOpen = () => !!menu;

  function close() {
    if (!menu) return;
    menu.remove(); menu = null;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onOutside, true);
    back?.focus?.(); back = null;
  }
  function onOutside(e) { if (menu && !menu.contains(e.target)) close(); }

  function open() {
    if (menu) { close(); return; }
    if (!hasSheet()) { status(t('handoff.nopdf')); return; }
    back = document.activeElement;
    const items = model.state.items;
    const rows = favs.map((f, i) => {
      const r = resolveFavorite(f, items);
      const it = r.id ? model.item(r.id) : null;
      return el('button', { type: 'button', role: 'menuitem', className: 'tc-fav-row', dataset: { fav: String(i) }, title: it ? t('fav.row.has', { name: it.name }) : t('fav.row.new', { name: f.name }), onclick: () => pick(i) },
        el('span', { className: 'tc-fav-key' }, i < 9 ? String(i + 1) : ''),
        el('span', { className: 'tc-fav-swatch' + (it ? '' : ' is-new'), style: it ? 'background:' + it.color : null }),
        el('span', { className: 'tc-fav-name' }, f.name),
        el('span', { className: 'tc-fav-kind' }, t('fav.kind.' + f.type)));
    });
    menu = el('div', { className: 'tc-fav', role: 'menu', 'aria-label': t('fav.h'), dataset: { favMenu: '' } },
      el('div', { className: 'tc-fav-head' }, t('fav.h')),
      ...(rows.length ? rows : [el('p', { className: 'tc-fav-empty' }, t('fav.empty'))]),
      el('button', { type: 'button', role: 'menuitem', className: 'tc-fav-row tc-fav-edit', dataset: { favEdit: '' }, onclick: () => { close(); edit(); } }, icon('pencil'), ' ' + t('fav.edit')));
    root.append(menu);
    place();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onOutside, true);
    menu.querySelector('button')?.focus();
  }

  /** Under the pointer when it is over the window, else in the middle; always inside the window. */
  function place() {
    const r = menu.getBoundingClientRect(), pad = 8;
    const x = px ?? (innerWidth - r.width) / 2, y = py ?? (innerHeight - r.height) / 3;
    menu.style.left = Math.max(pad, Math.min(x, innerWidth - r.width - pad)) + 'px';
    menu.style.top = Math.max(pad, Math.min(y, innerHeight - r.height - pad)) + 'px';
  }

  function onKey(e) {
    if (!menu) return;
    const btns = [...menu.querySelectorAll('button')];
    const at = btns.indexOf(document.activeElement);
    let used = true;
    if (e.key === 'Escape' || e.key === ' ') { if (e.key === ' ' && e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); return; } close(); }
    else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { const i = Number(e.key) - 1; if (i < favs.length) pick(i); }
    else if (e.key === 'ArrowDown') btns[(at + 1) % btns.length]?.focus();
    else if (e.key === 'ArrowUp') btns[(at - 1 + btns.length) % btns.length]?.focus();
    else if (e.key === 'Home') btns[0]?.focus();
    else if (e.key === 'End') btns.at(-1)?.focus();
    else if (e.key === 'Enter') btns[at]?.click();
    else if (e.key === 'Tab') { e.preventDefault(); btns[(at + (e.shiftKey ? -1 : 1) + btns.length) % btns.length]?.focus(); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  // Space's keyup after the menu opened must not reach the app (it would read as another tap)
  window.addEventListener('keyup', (e) => { if (menu && e.key === ' ') e.stopImmediatePropagation(); }, true);

  /** Make the favorite's item the active one (adding it if the takeoff has none) and start its tool. */
  function pick(i) {
    const f = favs[i];
    close();
    if (!f) return;
    const r = resolveFavorite(f, model.state.items, loadLib());
    let id = r.id;
    if (!id) {
      try { [id] = model.addItems([r.fields], t('fav.undo', { name: f.name })); } catch (err) { status(err.message, 9000); return; }
      status(t('fav.added', { name: f.name }), 6000);
    } else status(t('fav.picked', { name: f.name }), 4000);
    setActive(id);
    setTool(toolOf(f.type));
  }

  // ---- the editor ----
  async function edit() {
    let rows = favs.map((f) => ({ ...f }));
    const list = el('div', { className: 'tc-fav-list', dataset: { favList: '' } });
    const say = el('p', { className: 'tc-lib-msg', role: 'status' });
    const typeSel = (r) => {
      const s = el('select', { className: 'tc-input', 'aria-label': t('fav.f.type') }, ...FAV_TYPES.map((k) => el('option', { value: k, selected: r.type === k }, t('fav.kind.' + k))));
      s.addEventListener('change', () => { r.type = s.value; });
      return s;
    };
    const draw = (focusAt = -1) => {
      list.replaceChildren(...rows.map((r, i) => {
        const name = el('input', { type: 'text', className: 'tc-input', value: r.name, maxLength: 120, 'aria-label': t('fav.f.name', { n: i + 1 }), dataset: { favName: String(i) } });
        name.addEventListener('input', () => { r.name = name.value; });
        const btn = (ic, label, fn, off = false) => el('button', { type: 'button', className: 'btn-line btn-sm-cc tc-fav-btn', title: label, 'aria-label': label, disabled: off, onclick: fn }, icon(ic));
        return el('div', { className: 'tc-fav-edit-row' },
          el('span', { className: 'tc-fav-key' }, i < 9 ? String(i + 1) : ''), name, typeSel(r),
          el('span', { className: 'tc-fav-btns' },
            btn('arrow-up', t('fav.up'), () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(i - 1); }, i === 0),
            btn('arrow-down', t('fav.down'), () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(i + 1); }, i === rows.length - 1),
            btn('trash', t('fav.remove'), () => { rows.splice(i, 1); draw(Math.min(i, rows.length - 1)); })));
      }));
      if (focusAt >= 0) list.querySelectorAll('[data-fav-name]')[focusAt]?.focus();
      add.disabled = rows.length >= FAV_MAX;
    };
    const add = el('button', { type: 'button', className: 'btn-line btn-sm-cc', dataset: { favAdd: '' }, onclick: () => { const a = model.item(ctx.active()); rows.push({ name: '', type: a && FAV_TYPES.includes(a.type) ? a.type : 'linear' }); draw(rows.length - 1); } }, icon('plus-lg'), ' ' + t('fav.add'));
    const fromItem = el('button', { type: 'button', className: 'btn-line btn-sm-cc', dataset: { favFromItem: '' }, onclick: () => {
      const a = model.item(ctx.active());
      if (!a || !FAV_TYPES.includes(a.type)) { say.textContent = t('fav.noactive'); return; }
      if (rows.some((r) => r.name.trim().toLowerCase() === a.name.toLowerCase())) { say.textContent = t('fav.err.twice', { name: a.name }); return; }
      if (rows.length >= FAV_MAX) return;
      rows.push({ name: a.name, type: a.type }); say.textContent = ''; draw(rows.length - 1);
    } }, icon('star'), ' ' + t('fav.fromitem'));
    const reset = el('button', { type: 'button', className: 'btn-line btn-sm-cc', dataset: { favReset: '' }, onclick: () => { rows = DEFAULT_FAVORITES.map((f) => ({ ...f })); say.textContent = t('fav.reset.done'); draw(); } }, icon('arrow-counterclockwise'), ' ' + t('fav.reset'));
    draw();
    const choice = await ask(root, {
      title: t('fav.edit.h'), text: t('fav.edit.text'),
      body: el('div', { className: 'tc-fav-editor' }, list, el('div', { className: 'tc-fav-tools' }, add, fromItem, reset), say),
      buttons: [['cancel', t('btn.cancel'), 'btn-line'], ['ok', t('fav.save'), 'btn-plot']],
      onOk: () => { const c = checkFavorites(rows); return c.ok ? null : c.error; },
      focus: '[data-fav-name]',
    });
    if (choice !== 'ok') return;
    favs = checkFavorites(rows).list;
    status(save(favs) ? t('fav.saved', { n: favs.length }) : t('fav.saved.tab'), 6000);
  }

  return { open, close, edit, isOpen };
}
