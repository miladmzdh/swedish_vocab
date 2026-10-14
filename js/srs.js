// Spaced repetition (Leitner boxes). A word record: {b: box, d: due ms, c: correct, w: wrong, l: last seen ms, i: introduced ms}
// Box 0 = not introduced. Box 1..8 = increasingly long intervals.

export const DAY = 86400000;
export const INTERVALS = [0, 0.25, 1, 3, 7, 14, 30, 60, 120]; // days, indexed by box
export const MAX_BOX = INTERVALS.length - 1;

export function newRecord(now) {
  return { b: 1, d: now, c: 0, w: 0, l: now, i: now };
}

export function isDue(rec, now) {
  return !!rec && rec.b > 0 && rec.d <= now;
}

/**
 * Apply the outcome of one session (or one standalone review) to a record.
 * mistakes = 0 → promote (only if the word was due, so cramming can't inflate boxes); otherwise demote.
 */
export function review(rec, { mistakes, correct }, now) {
  const r = rec ? { ...rec } : newRecord(now);
  r.c += correct;
  r.w += mistakes;
  r.l = now;
  if (mistakes === 0) {
    if (r.d <= now || r.b <= 1) {
      r.b = Math.min(MAX_BOX, r.b + 1);
      r.d = now + INTERVALS[r.b] * DAY;
    }
  } else {
    r.b = Math.max(1, r.b - 2);
    r.d = now + 10 * 60000;
  }
  return r;
}

// Mastery tiers used across the UI.
export function tier(rec) {
  if (!rec || rec.b === 0) return 'new';
  if (rec.b <= 2) return 'learning';
  if (rec.b <= 4) return 'familiar';
  return 'mastered';
}

export const TIER_LABEL = { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' };
