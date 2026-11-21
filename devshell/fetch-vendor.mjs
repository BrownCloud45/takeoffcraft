#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * fetch-vendor.mjs — download every library this app (and its tests) uses, by exact version, into devshell/vendor/.
 * devshell/vendor.json lists each file with its size and sha256 and, under "npm", the npm package it comes from: the
 * package is read from the npm registry (npm-tarball.mjs, its own sha512 checked) and each file is the one in it with
 * that exact sha256, so nothing unchecked is used and no other website is contacted. A file already there with the right
 * hash is kept. SOURCE.txt (where the library came from) is written here.
 *
 *   node devshell/fetch-vendor.mjs [--lib pdfjs] [--quiet]     (npm run fetch-vendor)
 *
 * Libraries without "npm" (and the "oracles") are used only by some tests: they are not downloaded and those checks skip.
 * NPM_REGISTRY=https://your.mirror/ uses a mirror of the npm registry (for networks that only reach an internal one).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { npmFiles, REGISTRY } from './npm-tarball.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(HERE, 'vendor');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** @returns {{fetched: number, kept: number, failed: string[], skipped: string[]}} */
export async function fetchVendor({ only = null, quiet = false } = {}) {
  const list = JSON.parse(fs.readFileSync(path.join(HERE, 'vendor.json'), 'utf8'));
  let fetched = 0, kept = 0;
  const failed = [], skipped = [];
  for (const [lib, v] of Object.entries(list.libs)) {
    if (only && lib !== only) continue;
    const dir = path.join(VENDOR, lib, v.version);
    const queue = v.files.filter(([rel, size, hash]) => {
      if (rel === 'SOURCE.txt') return false;
      const f = path.join(dir, rel);
      if (fs.existsSync(f) && fs.statSync(f).size === size && sha(fs.readFileSync(f)) === hash) { kept++; return false; }
      return true;
    });
    if (!queue.length) continue;
    if (!v.npm) { skipped.push(`${lib} ${v.version}: not on npm, used only by some tests (they skip)`); continue; }
    if (!quiet) console.log(`${lib} ${v.version}: ${queue.length} file(s) from npm ${v.npm}@${v.version}…`);
    let files;
    try { files = await npmFiles(v.npm, v.version); } catch (e) { failed.push(`${lib}/${v.version}: ${e.message}`); continue; }
    const byHash = new Map();
    for (const [p, b] of files) byHash.set(sha(b), b);
    for (const [rel, size, hash] of queue) {
      const buf = byHash.get(hash);
      if (!buf || buf.length !== size) { failed.push(`${lib}/${v.version}/${rel}: not in ${v.npm}@${v.version} with the expected checksum`); continue; }
      const f = path.join(dir, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f + '.part', buf); fs.renameSync(f + '.part', f);
      fetched++;
    }
    if (v.files.some(([rel]) => rel === 'SOURCE.txt')) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SOURCE.txt'), `${v.npm}@${v.version} from the npm registry (${REGISTRY}), files matched by sha256 (devshell/vendor.json).\nhttps://www.npmjs.com/package/${v.npm}/v/${v.version}\n`);
    }
  }
  return { fetched, kept, failed, skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--lib');
  const r = await fetchVendor({ only: i > 0 ? process.argv[i + 1] : null, quiet: process.argv.includes('--quiet') });
  console.log(`libraries: ${r.fetched} fetched, ${r.kept} already here${r.failed.length ? ', ' + r.failed.length + ' failed' : ''}`);
  for (const f of r.failed.slice(0, 20)) console.log('  ' + f);
  if (!process.argv.includes('--quiet')) for (const s of r.skipped) console.log('  skipped: ' + s);
  process.exit(r.failed.length ? 1 : 0);
}
