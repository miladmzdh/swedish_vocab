#!/usr/bin/env node
// Merges vocab/<unit>.json (in the order of data/units.json) into data/vocab.json.
//   node tools/build-vocab.mjs           build
//   node tools/build-vocab.mjs --report  also list cross-unit duplicates and shared English glosses
// Entries keep a stable id "<sv>.<pos>" so learners' progress survives edits and reordering.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const report = process.argv.includes('--report');
const units = JSON.parse(readFileSync(join(ROOT, 'data/units.json'), 'utf8'));
const FIELDS = ['id', 'u', 'sv', 'en', 'alt', 'pos', 'g', 'f', 'ipa', 'tone', 'ex', 'exEn', 'lvl', 'note'];

const out = [];
const seen = new Map();
const dropped = [];
const perUnit = [];

export function makeId(sv, pos) {
  const slug = sv
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?…:;"'’()]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${slug}.${pos}`;
}

for (const u of units) {
  const file = join(ROOT, 'vocab', `${u.id}.json`);
  if (!existsSync(file)) {
    perUnit.push(`${u.id}: (missing)`);
    continue;
  }
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  let kept = 0;
  for (const e of entries) {
    const id = makeId(e.sv, e.pos);
    if (seen.has(id)) {
      dropped.push(`${e.sv} (${e.pos}) in ${u.id} — already in ${seen.get(id)}`);
      continue;
    }
    seen.set(id, u.id);
    const clean = { ...e, id, u: u.id, ipa: e.ipa.replace(/g/g, 'ɡ').trim() };
    if (clean.tone == null) delete clean.tone;
    if (!clean.alt || !clean.alt.length) delete clean.alt;
    const ordered = {};
    for (const k of FIELDS) if (clean[k] !== undefined) ordered[k] = clean[k];
    out.push(ordered);
    kept++;
  }
  perUnit.push(`${u.id}: ${kept}`);
}

writeFileSync(join(ROOT, 'data/vocab.json'), JSON.stringify(out));
console.log(`data/vocab.json: ${out.length} entries from ${units.length} units`);
console.log(perUnit.join(' · '));
if (dropped.length) console.log(`\nDropped ${dropped.length} cross-unit duplicates:\n  ` + dropped.join('\n  '));

if (report) {
  const byEn = new Map();
  const key = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/^to /, '').trim();
  for (const e of out) for (const g of [e.en, ...(e.alt || [])]) {
    const k = key(g);
    if (!byEn.has(k)) byEn.set(k, []);
    byEn.get(k).push(`${e.sv} [${e.u}]`);
  }
  const shared = [...byEn].filter(([, v]) => new Set(v).size > 1);
  console.log(`\n${shared.length} English glosses shared by several entries (quiz distractors avoid these automatically):`);
  for (const [k, v] of shared) console.log(`  "${k}": ${[...new Set(v)].join(', ')}`);
  const svDup = new Map();
  for (const e of out) {
    const k = e.sv.toLowerCase();
    svDup.set(k, [...(svDup.get(k) || []), `${e.pos}:${e.en} [${e.u}]`]);
  }
  const homographs = [...svDup].filter(([, v]) => v.length > 1);
  console.log(`\n${homographs.length} Swedish spellings with several entries:`);
  for (const [k, v] of homographs) console.log(`  ${k}: ${v.join(' | ')}`);
}
