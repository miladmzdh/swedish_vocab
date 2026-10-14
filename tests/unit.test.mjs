// Unit tests for the pure logic: answer checking, spaced repetition, streaks and backup merging.
//   node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTyped, checkSpoken, norm } from '../js/answer.js';
import { review, newRecord, isDue, tier, DAY } from '../js/srs.js';
import { merge, defaultState, streak, applyFreezes, addDays } from '../js/store.js';

test('typed answers: exact, article, punctuation and case', () => {
  assert.equal(checkTyped('hund', ['hund', 'en hund']).kind, 'exact');
  assert.equal(checkTyped('En Hund', ['hund', 'en hund']).kind, 'exact');
  assert.equal(checkTyped('att äta', ['äta', 'att äta']).kind, 'exact');
  assert.equal(checkTyped('hur mår du', ['Hur mår du?']).kind, 'exact');
  assert.equal(checkTyped('  Tack så mycket! ', ['tack så mycket']).kind, 'exact');
});

test('typed answers: missing accents and small typos are accepted with a warning', () => {
  assert.deepEqual(
    [checkTyped('gata', ['gata']).ok, checkTyped('smorgas', ['smörgås']).kind, checkTyped('sjukskoterska', ['sjuksköterska']).kind],
    [true, 'accent', 'accent'],
  );
  assert.equal(checkTyped('kylskap', ['kylskåp']).kind, 'accent');
  assert.equal(checkTyped('flika', ['flicka']).kind, 'typo');
  assert.equal(checkTyped('ja', ['nej']).ok, false);
  assert.equal(checkTyped('', ['hej']).ok, false);
});

test('typed answers: a different real word is never treated as a typo', () => {
  const words = new Set(['far', 'får']);
  const res = checkTyped('far', ['får'], { isOtherWord: (s) => words.has(s) && s !== 'får' });
  assert.equal(res.ok, false);
});

test('spoken answers', () => {
  assert.ok(checkSpoken(['Sjuksköterska'], 'sjuksköterska'));
  assert.ok(checkSpoken(['en hund'], 'hund'));
  assert.ok(checkSpoken(['jag sa hej'], 'hej'));
  assert.ok(!checkSpoken(['katt'], 'hund'));
  assert.equal(norm('Hej då!'), 'hej då');
});

test('spaced repetition promotes only when due and demotes on mistakes', () => {
  const t0 = Date.UTC(2026, 0, 1);
  let r = newRecord(t0);
  assert.ok(isDue(r, t0));
  r = review(r, { mistakes: 0, correct: 2 }, t0);
  assert.equal(r.b, 2);
  assert.equal(r.d, t0 + DAY);
  // Reviewing again before it is due does not inflate the box.
  const early = review(r, { mistakes: 0, correct: 1 }, t0 + 1000);
  assert.equal(early.b, 2);
  r = review(r, { mistakes: 0, correct: 1 }, t0 + DAY);
  assert.equal(r.b, 3);
  r = review(r, { mistakes: 1, correct: 0 }, t0 + 5 * DAY);
  assert.equal(r.b, 1);
  assert.ok(r.d < t0 + 5 * DAY + 3600000);
  assert.equal(tier(r), 'learning');
  assert.equal(tier({ b: 6 }), 'mastered');
});

test('streaks count consecutive active days and freezes cover gaps', () => {
  const today = '2026-03-10';
  const s = defaultState();
  s.days = { '2026-03-08': 20, '2026-03-09': 10, '2026-03-10': 5 };
  assert.equal(streak(s, today), 3);
  s.days = { '2026-03-08': 20, '2026-03-09': 10 };
  assert.equal(streak(s, today), 2, 'yesterday still counts until today ends');
  s.days = { '2026-03-06': 20 };
  s.freezes = 3;
  assert.equal(applyFreezes(s, today), 3);
  assert.equal(s.freezes, 0);
  assert.equal(streak(s, today), 4);
  const s2 = defaultState();
  s2.days = { '2026-03-01': 20 };
  s2.freezes = 1;
  assert.equal(applyFreezes(s2, today), 0, 'not enough freezes: keep them');
  assert.equal(s2.freezes, 1);
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('merge keeps the best of two devices', () => {
  const a = defaultState();
  const b = defaultState();
  a.updated = 1;
  b.updated = 2;
  a.days = { '2026-01-01': 30, '2026-01-02': 10 };
  b.days = { '2026-01-02': 40, '2026-01-03': 5 };
  a.words = { 'hund.noun': { b: 3, d: 0, c: 4, w: 0, l: 100, i: 1 }, 'katt.noun': { b: 2, d: 0, c: 1, w: 0, l: 50, i: 1 } };
  b.words = { 'hund.noun': { b: 1, d: 0, c: 5, w: 1, l: 200, i: 1 }, 'häst.noun': { b: 4, d: 0, c: 9, w: 0, l: 10, i: 1 } };
  a.ach = { first: 10 };
  b.ach = { first: 5, streak3: 7 };
  a.best = { blitz: 12 };
  b.best = { blitz: 9, gender: 20 };
  a.owned = ['🦊', '🐻'];
  b.owned = ['🦊', '🦉'];
  const m = merge(a, b);
  assert.deepEqual(m.days, { '2026-01-01': 30, '2026-01-02': 40, '2026-01-03': 5 });
  assert.equal(m.words['hund.noun'].l, 200, 'most recently practised record wins');
  assert.ok(m.words['katt.noun'] && m.words['häst.noun']);
  assert.deepEqual(m.ach, { first: 5, streak3: 7 });
  assert.deepEqual(m.best, { blitz: 12, gender: 20 });
  assert.deepEqual(new Set(m.owned), new Set(['🦊', '🐻', '🦉']));
  // Merging is symmetric for progress data.
  const m2 = merge(b, a);
  assert.deepEqual(m2.days, m.days);
  assert.deepEqual(Object.keys(m2.words).sort(), Object.keys(m.words).sort());
});
