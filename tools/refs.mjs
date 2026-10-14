// Shared loader for the open reference data in tools/ref (see fetch-refs.sh).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REF = join(dirname(fileURLToPath(import.meta.url)), 'ref');

function read(name) {
  const p = join(REF, name);
  if (!existsSync(p)) {
    console.error(`Missing ${p}. Run tools/fetch-refs.sh first.`);
    process.exit(2);
  }
  return readFileSync(p, 'utf8');
}

let cache = null;

export function loadRefs() {
  if (cache) return cache;
  const wikipron = new Map(); // word -> [{ipa, tone}]
  for (const file of ['swe_broad.tsv', 'swe_narrow.tsv']) {
    for (const line of read(file).split('\n')) {
      if (!line) continue;
      const [word, pron] = line.split('\t');
      if (!pron) continue;
      const tone = pron.trim().startsWith('²') ? 2 : null;
      const ipa = pron.replace(/^²\s*/, '').replace(/ /g, '');
      const key = word.toLowerCase();
      if (!wikipron.has(key)) wikipron.set(key, []);
      wikipron.get(key).push({ ipa, tone, src: file.includes('narrow') ? 'wikipron-narrow' : 'wikipron' });
    }
  }
  const ipadict = new Map();
  for (const line of read('ipadict_sv.txt').split('\n')) {
    if (!line) continue;
    const [word, prons] = line.split('\t');
    if (!prons) continue;
    const list = prons.split(',').map((p) => p.trim().replace(/^\/|\/$/g, ''));
    ipadict.set(
      word.toLowerCase(),
      list.map((p) => ({ ipa: p.replace(/²/g, ''), tone: p.includes('²') ? 2 : null, src: 'ipa-dict' })),
    );
  }
  const freq = new Map();
  read('sv_50k.txt')
    .split('\n')
    .forEach((line, i) => {
      const w = line.split(' ')[0];
      if (w && !freq.has(w)) freq.set(w, i + 1);
    });
  cache = { wikipron, ipadict, freq };
  return cache;
}

// Normalise IPA so that notational differences between sources don't count as mismatches.
export function normIpa(ipa, loose = false) {
  let s = ipa.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[\/\[\]\sˈˌ'²¹.‿()-]/g, '');
  s = s
    .replace(/ɡ/g, 'g')
    .replace(/[ɹɾ]/g, 'r')
    .replace(/ʈ/g, 'rt')
    .replace(/ɖ/g, 'rd')
    .replace(/ɳ/g, 'rn')
    .replace(/ʂ/g, 'rs')
    .replace(/ɭ/g, 'rl')
    .replace(/r+/g, 'r');
  if (loose) s = s.replace(/ː/g, '');
  return s;
}

export function refsFor(word) {
  const { wikipron, ipadict, freq } = loadRefs();
  const key = word.toLowerCase();
  const prons = [...(wikipron.get(key) || []), ...(ipadict.get(key) || [])];
  const tokens = key.split(/\s+/);
  const ranks = tokens.map((t) => freq.get(t) ?? null);
  return { prons, ranks };
}

// Compare a candidate IPA/tone against the references.
// Returns {status: 'match'|'length-only'|'mismatch'|'no-ref', refs, toneRefs}
export function compareIpa(word, ipa) {
  const { prons } = refsFor(word);
  if (!prons.length) return { status: 'no-ref', refs: [] };
  const exact = prons.some((p) => normIpa(p.ipa) === normIpa(ipa));
  if (exact) return { status: 'match', refs: prons };
  const loose = prons.some((p) => normIpa(p.ipa, true) === normIpa(ipa, true));
  return { status: loose ? 'length-only' : 'mismatch', refs: prons };
}
