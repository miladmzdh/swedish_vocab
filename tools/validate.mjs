#!/usr/bin/env node
// Validates vocabulary topic files (JSON arrays of entries) against the schema in tools/VOCAB_STYLE.md
// and cross-checks every pronunciation against the open reference data.
//   node tools/validate.mjs path/to/topic.json [more.json ...] [--quiet]
// Exit code 1 when there are schema errors. Warnings need a human/agent decision, not a blind fix.
import { readFileSync } from 'node:fs';
import { compareIpa, refsFor } from './refs.mjs';

const POS = ['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'num', 'interj', 'det', 'phrase'];
const LEVELS = ['A1', 'A2', 'B1', 'B2'];
const VOWELS = 'iɪyʏeɛøœæʉɵuʊoɔɑaə';
const IPA_OK = new RegExp(`^[${VOWELS}pbtdkgɡfvsʂɕɧhmnŋlrjʈɖɳɭwzː ˈˌ]+$`);
const MODALS = new Set(['kan', 'ska', 'vill', 'måste', 'bör', 'må', 'lär', 'torde', 'skall']);

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('usage: node tools/validate.mjs <topic.json> [...] [--quiet]');
  process.exit(1);
}

const syllables = (ipa) => [...ipa].filter((c) => VOWELS.includes(c)).length;
let totalErrors = 0;

for (const file of files) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`✗ ${file}: not valid JSON — ${e.message}`);
    totalErrors++;
    continue;
  }
  if (!Array.isArray(data)) {
    console.log(`✗ ${file}: top level must be an array of entries`);
    totalErrors++;
    continue;
  }
  const errors = [];
  const warnings = [];
  const pron = [];
  const stats = { match: 0, 'length-only': 0, mismatch: 0, 'no-ref': 0 };
  const seen = new Set();

  data.forEach((e, i) => {
    const tag = `#${i} ${e?.sv ?? '?'}`;
    const err = (m) => errors.push(`${tag}: ${m}`);
    const warn = (m) => warnings.push(`${tag}: ${m}`);
    if (!e || typeof e !== 'object') return err('entry must be an object');

    for (const k of ['sv', 'en', 'pos', 'ipa', 'ex', 'exEn', 'lvl'])
      if (typeof e[k] !== 'string' || !e[k].trim()) err(`missing/empty "${k}"`);
    const allowed = new Set(['sv', 'en', 'alt', 'pos', 'g', 'f', 'ipa', 'tone', 'ex', 'exEn', 'lvl', 'note']);
    for (const k of Object.keys(e)) if (!allowed.has(k)) err(`unknown field "${k}"`);
    if (typeof e.sv !== 'string') return;

    const key = `${e.sv.toLowerCase()}|${e.pos}`;
    if (seen.has(key)) err('duplicate sv+pos in this file');
    seen.add(key);

    if (!POS.includes(e.pos)) err(`pos must be one of ${POS.join(', ')}`);
    if (!LEVELS.includes(e.lvl)) err(`lvl must be one of ${LEVELS.join(', ')}`);
    if (e.alt !== undefined && (!Array.isArray(e.alt) || e.alt.some((a) => typeof a !== 'string' || !a.trim())))
      err('alt must be an array of non-empty strings');
    if (e.note !== undefined && (typeof e.note !== 'string' || !e.note.trim())) err('note must be a non-empty string');
    if (typeof e.en === 'string' && /[.]$/.test(e.en.trim())) warn('en should not end with a period');
    if (e.sv !== e.sv.trim() || /\s{2,}/.test(e.sv)) err('sv has stray whitespace');

    // Forms
    const formLen = { noun: 3, verb: 4, adj: 4 }[e.pos];
    if (formLen) {
      if (!Array.isArray(e.f) || e.f.length !== formLen || e.f.some((x) => x !== null && (typeof x !== 'string' || !x.trim())))
        err(`f must be an array of ${formLen} strings/nulls for ${e.pos}`);
    } else if (e.f !== undefined && e.f !== null) err(`f is only for noun/verb/adj`);

    if (e.pos === 'noun') {
      if (!['en', 'ett', 'pl'].includes(e.g)) err('nouns need g: "en" | "ett" | "pl"');
      const def = Array.isArray(e.f) ? e.f[0] : null;
      if (def && e.g === 'en' && !/n$/.test(def)) warn(`en-word but definite "${def}" doesn't end in -n`);
      if (def && e.g === 'ett' && !/t$/.test(def)) warn(`ett-word but definite "${def}" doesn't end in -t`);
      if (Array.isArray(e.f) && e.f[2] && !/[an]$/.test(e.f[2])) warn(`definite plural "${e.f[2]}" looks odd`);
    } else if (e.g !== undefined) err('g is only for nouns');

    if (e.pos === 'verb' && Array.isArray(e.f)) {
      const [pres, , sup] = e.f;
      const head = (s) => s?.split(' ')[0];
      if (pres && !/r$/.test(head(pres)) && !MODALS.has(head(pres))) warn(`present "${pres}" doesn't end in -r`);
      if (sup && !/t$/.test(head(sup))) warn(`supine "${sup}" doesn't end in -t`);
    }

    // Example sentence
    if (typeof e.ex === 'string') {
      const marks = e.ex.match(/\{[^{}]+\}/g) || [];
      if (marks.length !== 1 || (e.ex.match(/[{}]/g) || []).length !== 2)
        err('ex must contain exactly one {marked} word/phrase');
      if (!/[.!?…"”]$/.test(e.ex.replace(/[{}]/g, '').trim())) warn('ex should end with punctuation');
    }
    if (typeof e.exEn === 'string' && /[{}]/.test(e.exEn)) err('exEn must not contain braces');

    // Pronunciation
    if (typeof e.ipa === 'string') {
      const ipa = e.ipa;
      if (!IPA_OK.test(ipa)) {
        const bad = [...new Set([...ipa].filter((c) => !IPA_OK.test(c)))].join(' ');
        err(`ipa has unexpected symbols: ${bad} (no slashes/brackets; see VOCAB_STYLE.md)`);
      }
      if (/r[tdnsl]/.test(ipa)) warn(`ipa has r+t/d/n/s/l — Central Standard Swedish uses retroflex ʈ ɖ ɳ ʂ ɭ`);
      const single = !/\s/.test(e.sv) && e.pos !== 'phrase';
      const syl = syllables(ipa);
      if (single) {
        if (e.tone !== 1 && e.tone !== 2) err('single words need tone: 1 or 2');
        if (e.tone === 2 && syl < 2) err('tone 2 needs at least two syllables');
        if (syl >= 2 && !ipa.includes('ˈ')) err('polysyllabic ipa needs a ˈ primary stress mark');
        if (syl === 1 && ipa.includes('ˈ')) warn('monosyllable: drop the ˈ stress mark');
      } else if (e.tone !== undefined && e.tone !== null && e.tone !== 1 && e.tone !== 2) err('tone must be 1, 2 or null');

      const cmp = compareIpa(e.sv, ipa);
      stats[cmp.status]++;
      const toneRefs = cmp.refs.filter((r) => r.tone === 2);
      const ipadict = cmp.refs.filter((r) => r.src === 'ipa-dict');
      const refStr = () => cmp.refs.map((r) => `${r.src}:${r.tone === 2 ? '²' : ''}${r.ipa}`).join('  ');
      if (cmp.status === 'mismatch' || cmp.status === 'length-only')
        pron.push(`${tag}: ours ${e.tone === 2 ? '²' : ''}${ipa} — ${cmp.status} — refs ${refStr()}`);
      if (single && syl >= 2) {
        if (e.tone === 1 && toneRefs.length) pron.push(`${tag}: tone 1 but refs mark accent 2 — ${refStr()}`);
        if (e.tone === 2 && ipadict.length && !ipadict.some((r) => r.tone === 2) && !toneRefs.length)
          pron.push(`${tag}: tone 2 but refs show no accent-2 mark — ${refStr()}`);
      }
    }
    if (single(e)) {
      const { ranks } = refsFor(e.sv);
      if (ranks[0] == null) warn('not in the 50k frequency list — is it common enough / spelled right?');
    }
  });

  totalErrors += errors.length;
  const ok = errors.length === 0 ? '✓' : '✗';
  console.log(
    `${ok} ${file}: ${data.length} entries · ${errors.length} errors · ${warnings.length} warnings · pronunciation vs refs: ` +
      `${stats.match} match, ${stats['length-only']} length-only, ${stats.mismatch} differ, ${stats['no-ref']} no ref`,
  );
  for (const m of errors) console.log(`  ERROR ${m}`);
  if (!quiet) {
    for (const m of pron) console.log(`  PRON  ${m}`);
    for (const m of warnings) console.log(`  WARN  ${m}`);
  }
}

function single(e) {
  return e && typeof e.sv === 'string' && !/\s/.test(e.sv) && e.pos !== 'phrase';
}

process.exit(totalErrors ? 1 : 0);
