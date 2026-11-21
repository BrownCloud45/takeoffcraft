/* SPDX-License-Identifier: Apache-2.0 */
/**
 * app-lang-boot.js — the browser edition's language (TakeoffDesk). The edition's page is packed once, in English, by
 * render.php --edition; this classic script runs before the app's modules and, when the person's language is another one
 * the app has files for, (1) puts that language's strings into the page's catalog (#cc-lang, read by i18n.js) and (2) swaps
 * the English the page was printed with, using the keys render.php recorded for it in order (#cc-lang-printed,
 * Lang::printedTag). No server is needed: the language files are static files beside the page.
 *
 * Which language: ?lang=, else the choice made in Settings (localStorage cadcraft.studio.lang, app-settings.js setLang),
 * else the browser's languages; matched against the files (exact, then the language alone: es-MX → es); else English.
 */
(function () {
  'use strict';
  var RTL = /^(ar|he|fa|ur|dv|ps|yi|ckb|sd|ug)(-|$)/;
  var script = document.currentScript;
  var root = script && script.src ? new URL('../../', script.src) : new URL('./', location.href);
  var edition = read('cc-edition') || {};
  var appLang = new URL('assets/apps/' + edition.app + '/' + edition.version + '/lang/', root);
  var shellLang = new URL('assets/lang/shell/', root);

  function read(id) { try { var n = document.getElementById(id); return n ? JSON.parse(n.textContent) : null; } catch (e) { return null; } }
  /** A static JSON file, synchronously (this must finish before the modules read the catalog); null when it is not there. */
  function getJson(url) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, false);
      x.send(null);
      if (x.status !== 200 && !(x.status === 0 && x.responseText)) return null;
      return JSON.parse(x.responseText);
    } catch (e) { return null; }
  }
  var ok = function (v) { return typeof v === 'string' && /^[a-z]{2,3}(-([A-Z]{2}|[0-9]{3}|[A-Z][a-z]{3}))?$/.test(v); };

  var wanted = [];
  try { var q = new URLSearchParams(location.search).get('lang'); if (ok(q)) wanted.push(q); } catch (e) { /* old browser */ }
  try { var s = localStorage.getItem('cadcraft.studio.lang'); if (ok(s)) wanted.push(s); } catch (e) { /* storage blocked */ }
  (navigator.languages || [navigator.language || 'en']).forEach(function (l) { if (typeof l === 'string') wanted.push(l.replace(/_/g, '-')); });

  // the first wanted language the app has a file for (exact, then the language alone)
  var locale = null, app = null;
  for (var i = 0; i < wanted.length && !app; i++) {
    var tries = [wanted[i], wanted[i].split('-')[0]];
    for (var j = 0; j < tries.length && !app; j++) {
      if (!ok(tries[j])) continue;
      if (tries[j] === 'en' || tries[j].indexOf('en-') === 0) { locale = 'en'; break; }
      var got = getJson(new URL(tries[j] + '.json', appLang));
      if (got) { locale = tries[j]; app = got; }
    }
    if (locale === 'en') break;
  }
  if (!app || !locale) return;                               // English (or no file for the language): the page is right as it is

  // the chain: locale, its language, English; a key missing from one falls through to the next
  var chain = [locale];
  var base = locale.split('-')[0];
  if (base !== locale) chain.push(base);
  var tables = [];
  chain.forEach(function (l, k) {
    var a = k === 0 ? app : getJson(new URL(l + '.json', appLang));
    var sh = getJson(new URL(l + '.json', shellLang));
    if (a || sh) tables.push(Object.assign({}, sh || {}, a || {}));
  });
  var enApp = getJson(new URL('en.json', appLang)) || {}, enShell = getJson(new URL('en.json', shellLang)) || {};
  var en = Object.assign({}, enShell, enApp);
  function lookup(key) { for (var k = 0; k < tables.length; k++) if (Object.prototype.hasOwnProperty.call(tables[k], key) && key.charAt(0) !== '@') return tables[k][key]; return undefined; }

  // (1) the catalog i18n.js reads
  var cat = read('cc-lang');
  var catNode = document.getElementById('cc-lang');
  if (cat && catNode) {
    var strings = cat.strings || {};
    Object.keys(strings).forEach(function (key) { var v = lookup(key); if (v !== undefined) strings[key] = v; });
    cat.locale = locale; cat.chain = chain.concat(['en']); cat.strings = strings;
    catNode.textContent = JSON.stringify(cat);
  }
  document.documentElement.lang = locale;
  if (RTL.test(locale)) document.documentElement.dir = 'rtl';

  // (2) the English the page was printed with → the language's, by the keys that printed it
  var plural = function (v, fills, loc) {
    if (v && typeof v === 'object') {
      var n = fills && typeof fills.n === 'number' ? fills.n : 1, cat2 = 'other';
      try { cat2 = new Intl.PluralRules(loc).select(n); } catch (e) { /* old browser */ }
      v = v[cat2] !== undefined ? v[cat2] : v.other;
    }
    return typeof v === 'string' ? v : null;
  };
  var fill = function (v, fills) { return v.replace(/\{(\w+)\}/g, function (m, k) { return fills && fills[k] !== undefined ? String(fills[k]) : m; }); };
  var swap = new Map();
  (read('cc-lang-printed') || []).forEach(function (p) {
    var key = p[0], fills = p[1] || null;
    var from = plural(en[key], fills, 'en'), to = plural(lookup(key), fills, locale);
    if (!from || !to || from === to) return;
    from = fill(from, fills).trim(); to = fill(to, fills);
    if (from && !swap.has(from)) swap.set(from, to);
  });
  if (!swap.size) return;
  var ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'aria-description', 'data-tip'];
  var apply = function () {
    var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (var n = walker.currentNode; n; n = walker.nextNode()) {
      if (n.nodeType === 3) {
        var tx = n.nodeValue, tr = tx.trim();
        if (tr && swap.has(tr)) n.nodeValue = tx.replace(tr, swap.get(tr));
      } else if (n.nodeType === 1 && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') {
        for (var a = 0; a < ATTRS.length; a++) {
          var v = n.getAttribute(ATTRS[a]);
          if (v && swap.has(v.trim())) n.setAttribute(ATTRS[a], swap.get(v.trim()));
        }
      }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true }); else apply();
})();
