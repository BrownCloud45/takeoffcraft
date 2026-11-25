/* SPDX-License-Identifier: Apache-2.0 */
/**
 * favorites.js — the Space bar favorites: a short list of items a person picks from often (striping to begin with), kept
 * in this browser (localStorage "takeoffcraft.favorites") and shown by favorites-ui.js. DOM-free (tested in Node).
 *
 *   DEFAULT_FAVORITES                    the list a new browser starts with
 *   readFavorites(json)                  → a clean list (bad entries dropped); not a list at all → the defaults
 *   checkFavorites(list)                 → { ok, list } | { ok: false, error }   what the editor saves
 *   resolveFavorite(fav, items, lib)     → { id } (an item of the takeoff) | { fields } (an item to add: from the
 *                                          library when it has one of that name and type, else a new one)
 *
 * A favorite is { name, type }: the item's name and its kind (linear, area or count). It finds the takeoff's item by name
 * and type, ignoring case, so renaming the favorite (or the item) is all it takes to point it at another one.
 */

import { t } from './i18n.js';
import { LIMITS } from './model.js';
import { DEFAULT_UNIT } from './units.js';
import { itemFromEntry } from './library.js';

export const FAV_KEY = 'takeoffcraft.favorites';
export const FAV_MAX = 30;
export const FAV_TYPES = ['linear', 'area', 'count'];

/** Striping: the STOP legend (a count), the 12" limit line and crosswalk, the 24" limit line, and the striping details. */
export const DEFAULT_FAVORITES = Object.freeze([
  { name: 'STOP', type: 'count' },
  { name: '12inLL', type: 'linear' },
  { name: '12inCW', type: 'linear' },
  { name: '24in', type: 'linear' },
  { name: 'D22', type: 'linear' },
  { name: 'D29', type: 'linear' },
  { name: 'D38', type: 'linear' },
  { name: 'D9', type: 'linear' },
].map((f) => Object.freeze(f)));

const nameOf = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name) : '');
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Stored favorites → a clean list. Anything but a list (nothing stored, or unreadable) gives the defaults. */
export function readFavorites(json) {
  if (!Array.isArray(json)) return DEFAULT_FAVORITES.map((f) => ({ ...f }));
  const out = [];
  for (const f of json) {
    const name = nameOf(f?.name);
    if (!name || !FAV_TYPES.includes(f?.type) || out.some((x) => same(x.name, name))) continue;
    out.push({ name, type: f.type });
    if (out.length >= FAV_MAX) break;
  }
  return out;
}

/** The editor's rows → the list to save, or the first problem in words. Empty rows are left out. */
export function checkFavorites(rows) {
  const list = [];
  for (const r of rows) {
    const name = nameOf(r?.name);
    if (!name) continue;
    if (!FAV_TYPES.includes(r?.type)) return { ok: false, error: t('fav.err.type', { name }) };
    if (list.some((x) => same(x.name, name))) return { ok: false, error: t('fav.err.twice', { name }) };
    list.push({ name, type: r.type });
  }
  if (list.length > FAV_MAX) return { ok: false, error: t('fav.err.many', { n: FAV_MAX }) };
  return { ok: true, list };
}

/**
 * The takeoff's item for a favorite: the one of that name and type (any case); else one of that name whose own or second
 * condition (T8) is that type; else fields for a new one, from the library entry of that name and type when there is one
 * (its colour, rates and assembly come with it).
 */
export function resolveFavorite(fav, items = [], lib = []) {
  const hit = items.find((i) => i.type === fav.type && same(i.name, fav.name))
    || items.find((i) => same(i.name, fav.name) && (i.conds || []).some((c) => c.kind === fav.type));
  if (hit) return { id: hit.id };
  const entry = lib.find((e) => e.type === fav.type && same(e.name, fav.name));
  if (entry) return { fields: { ...itemFromEntry(entry), name: fav.name } };
  return { fields: { name: fav.name, type: fav.type, unit: DEFAULT_UNIT[fav.type] } };
}

/** The tool a favorite starts: its kind's own tool. */
export const toolOf = (type) => (type === 'count' ? 'count' : type === 'area' ? 'area' : 'linear');
