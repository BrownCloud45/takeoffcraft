/* SPDX-License-Identifier: Apache-2.0 */
/**
 * itemlook.js — how an item's marks look besides its colour (TakeoffDesk): a line style for its runs and area outlines, and
 * an optional icon that stands for the item in the lists and replaces the dot of its count marks. DOM-free: model.js
 * validates with it, takeoffcraft.js draws with it on screen, pdfmarks.js in the marked PDF.
 *
 *   item.line   'dashed' | 'dotted' | 'double'   (absent = solid)
 *   item.icon   'data:image/png;base64,…'         a PNG of at most ICON_PX × ICON_PX, made in the browser from any image
 *
 * Double lines are two thin parallel strokes: one wide stroke with its middle taken out, so the drawing shows through the gap
 * (on screen the overlay is cut; in the PDF the middle is painted white, the paper's colour).
 */

export const LINE_STYLES = ['solid', 'dashed', 'dotted', 'double'];
export const lineStyleOf = (it) => (it && LINE_STYLES.includes(it.line) ? it.line : 'solid');
/** The stored value: nothing for solid (files stay as they were), else the style. */
export const lineField = (v) => (LINE_STYLES.includes(v) && v !== 'solid' ? v : undefined);

/** Icons: the longest side in pixels, and the largest data URL kept (a 64 px PNG is a few KB; this leaves room for detail). */
export const ICON_PX = 64;
export const ICON_MAX = 64 * 1024;
export const iconOk = (v) => typeof v === 'string' && v.length <= ICON_MAX && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v);

/** For a line of width w: the stroke width and dash pattern (same units as w). */
export function strokeOf(style, w) {
  if (style === 'dashed') return { width: w, dash: [w * 4, w * 2.5], round: false };
  if (style === 'dotted') return { width: w * 1.4, dash: [0.001, w * 2.6], round: true };   // round caps on near-zero dashes = dots
  if (style === 'double') return { width: w * 3, dash: [], round: false, gap: w * 1.1 };
  return { width: w, dash: [], round: false };
}

/** Canvas 2D: stroke the current path in a style at width w (CSS px). Leaves the context as it found it. */
export function strokeStyled(ctx, style, w) {
  const s = strokeOf(style, w);
  ctx.save();
  ctx.lineWidth = s.width;
  ctx.setLineDash(s.dash);
  if (s.round) ctx.lineCap = 'round';
  ctx.stroke();
  if (s.gap) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineWidth = s.gap; ctx.stroke(); }
  ctx.restore();
}

/** An icon's bytes (for pdf-lib's embedPng), or null. */
export function iconBytes(v) {
  if (!iconOk(v)) return null;
  const b64 = v.slice(v.indexOf(',') + 1);
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
