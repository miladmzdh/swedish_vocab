// Answer checking for typed Swedish. Pure functions (unit-tested in tests/answer.test.mjs).

const PUNCT = /[.,!?¿¡;:"'’‘“”«»()…–—]/g;

export function norm(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(/-/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fold(s) {
  return norm(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Strip an optional leading article / infinitive marker that learners often type.
function stripLead(s) {
  return s.replace(/^(en|ett|att)\s+/, '');
}

/**
 * Compare a typed answer with the accepted answers.
 * @param {string} input
 * @param {string[]} accepted  first entry is the canonical answer
 * @param {{isOtherWord?: (s: string) => boolean}} [opts]
 * @returns {{ok: boolean, kind: 'exact'|'accent'|'typo'|'wrong', expected: string}}
 */
export function checkTyped(input, accepted, opts = {}) {
  const expected = accepted[0];
  const raw = norm(input);
  if (!raw) return { ok: false, kind: 'wrong', expected };
  const cand = [raw, stripLead(raw)];
  const targets = accepted.flatMap((a) => [norm(a), stripLead(norm(a))]);

  if (cand.some((c) => targets.includes(c))) return { ok: true, kind: 'exact', expected };

  // A real, different Swedish word (e.g. "far" for "får") is never accepted as a typo.
  if (opts.isOtherWord && cand.some((c) => opts.isOtherWord(c))) return { ok: false, kind: 'wrong', expected };

  const fc = cand.map(fold);
  const ft = targets.map(fold);
  if (fc.some((c) => ft.includes(c))) return { ok: true, kind: 'accent', expected };

  for (const c of cand) {
    for (const t of targets) {
      const max = t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0;
      if (max && lev(fold(c), fold(t)) <= max) return { ok: true, kind: 'typo', expected };
    }
  }
  return { ok: false, kind: 'wrong', expected };
}

// Lenient comparison for speech-recognition transcripts.
export function checkSpoken(transcripts, target) {
  const t = fold(target);
  for (const raw of transcripts) {
    const s = fold(raw);
    if (!s) continue;
    if (s === t || stripLead(s) === t) return true;
    if (` ${s} `.includes(` ${t} `)) return true;
    const max = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0;
    if (lev(s, t) <= max) return true;
  }
  return false;
}
