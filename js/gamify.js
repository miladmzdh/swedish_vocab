// XP, levels, coins (kronor), achievements and daily quests.
import { S, addXp, addCoins, totalXp, todayXp, streak, dayKey, coins } from './store.js';
import { UNITS, WORDS, lessonCount, unitWords } from './data.js';
import { speechRecognitionSupported } from './audio.js';

// ---------- levels ----------

const T = (L) => 20 * L * (L - 1); // total XP needed to reach level L
const TITLES = [
  [1, 'Nybörjare', 'Beginner'],
  [3, 'Turist', 'Tourist'],
  [5, 'Fikaälskare', 'Fika lover'],
  [8, 'Stugägare', 'Cabin owner'],
  [12, 'Midsommarfirare', 'Midsummer reveller'],
  [16, 'Viking', 'Viking'],
  [20, 'Språkgeni', 'Language genius'],
  [25, 'Riksmästare', 'National champion'],
  [30, 'Legend', 'Legend'],
];

export function levelInfo(xp = totalXp()) {
  let L = 1;
  while (T(L + 1) <= xp) L++;
  const [, sv, en] = [...TITLES].reverse().find(([l]) => L >= l);
  return { level: L, cur: T(L), next: T(L + 1), pct: (xp - T(L)) / (T(L + 1) - T(L)), sv, en };
}

// ---------- word stats ----------

export function wordStats() {
  let seen = 0,
    learned = 0,
    mastered = 0;
  for (const w of WORDS) {
    const r = S.words[w.id];
    if (!r || !r.b) continue;
    seen++;
    if (r.b >= 2) learned++;
    if (r.b >= 5) mastered++;
  }
  return { seen, learned, mastered, total: WORDS.length };
}

export const count = (k, n = 1) => (S.counts[k] = (S.counts[k] || 0) + n);
export const countMax = (k, n) => (S.counts[k] = Math.max(S.counts[k] || 0, n));

// ---------- achievements ----------

const unitsWithStars = (n) => UNITS.filter((u) => unitStars(u.id) >= n).length;

export const ACHIEVEMENTS = [
  ['first', '🌱', 'First steps', 'Finish your first lesson', () => (S.counts.lessons || 0) >= 1],
  ['lessons10', '📚', 'Bookworm', 'Finish 10 lessons', () => (S.counts.lessons || 0) >= 10],
  ['lessons50', '🎒', 'Dedicated', 'Finish 50 lessons', () => (S.counts.lessons || 0) >= 50],
  ['lessons150', '🏛️', 'Scholar', 'Finish 150 lessons', () => (S.counts.lessons || 0) >= 150],
  ['words25', '🌿', 'Sprouting', 'Learn 25 words', () => wordStats().learned >= 25],
  ['words100', '🌳', 'Growing', 'Learn 100 words', () => wordStats().learned >= 100],
  ['words500', '🌲', 'Forest', 'Learn 500 words', () => wordStats().learned >= 500],
  ['words1000', '🏔️', 'Mountain', 'Learn 1000 words', () => wordStats().learned >= 1000],
  ['mastered50', '💎', 'Diamond mind', 'Master 50 words', () => wordStats().mastered >= 50],
  ['mastered300', '👁️', 'Total recall', 'Master 300 words', () => wordStats().mastered >= 300],
  ['streak3', '🔥', 'On fire', 'Reach a 3-day streak', () => streak() >= 3],
  ['streak7', '🗓️', 'One week', 'Reach a 7-day streak', () => streak() >= 7],
  ['streak30', '🌋', 'Unstoppable', 'Reach a 30-day streak', () => streak() >= 30],
  ['streak100', '☄️', 'Legendary', 'Reach a 100-day streak', () => streak() >= 100],
  ['perfect', '🎯', 'Bullseye', 'Finish a lesson without a mistake', () => (S.counts.perfect || 0) >= 1],
  ['perfect10', '🏹', 'Sharpshooter', '10 perfect lessons', () => (S.counts.perfect || 0) >= 10],
  ['combo20', '⚡', 'Lightning', 'Get 20 right in a row', () => (S.counts.bestCombo || 0) >= 20],
  ['boss1', '⚔️', 'Monster slayer', 'Defeat your first boss', () => (S.counts.bosses || 0) >= 1],
  ['boss10', '🛡️', 'Hero', 'Defeat 10 bosses', () => (S.counts.bosses || 0) >= 10],
  ['star3', '🌟', 'Gold star', 'Get 3 stars in a unit', () => unitsWithStars(3) >= 1],
  ['allunits', '👑', 'Kung av Sverige', 'Defeat every boss', () => UNITS.length > 0 && unitsWithStars(2) === UNITS.length],
  ['blitz25', '⏱️', 'Speed demon', 'Score 25 in Blitz', () => (S.best.blitz || 0) >= 25],
  ['survival25', '❤️‍🔥', 'Survivor', 'Score 25 in Survival', () => (S.best.survival || 0) >= 25],
  ['gender30', '⚖️', 'En eller ett', 'Score 30 in Gender Rush', () => (S.best.gender || 0) >= 30],
  ['match', '🧩', 'Matchmaker', 'Win Match Madness', () => (S.best.match || 0) >= 1],
  ['typist', '⌨️', 'Typist', 'Type 100 correct answers', () => (S.counts.typed || 0) >= 100],
  ['speaker', '🎙️', 'Talar svenska', 'Say 10 words correctly out loud', () => (S.counts.spoken || 0) >= 10],
  ['night', '🦉', 'Night owl', 'Finish a lesson after 22:00', () => !!S.counts.night],
  ['early', '🐓', 'Early bird', 'Finish a lesson before 07:00', () => !!S.counts.early],
  ['goal7', '✅', 'Goal getter', 'Hit your daily goal on 7 days', () => (S.counts.goalDays || 0) >= 7],
  ['level10', '🏅', 'Level 10', 'Reach level 10', () => levelInfo().level >= 10],
  ['rich', '💰', 'Rik', 'Earn 500 kr', () => S.coinsEarned >= 500],
  ['shopper', '🛍️', 'Shopaholic', 'Buy something in the shop', () => S.coinsSpent > 0],
  ['backup', '💾', 'Safe and sound', 'Back up your progress', () => S.lastBackup > 0 || S.lastSync > 0],
].map(([id, icon, name, desc, test]) => ({ id, icon, name, desc, test }));

/** Unlock any newly earned achievements; returns them (each pays 20 kr). */
export function checkAchievements() {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (S.ach[a.id]) continue;
    let ok = false;
    try {
      ok = a.test();
    } catch {}
    if (ok) {
      S.ach[a.id] = Date.now();
      addCoins(20);
      fresh.push(a);
    }
  }
  return fresh;
}

// ---------- unit progress ----------

export function unitProgress(id) {
  const u = S.units[id] || {};
  const n = lessonCount(id);
  const done = Math.min(u.lessons || 0, n);
  const words = unitWords(id);
  const strong = words.filter((w) => (S.words[w.id]?.b || 0) >= 4).length;
  return { lessons: done, total: n, boss: !!u.boss, strong, words: words.length };
}

export function unitStars(id) {
  const p = unitProgress(id);
  let s = 0;
  if (p.total && p.lessons >= p.total) s = 1;
  if (s && p.boss) s = 2;
  if (s === 2 && p.words && p.strong / p.words >= 0.8) s = 3;
  return s;
}

export function unitUnlocked(index) {
  if (index === 0 || S.settings.freeMode) return true;
  const u = UNITS[index];
  if (S.units[u.id]?.jump || (S.units[u.id]?.lessons || 0) > 0) return true;
  const prev = UNITS[index - 1];
  const p = unitProgress(prev.id);
  return p.lessons >= Math.ceil(p.total / 2) || p.boss;
}

// ---------- daily quests ----------

const QUESTS = [
  { id: 'lessons', text: 'Finish 2 lessons', metric: 'lesson', target: 2 },
  { id: 'perfect', text: 'Finish a lesson with no mistakes', metric: 'perfect', target: 1 },
  { id: 'combo', text: 'Get 8 right in a row', metric: 'combo', target: 8, max: true },
  { id: 'listen', text: 'Answer 8 listening questions', metric: 'listen', target: 8 },
  { id: 'type', text: 'Type 8 words correctly', metric: 'typed', target: 8 },
  { id: 'new', text: 'Learn 6 new words', metric: 'new', target: 6 },
  { id: 'review', text: 'Review 10 words', metric: 'review', target: 10 },
  { id: 'arcade', text: 'Play 2 arcade games', metric: 'arcade', target: 2 },
  { id: 'gender', text: 'Score 12 in Gender Rush', metric: 'gender', target: 12, max: true },
  { id: 'speak', text: 'Say 5 words out loud', metric: 'spoken', target: 5, needsSpeech: true },
];
const QUEST_REWARD = 15;

function seeded(str) {
  let x = 2166136261;
  for (const ch of str) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return () => {
    x = Math.imul(x ^ (x >>> 15), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^= x >>> 16) >>> 0) / 4294967296;
  };
}

export function quests() {
  const day = dayKey();
  if (!S.quests || S.quests.day !== day) {
    const rnd = seeded(day);
    const pool = QUESTS.filter((q) => !q.needsSpeech || (speechRecognitionSupported() && S.settings.speaking));
    const chosen = [];
    while (chosen.length < 3 && pool.length) chosen.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    S.quests = { day, items: chosen.map((q) => ({ id: q.id, n: 0 })), chest: false };
  }
  return S.quests.items.map((it) => ({ ...QUESTS.find((q) => q.id === it.id), ...it })).filter((q) => q.metric);
}

/** Record progress towards today's quests. Returns quests completed by this call. */
export function track(metric, amount = 1) {
  const done = [];
  for (const q of quests()) {
    if (q.metric !== metric) continue;
    const it = S.quests.items.find((i) => i.id === q.id);
    if (it.n >= q.target) continue;
    it.n = q.max ? Math.max(it.n, amount) : it.n + amount;
    if (it.n >= q.target) {
      it.n = q.target;
      addCoins(QUEST_REWARD);
      done.push(q);
    }
  }
  if (done.length && quests().every((q) => q.n >= q.target) && !S.quests.chest) {
    S.quests.chest = true;
    addCoins(25);
  }
  return done;
}

export const questReward = QUEST_REWARD;

// ---------- rewards ----------

/** Give XP and coins; tracks the daily goal. Returns {levelUp, goalReached}. */
export function reward(xp, kr = 0) {
  const before = levelInfo().level;
  const goal = S.settings.dailyGoal;
  const hadGoal = todayXp() >= goal;
  addXp(xp);
  if (kr) addCoins(kr);
  const goalReached = !hadGoal && todayXp() >= goal;
  if (goalReached) {
    count('goalDays');
    addCoins(10);
  }
  if (xp) track('xp', xp);
  const after = levelInfo().level;
  return { levelUp: after > before ? after : 0, goalReached };
}

export { coins };
