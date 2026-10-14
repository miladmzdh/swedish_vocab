// Vocabulary and unit data, plus small helpers for showing words.

export let UNITS = [];
export let WORDS = [];
export const BY_ID = new Map();
export const BY_UNIT = new Map();
export const SV_FORMS = new Set(); // every headword and inflected form, normalised, for "is this a real other word?"

export const LESSON_SIZE = 5;

export async function loadData() {
  const [units, words] = await Promise.all([
    fetch('data/units.json').then((r) => r.json()),
    fetch('data/vocab.json').then((r) => r.json()),
  ]);
  setData(units, words);
}

export function setData(units, words) {
  UNITS = units;
  WORDS = words;
  BY_ID.clear();
  BY_UNIT.clear();
  SV_FORMS.clear();
  for (const u of units) BY_UNIT.set(u.id, []);
  for (const w of words) {
    BY_ID.set(w.id, w);
    if (!BY_UNIT.has(w.u)) BY_UNIT.set(w.u, []);
    BY_UNIT.get(w.u).push(w);
    SV_FORMS.add(w.sv.toLowerCase());
    for (const f of w.f || []) if (f) SV_FORMS.add(f.toLowerCase());
  }
  UNITS = units.filter((u) => BY_UNIT.get(u.id)?.length);
}

export const unitById = (id) => UNITS.find((u) => u.id === id);
export const unitWords = (id) => BY_UNIT.get(id) || [];
export const lessonCount = (id) => Math.ceil(unitWords(id).length / LESSON_SIZE);
export const lessonWords = (id, k) => unitWords(id).slice(k * LESSON_SIZE, (k + 1) * LESSON_SIZE);

export function prefix(w) {
  if (w.pos === 'noun' && (w.g === 'en' || w.g === 'ett')) return w.g;
  if (w.pos === 'verb') return 'att';
  return '';
}

export function display(w) {
  const p = prefix(w);
  return p ? `${p} ${w.sv}` : w.sv;
}

// Text for speech synthesis: say nouns with their article, it helps learners hear en/ett.
export function speakText(w) {
  return w.pos === 'noun' && w.g !== 'pl' ? display(w) : w.sv;
}

export const POS_LABEL = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  num: 'number',
  interj: 'interjection',
  det: 'determiner',
  phrase: 'phrase',
};

export const FORM_LABELS = {
  noun: ['the …', 'plural', 'the … (plural)'],
  verb: ['present', 'past', 'supine (har …)', 'imperative'],
  adj: ['ett-form', 'plural/definite', 'comparative', 'superlative'],
};

// Example sentence split around the {marked} word.
export function splitExample(w) {
  const m = w.ex.match(/^(.*?)\{([^}]+)\}(.*)$/s);
  if (!m) return { before: w.ex, word: '', after: '' };
  return { before: m[1], word: m[2], after: m[3] };
}

export const plainExample = (w) => w.ex.replace(/[{}]/g, '');

export function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Words that share an English meaning would make a multiple-choice question unfair.
const enKey = (s) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/^to /, '')
    .replace(/^(a|an|the) /, '')
    .trim();

export function meaningsOverlap(a, b) {
  const A = new Set([a.en, ...(a.alt || [])].flatMap((s) => s.split(/[;,/]/)).map(enKey).filter(Boolean));
  return [b.en, ...(b.alt || [])].flatMap((s) => s.split(/[;,/]/)).map(enKey).some((k) => A.has(k));
}

/** Pick n distractor words for `w`, preferring same part of speech, never sharing a meaning or spelling. */
export function distractors(w, n, pool = WORDS, key = (x) => x.sv) {
  const bad = (x) => x.id === w.id || key(x).toLowerCase() === key(w).toLowerCase() || meaningsOverlap(w, x);
  const same = shuffle(pool.filter((x) => x.pos === w.pos && !bad(x)));
  const out = [];
  const seen = new Set([key(w).toLowerCase()]);
  for (const x of [...same, ...shuffle(WORDS.filter((x) => x.pos === w.pos && !bad(x))), ...shuffle(WORDS.filter((x) => !bad(x)))]) {
    const k = key(x).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= n) break;
  }
  return out;
}
