// The session engine: runs a queue of exercises (lesson, review, boss battle, survival, …),
// shows feedback, then applies spaced-repetition updates and rewards.
import { h, mount, confirmDialog, confetti } from './ui.js';
import { S, save } from './store.js';
import { review, newRecord, isDue } from './srs.js';
import { RENDER, exerciseFor, makeExercise, stageOf, solutionText, speakerBtn } from './exercises.js';
import { WORDS, BY_ID, UNITS, display, shuffle, unitWords, lessonWords, LESSON_SIZE, unitById } from './data.js';
import { sfx, buzz, sayWord, stopSpeaking, findNative } from './audio.js';
import { reward, track, count, countMax, checkAchievements, levelInfo, questReward, quests } from './gamify.js';

const PRAISE = ['Bra!', 'Snyggt!', 'Perfekt!', 'Toppen!', 'Utmärkt!', 'Grymt!', 'Jättebra!', 'Rätt!'];

let active = null;
export const sessionActive = () => !!active;

/**
 * cfg: {kind, title, steps, unit?, lesson?, lives?, timer?, boss?: {name, emoji, hp}, endless?: (n) => ex,
 *       pool?, goal?: number of correct answers to win (jump test), onExit?: () => void}
 */
export function startSession(cfg) {
  const root = document.getElementById('session');
  const st = {
    cfg,
    queue: [...cfg.steps],
    done: 0,
    stats: new Map(), // word id -> {mistakes, correct}
    introduced: new Set(),
    answers: 0,
    correct: 0,
    firstTry: 0,
    combo: 0,
    bestCombo: 0,
    xp: 0,
    lives: cfg.lives ?? null,
    bossHp: cfg.boss ? cfg.boss.hp : null,
    started: Date.now(),
    current: null,
    awaiting: false,
    timer: null,
    finished: false,
    retried: new Set(),
    questSnap: quests().map((q) => ({ id: q.id, n: q.n, target: q.target })),
  };
  active = st;
  document.body.classList.add('in-session');
  root.hidden = false;

  // Fetch native recordings for this session's words in the background.
  if (S.settings.native) {
    const ids = [...new Set(st.queue.flatMap((e) => (e.w ? [e.w] : e.words || [])).map((w) => w.sv))].filter((s) => !/\s/.test(s));
    (async () => {
      for (const sv of ids.slice(0, 16)) {
        if (st.finished) break;
        await findNative(sv);
      }
    })();
  }

  const top = h('div.s-top');
  const body = h('main.s-body');
  const foot = h('footer.s-foot');
  const bossBar = cfg.boss ? h('div.boss') : null;
  const timerBar = cfg.timer ? h('div.timer', h('div.fill')) : null;
  mount(root, h('div.session' + (cfg.boss ? '.boss-mode' : ''), top, bossBar, timerBar, body, foot));
  fitViewport(root);

  const ctxFor = (ex) => {
    let answered = false;
    const ctx = {
      answer: (ok, info = {}) => {
        if (answered) return;
        answered = true;
        onAnswer(ex, ok, info);
      },
      mistake: (w) => {
        statOf(w).mistakes++;
        st.combo = 0;
        drawTop();
        buzz(60);
      },
      setCheck: (fn, label = 'Check') => {
        if (st.awaiting) return;
        foot.replaceChildren(h('button.btn.wide' + (fn ? '' : '.disabled'), { type: 'button', disabled: !fn, onclick: () => fn && fn() }, label));
        st.checkFn = fn;
      },
      keys: null,
      focus: null,
    };
    return ctx;
  };

  function statOf(w) {
    if (!st.stats.has(w.id)) st.stats.set(w.id, { mistakes: 0, correct: 0 });
    return st.stats.get(w.id);
  }

  function drawTop() {
    const total = st.done + st.queue.length + (st.current ? 1 : 0);
    const pct = cfg.endless ? Math.min(1, st.correct / (cfg.goal || 50)) : total ? st.done / total : 0;
    top.replaceChildren(
      h('button.icon-btn', { type: 'button', 'aria-label': 'Quit', onclick: quit }, '✕'),
      cfg.boss
        ? h('div.s-title', cfg.title)
        : h('div.progress', h('div.fill', { style: { width: `${Math.round(pct * 100)}%` } })),
      st.lives != null ? h('div.lives', { 'aria-label': `${st.lives} lives` }, '❤️'.repeat(Math.max(0, st.lives)) + '🖤'.repeat(Math.max(0, (cfg.lives || 0) - st.lives))) : null,
      st.combo >= 3 ? h('div.combo', `🔥${st.combo}`) : cfg.endless ? h('div.combo', `★${st.correct}`) : null,
    );
    if (bossBar) {
      const pctHp = Math.max(0, st.bossHp / cfg.boss.hp);
      bossBar.replaceChildren(
        h('div.boss-emoji', cfg.boss.emoji),
        h('div.boss-info', h('div.boss-name', cfg.boss.name), h('div.hp', h('div.fill', { style: { width: `${pctHp * 100}%` } })), h('div.hp-num', `${Math.max(0, st.bossHp)} / ${cfg.boss.hp} HP`)),
      );
    }
  }

  function startTimer() {
    if (!cfg.timer) return;
    clearInterval(st.timer);
    const fill = timerBar.firstChild;
    const t0 = Date.now();
    const ms = cfg.timer * 1000;
    fill.style.width = '100%';
    fill.classList.remove('low');
    st.timer = setInterval(() => {
      const left = 1 - (Date.now() - t0) / ms;
      fill.style.width = `${Math.max(0, left) * 100}%`;
      if (left < 0.3) fill.classList.add('low');
      if (left <= 0) {
        clearInterval(st.timer);
        if (!st.awaiting && st.current) {
          body.classList.add('locked');
          st.currentCtx.answer(false, { timeout: true });
        }
      }
    }, 100);
  }

  function next() {
    if (st.finished) return;
    st.awaiting = false;
    stopSpeaking();
    if (st.lives === 0 || (cfg.boss && st.bossHp <= 0)) return finish();
    if (cfg.goal && st.correct >= cfg.goal && !cfg.endless) return finish();
    if (!st.queue.length) {
      if (cfg.endless) st.queue.push(cfg.endless(st));
      else return finish();
    }
    if (!st.queue[0]) return finish();
    st.current = st.queue.shift();
    const ex = st.current;
    if (ex.type === 'intro') st.introduced.add(ex.w.id);
    const ctx = ctxFor(ex);
    st.currentCtx = ctx;
    st.checkFn = null;
    foot.className = 's-foot';
    foot.replaceChildren();
    body.classList.remove('locked');
    const node = RENDER[ex.type](ex, ctx);
    mount(body, node);
    body.scrollTop = 0;
    if (!foot.childNodes.length && (ex.type === 'type' || ex.type === 'dictation')) ctx.setCheck(null);
    drawTop();
    if (ex.type !== 'intro') startTimer();
    if (ctx.focus) setTimeout(() => ctx.focus(), 350);
  }

  function onAnswer(ex, ok, info) {
    clearInterval(st.timer);
    // Neutral steps: new-word cards and skipped speaking exercises.
    if (ok === null) {
      st.done++;
      if (info.spoken === false && ex.w) statOf(ex.w);
      return next();
    }
    st.awaiting = true;
    st.answers++;
    const w = ex.w;
    const retry = w && st.retried.has(w.id);
    if (ex.type === 'match' && ok) ex.words.forEach((x) => statOf(x).correct++);
    if (ok) {
      st.correct++;
      st.combo++;
      st.bestCombo = Math.max(st.bestCombo, st.combo);
      if (!retry) st.firstTry++;
      if (w) statOf(w).correct++;
      let xp = retry ? 1 : 2;
      if (['type', 'dictation', 'speak', 'match'].includes(ex.type)) xp += 1;
      if (st.combo >= 5) xp += 1;
      st.xp += xp;
      if (['listen', 'dictation'].includes(ex.type)) track('listen');
      if (['type', 'dictation'].includes(ex.type)) {
        track('typed');
        count('typed');
      }
      if (ex.type === 'speak') {
        track('spoken');
        count('spoken');
      }
      track('combo', st.combo);
      if (st.combo > 0 && st.combo % 5 === 0) sfx('combo');
      else sfx('correct');
      buzz(20);
      if (cfg.boss) {
        const dmg = ['type', 'dictation', 'speak'].includes(ex.type) ? 2 : 1;
        st.bossHp -= dmg;
        bossBar.classList.remove('hit');
        void bossBar.offsetWidth;
        bossBar.classList.add('hit');
        sfx('hit');
      }
    } else {
      st.combo = 0;
      if (w) statOf(w).mistakes++;
      sfx('wrong');
      buzz([40, 60, 40]);
      if (st.lives != null) st.lives--;
      body.classList.add('shake-once');
      setTimeout(() => body.classList.remove('shake-once'), 450);
      // Requeue the word with another exercise so it must be answered correctly before the end.
      if (w && !cfg.endless && !cfg.boss && !cfg.noRequeue) {
        st.retried.add(w.id);
        const again = exerciseFor(w, Math.max(0, stageOf(S.words[w.id]) - 1), cfg.pool, ex.type);
        st.queue.splice(Math.min(st.queue.length, 2 + Math.floor(Math.random() * 3)), 0, again);
      }
    }
    st.done++;
    drawTop();
    showFeedback(ex, ok, info);
  }

  function showFeedback(ex, ok, info) {
    const w = ex.w;
    let msg;
    if (ok) {
      msg = PRAISE[Math.floor(Math.random() * PRAISE.length)];
      if (info.kind === 'accent') msg += ' Watch the accents:';
      else if (info.kind === 'typo') msg += ' Small typo:';
    } else msg = info.timeout ? '⏰ Time’s up! The answer:' : 'The correct answer:';
    const showSolution = !ok || info.kind === 'accent' || info.kind === 'typo';
    const auto = ok && (cfg.boss || cfg.endless) && !showSolution;
    foot.className = 's-foot ' + (ok ? 'ok' : 'bad');
    foot.replaceChildren(
      h(
        'div.feedback',
        h('div.fb-title', ok ? '✅ ' : '❌ ', msg),
        showSolution && w
          ? h('div.fb-sol', h('span', solutionText(ex)), speakerBtn(w))
          : w && ex.type !== 'match'
            ? h('div.fb-sub', display(w), ' — ', w.en)
            : null,
      ),
      h('button.btn.wide' + (ok ? '.ok' : '.bad'), { type: 'button', onclick: next, id: 'continue' }, auto ? 'Next' : 'Continue'),
    );
    if (w && !['match', 'sv2en', 'listen', 'speak', 'form', 'cloze'].includes(ex.type) && S.settings.autoplay) {
      setTimeout(() => sayWord(w), ok ? 150 : 300);
    }
    if (auto) st.autoTimer = setTimeout(() => st.awaiting && st.current === ex && next(), 1100);
  }

  async function quit() {
    if (st.finished) return;
    const sure = st.answers === 0 || (await confirmDialog('Quit this session?', 'You will lose the progress you made in it.', 'Quit', true));
    if (!sure) return;
    close();
    cfg.onExit && cfg.onExit(null);
  }

  function close() {
    st.finished = true;
    clearInterval(st.timer);
    clearTimeout(st.autoTimer);
    stopSpeaking();
    active = null;
    document.body.classList.remove('in-session');
    root.hidden = true;
    root.replaceChildren();
    window.removeEventListener('keydown', onKey);
  }

  function finish() {
    if (st.finished) return;
    st.finished = true;
    clearInterval(st.timer);
    const res = applyResults(st);
    mount(body, summary(st, res));
    foot.className = 's-foot';
    foot.replaceChildren(
      h(
        'button.btn.wide',
        {
          type: 'button',
          id: 'continue',
          onclick: () => {
            close();
            cfg.onExit && cfg.onExit(res);
          },
        },
        'Continue',
      ),
    );
    top.replaceChildren(h('div.s-title', cfg.title));
    if (timerBar) timerBar.remove();
    if (res.won !== false) {
      sfx('win');
      confetti();
    } else sfx('lose');
  }

  function onKey(e) {
    if (!active || active !== st) return;
    if (e.target && e.target.tagName === 'INPUT' && e.key !== 'Enter') return;
    if (e.key === 'Enter') {
      const c = document.getElementById('continue');
      if (c) {
        e.preventDefault();
        c.click();
      } else if (st.checkFn) {
        e.preventDefault();
        st.checkFn();
      }
    } else if (st.currentCtx && st.currentCtx.keys && !st.awaiting) st.currentCtx.keys(e.key);
  }
  window.addEventListener('keydown', onKey);

  next();
}

// Keep the session exactly as tall as the visible viewport so the footer stays above the phone keyboard.
let fitted = false;
function fitViewport(root) {
  const vv = window.visualViewport;
  if (!vv || fitted) return;
  fitted = true;
  const fit = () => {
    if (root.hidden) return;
    root.style.height = `${vv.height}px`;
    root.style.top = `${vv.offsetTop}px`;
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
}

// ---------- results ----------

function applyResults(st) {
  const cfg = st.cfg;
  const now = Date.now();
  const won = cfg.boss ? st.bossHp <= 0 : cfg.lives != null && !cfg.endless ? st.lives > 0 : true;
  const mistakes = [...st.stats.values()].reduce((a, s) => a + s.mistakes, 0);
  const perfect = st.answers > 0 && mistakes === 0;
  const newWords = [...st.introduced];

  // Spaced repetition: one update per word per session. Tests and arcade-style sessions only touch words
  // the learner has already met, so they never flood the review queue with unseen words.
  const learnKinds = ['lesson', 'review', 'practice', 'boss'];
  for (const id of st.introduced) if (!st.stats.has(id)) st.stats.set(id, { mistakes: 0, correct: 0 });
  for (const [id, s] of st.stats) {
    const rec = S.words[id];
    const has = rec && rec.b > 0;
    if (!has && !(learnKinds.includes(cfg.kind) && st.introduced.has(id))) continue;
    S.words[id] = review(has ? rec : newRecord(now), s, now);
  }

  let xp = st.xp;
  let kr = 0;
  const lines = [];
  if (cfg.kind === 'lesson') {
    xp += 5;
    kr += 5;
    if (perfect) {
      xp += 5;
      kr += 5;
      count('perfect');
      track('perfect');
    }
    count('lessons');
    track('lesson');
    const u = (S.units[cfg.unit] = S.units[cfg.unit] || {});
    u.lessons = Math.max(u.lessons || 0, cfg.lesson + 1);
    const hr = new Date().getHours();
    if (hr >= 22) S.counts.night = 1;
    if (hr < 7) S.counts.early = 1;
  } else if (cfg.kind === 'review' || cfg.kind === 'practice' || cfg.kind === 'lab') {
    xp += 3;
    kr += 3;
    if (cfg.kind === 'review') track('review', st.stats.size);
  } else if (cfg.kind === 'boss') {
    if (won) {
      xp += 20;
      kr += 25;
      const u = (S.units[cfg.unit] = S.units[cfg.unit] || {});
      if (!u.boss) count('bosses');
      u.boss = 1;
      lines.push(`${cfg.boss.emoji} ${cfg.boss.name} is defeated!`);
    }
  } else if (cfg.kind === 'jump') {
    if (won) {
      const u = (S.units[cfg.unit] = S.units[cfg.unit] || {});
      u.jump = 1;
      xp += 10;
      lines.push('🦘 Unit unlocked!');
    }
  } else if (cfg.kind === 'survival') {
    const prev = S.best.survival || 0;
    S.best.survival = Math.max(prev, st.correct);
    if (st.correct > prev) lines.push(`🏆 New record: ${st.correct}!`);
    kr += Math.floor(st.correct / 5);
    track('arcade');
  }
  if (newWords.length) track('new', newWords.length);
  countMax('bestCombo', st.bestCombo);
  count('answers', st.answers);
  count('correct', st.correct);

  const { levelUp, goalReached } = reward(xp, kr);
  const questsDone = quests().filter((q) => {
    const before = st.questSnap.find((b) => b.id === q.id);
    return q.n >= q.target && (!before || before.n < before.target);
  });
  const ach = checkAchievements();
  save(true);
  return { won, xp, kr, perfect, levelUp, goalReached, ach, lines, newWords, mistakes, questsDone };
}

function summary(st, r) {
  const cfg = st.cfg;
  const secs = Math.round((Date.now() - st.started) / 1000);
  const acc = st.answers ? Math.round((st.correct / st.answers) * 100) : 100;
  const weak = [...st.stats.entries()].filter(([, s]) => s.mistakes > 0).map(([id]) => BY_ID.get(id)).filter(Boolean);
  const title = cfg.boss
    ? r.won
      ? 'Victory!'
      : `${cfg.boss.name} wins this time`
    : cfg.kind === 'jump'
      ? r.won
        ? 'You passed!'
        : 'Not quite yet'
      : cfg.kind === 'survival'
        ? `Score: ${st.correct}`
        : r.perfect
          ? 'Perfect lesson!'
          : 'Lesson complete!';
  const big = cfg.boss ? (r.won ? '🏆' : cfg.boss.emoji) : r.won === false ? '💪' : r.perfect ? '🌟' : '🎉';
  return h(
    'div.summary',
    h('div.sum-emoji', big),
    h('h1', title),
    r.levelUp ? h('div.banner.level', `⬆️ Level ${r.levelUp}: ${levelInfo().sv}`) : null,
    r.goalReached ? h('div.banner.goal', '🎯 Daily goal reached! +10 kr') : null,
    ...r.lines.map((l) => h('div.banner', l)),
    h(
      'div.tiles',
      h('div.tile', h('b', `+${r.xp}`), h('span', 'XP')),
      h('div.tile', h('b', `${acc}%`), h('span', 'accuracy')),
      h('div.tile', h('b', fmtTime(secs)), h('span', 'time')),
      h('div.tile', h('b', `+${r.kr}`), h('span', 'kronor')),
    ),
    st.bestCombo >= 3 ? h('p.muted', `Best combo: 🔥 ${st.bestCombo}`) : null,
    r.newWords.length ? h('p.muted', `${r.newWords.length} new word${r.newWords.length > 1 ? 's' : ''} learned`) : null,
    r.questsDone.length ? h('div.banner.quest', `📜 Quest complete! +${questReward * r.questsDone.length} kr`) : null,
    r.ach.length
      ? h('div.ach-list', h('h3', 'Achievement unlocked'), r.ach.map((a) => h('div.ach-row', h('span.ach-icon', a.icon), h('div', h('b', a.name), h('div.muted', a.desc)), h('span.muted', '+20 kr'))))
      : null,
    weak.length
      ? h('div.weak', h('h3', 'Words to practise'), weak.slice(0, 8).map((w) => h('div.weak-row', speakerBtn(w), h('b', display(w)), h('span.muted', w.en))))
      : null,
  );
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---------- session builders ----------

function pickReview(words, n) {
  const now = Date.now();
  const score = (w) => {
    const r = S.words[w.id];
    return (isDue(r, now) ? 0 : 1) * 1e6 + (r ? r.b : 0) * 1000 + Math.random() * 1000;
  };
  return [...words].sort((a, b) => score(a) - score(b)).slice(0, n);
}

const known = (w) => (S.words[w.id]?.b || 0) > 0;

export function buildLesson(unitId, k) {
  const words = lessonWords(unitId, k);
  const pool = unitWords(unitId);
  const fresh = words.filter((w) => !known(w));
  const old = words.filter(known);
  const steps = [];
  for (let i = 0; i < fresh.length; i += 2) {
    const pair = fresh.slice(i, i + 2);
    pair.forEach((w) => steps.push({ type: 'intro', w }));
    pair.forEach((w) => steps.push(exerciseFor(w, 0, pool)));
  }
  const later = [];
  fresh.forEach((w) => later.push(exerciseFor(w, 1, pool)));
  old.forEach((w) => {
    const st = stageOf(S.words[w.id]);
    later.push(exerciseFor(w, st, pool), exerciseFor(w, Math.min(2, st + 1), pool));
  });
  const earlier = unitWords(unitId).slice(0, k * LESSON_SIZE).filter(known);
  pickReview(earlier, fresh.length ? 2 : 5).forEach((w) => later.push(exerciseFor(w, stageOf(S.words[w.id]), pool)));
  const now = Date.now();
  const dueElsewhere = WORDS.filter((w) => w.u !== unitId && isDue(S.words[w.id], now));
  pickReview(dueElsewhere, 2).forEach((w) => later.push(exerciseFor(w, stageOf(S.words[w.id]), unitWords(w.u))));
  const matchWords = (fresh.length >= 3 ? fresh : words).slice(0, 5);
  if (matchWords.length >= 3) steps.push({ type: 'match', words: matchWords });
  steps.push(...shuffle(later));
  return steps;
}

export function dueWords(now = Date.now()) {
  return WORDS.filter((w) => isDue(S.words[w.id], now)).sort((a, b) => S.words[a.id].d - S.words[b.id].d);
}

export function buildReview(limit = 15) {
  const due = dueWords().slice(0, limit);
  return due.map((w) => exerciseFor(w, stageOf(S.words[w.id]), unitWords(w.u)));
}

export function weakestWords(n = 12, unitId = null) {
  const list = (unitId ? unitWords(unitId) : WORDS).filter(known);
  const score = (w) => {
    const r = S.words[w.id];
    return r.b * 10 - r.w * 3 + r.c + Math.random() * 4;
  };
  return list.sort((a, b) => score(a) - score(b)).slice(0, n);
}

export function buildPractice(unitId) {
  const words = weakestWords(10, unitId);
  return words.map((w) => exerciseFor(w, Math.max(1, stageOf(S.words[w.id])), unitWords(w.u)));
}

export function bossConfig(unitId) {
  const u = unitById(unitId);
  const words = unitWords(unitId).filter(known);
  const list = words.length >= 6 ? words : unitWords(unitId);
  let bag = [];
  return {
    kind: 'boss',
    unit: unitId,
    title: `Boss: ${u.boss.name}`,
    boss: { ...u.boss, hp: 12 },
    lives: 3,
    timer: 20,
    steps: [],
    pool: unitWords(unitId),
    endless: () => {
      if (!bag.length) bag = shuffle(list);
      const w = bag.pop();
      return exerciseFor(w, Math.max(1, stageOf(S.words[w.id])), unitWords(unitId));
    },
  };
}

export function jumpConfig(unitIndex) {
  const u = UNITS[unitIndex];
  const earlier = UNITS.slice(0, unitIndex).flatMap((x) => unitWords(x.id));
  const words = shuffle(earlier).slice(0, 12);
  return {
    kind: 'jump',
    unit: u.id,
    title: `Jump to ${u.title}`,
    lives: 3,
    noRequeue: true,
    steps: words.map((w) => exerciseFor(w, 1, unitWords(w.u))),
  };
}

export function survivalConfig() {
  let pool = WORDS.filter(known);
  if (pool.length < 20) pool = WORDS.filter((w) => w.lvl === 'A1');
  let bag = [];
  return {
    kind: 'survival',
    title: 'Survival',
    lives: 3,
    timer: 15,
    steps: [],
    goal: 50,
    endless: (st) => {
      if (!bag.length) bag = shuffle(pool);
      const w = bag.pop();
      const stage = st.correct < 10 ? 0 : st.correct < 25 ? 1 : 2;
      return exerciseFor(w, stage, unitWords(w.u));
    },
  };
}

export function labConfig(kind) {
  let words = weakestWords(10);
  if (words.length < 5) words = shuffle(WORDS.filter((w) => w.lvl === 'A1' && !/\s/.test(w.sv))).slice(0, 10);
  const type = () => (kind === 'speak' ? 'speak' : S.settings.typing && Math.random() < 0.5 ? 'dictation' : 'listen');
  return {
    kind: 'lab',
    title: kind === 'speak' ? 'Speaking practice' : 'Listening lab',
    steps: words.map((w) => makeExercise(type(), w, unitWords(w.u))),
  };
}
