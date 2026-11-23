/* SPDX-License-Identifier: Apache-2.0 */
/**
 * npm-tarball.mjs — read a package from the npm registry by exact version, with Node alone (no npm, no packages):
 *   await npmFiles('pdfjs-dist', '6.3.289') → Map<path inside the package, Buffer>
 * The registry's tarball is checked against its published sha512 ("integrity") before it is read.
 */
import zlib from 'node:zlib';
import crypto from 'node:crypto';

export const REGISTRY = process.env.NPM_REGISTRY || 'https://registry.npmjs.org';

/** The files of a .tgz (ustar / pax / GNU long names), each path without the top folder ("package/"). */
export function untar(tgz) {
  const tar = zlib.gunzipSync(tgz), out = new Map();
  let off = 0, longName = null, paxPath = null;
  const str = (b) => b.toString('utf8').replace(/\0.*$/s, '');
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    let name = str(h.subarray(0, 100));
    const prefix = str(h.subarray(345, 500));
    const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    const body = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = str(body); continue; }
    if (type === 'x') { const m = body.toString('utf8').match(/\d+ path=([^\n]*)\n/); paxPath = m ? m[1] : null; continue; }
    if (type === 'g') continue;
    if (prefix) name = prefix + '/' + name;
    if (paxPath) name = paxPath; else if (longName) name = longName;
    longName = paxPath = null;
    if (type !== '0' && type !== '\0' && type !== '7') continue;
    out.set(name.replace(/^[^/]+\//, ''), Buffer.from(body));
  }
  return out;
}

const cache = new Map();
export async function npmFiles(pkg, version) {
  const key = pkg + '@' + version;
  if (cache.has(key)) return cache.get(key);
  const meta = await fetch(`${REGISTRY}/${pkg.replace('/', '%2F')}/${encodeURIComponent(version)}`);
  if (!meta.ok) throw new Error(`${key}: registry HTTP ${meta.status}`);
  const dist = (await meta.json()).dist || {};
  const r = await fetch(dist.tarball);
  if (!r.ok) throw new Error(`${key}: tarball HTTP ${r.status}`);
  const tgz = Buffer.from(await r.arrayBuffer());
  const m = String(dist.integrity || '').match(/^sha512-(.+)$/);
  if (m && crypto.createHash('sha512').update(tgz).digest('base64') !== m[1]) throw new Error(`${key}: tarball integrity mismatch`);
  const files = untar(tgz);
  cache.set(key, files);
  return files;
}
