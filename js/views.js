// Screens: learning path, unit sheet, practice hub, word browser, profile, shop, settings, sound guide.
import { h, mount, sheet, toast, confirmDialog, confetti, fmtNum, ago } from './ui.js';
import { S, save, streak, todayXp, totalXp, coins, spendCoins, storageOk, requestPersist, defaultState, replaceState, dayKey, addDays } from './store.js';
import { UNITS, WORDS, BY_ID, display, unitWords, lessonCount, unitById, POS_LABEL } from './data.js';
import { tier, TIER_LABEL } from './srs.js';
import { levelInfo, wordStats, unitProgress, unitStars, unitUnlocked, quests, ACHIEVEMENTS, questReward } from './gamify.js';
import { startSession, buildLesson, buildReview, buildPractice, bossConfig, jumpConfig, survivalConfig, labConfig, dueWords, weakestWords } from './session.js';
import { blitz, genderRush, matchMadness } from './arcade.js';
import { wordCard, speakerBtn, canListen } from './exercises.js';
import { speak, swedishVoices, onVoices, ttsSupported, speechRecognitionSupported, sfx } from './audio.js';
import { downloadBackup, backupCode, parseBackup, importBackup, gistToken, gistId, setGist, syncGist, autoSync, cleanToken, tokenProblem } from './sync.js';

let rerender = () => {};
export const setRerender = (fn) => (rerender = fn);
const after = () => {
  rerender();
  autoSync();
};

// ---------- header ----------

export function headerBar() {
  const li = levelInfo();
  const goal = S.settings.dailyGoal;
  const pct = Math.min(1, todayXp() / goal);
  const r = 15;
  const C = 2 * Math.PI * r;
  const ring = h('span.ring', {
    html: `<svg viewBox="0 0 36 36" width="34" height="34" aria-hidden="true"><circle cx="18" cy="18" r="${r}" class="ring-bg"/><circle cx="18" cy="18" r="${r}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg><span>${pct >= 1 ? '✓' : Math.round(pct * 100) + '%'}</span>`,
  });
  return h(
    'div.hdr-inner',
    h('button.stat', { type: 'button', onclick: streakSheet, 'aria-label': `${streak()} day streak` }, h('span', streak() > 0 ? '🔥' : '🩶'), h('b', streak())),
    h('button.stat', { type: 'button', onclick: shopSheet, 'aria-label': `${coins()} kronor` }, h('span', '🪙'), h('b', fmtNum(coins()))),
    h('button.stat.lvl', { type: 'button', onclick: () => (location.hash = '#me'), 'aria-label': `Level ${li.level}` }, h('span', '⭐'), h('b', li.level)),
    h('button.stat.goal', { type: 'button', onclick: goalSheet, 'aria-label': `Daily goal ${todayXp()} of ${goal} XP` }, ring),
    h('button.icon-btn.gear', { type: 'button', onclick: () => (location.hash = '#settings'), 'aria-label': 'Settings' }, '⚙️'),
  );
}

function goalSheet() {
  const goal = S.settings.dailyGoal;
  sheet(
    h(
      'div.pad',
      h('h2', '🎯 Daily goal'),
      h('p', `${todayXp()} / ${goal} XP today`),
      h('div.bar', h('div.fill', { style: { width: `${Math.min(100, (todayXp() / goal) * 100)}%` } })),
      h('p.muted', 'Hitting your goal earns 10 kr. You can change the goal in Settings.'),
    ),
  );
}

function streakSheet() {
  const today = dayKey();
  const cells = [];
  for (let i = 27; i >= 0; i--) {
    const k = addDays(today, -i);
    const on = (S.days[k] || 0) > 0;
    const fr = S.frozen.includes(k);
    cells.push(h('div.cal' + (on ? '.on' : fr ? '.frozen' : '') + (k === today ? '.today' : ''), { title: k }, on ? '🔥' : fr ? '🧊' : ''));
  }
  sheet(
    h(
      'div.pad',
      h('h2', `🔥 ${streak()} day streak`),
      h('p.muted', 'Earn any XP to keep your streak going. A streak freeze saves it automatically if you miss a day.'),
      h('div.calgrid', cells),
      h('p', `🧊 Streak freezes: ${S.freezes}`),
      h('button.btn', { type: 'button', onclick: shopSheet }, 'Visit the shop'),
    ),
  );
}

// ---------- learn: the path ----------

const LEVEL_NAME = { A1: 'A1 · Beginner', A2: 'A2 · Elementary', B1: 'B1 · Intermediate', B2: 'B2 · Upper intermediate' };

export function learnView() {
  const due = dueWords().length;
  const q = quests();
  const qDone = q.filter((x) => x.n >= x.target).length;
  let currentIdx = UNITS.findIndex((u, i) => unitUnlocked(i) && unitProgress(u.id).lessons < unitProgress(u.id).total);
  if (currentIdx < 0) currentIdx = UNITS.length - 1;

  const cards = h(
    'div.cards',
    due > 0
      ? h(
          'button.card.review-card',
          { type: 'button', onclick: () => startReview() },
          h('span.card-icon', '🔁'),
          h('div', h('b', `${due} word${due > 1 ? 's' : ''} to review`), h('div.muted', 'Spaced repetition keeps them fresh')),
          h('span.go', '›'),
        )
      : null,
    h(
      'button.card',
      { type: 'button', onclick: () => (location.hash = '#practice') },
      h('span.card-icon', '📜'),
      h('div', h('b', `Daily quests ${qDone}/${q.length}`), h('div.muted', q.find((x) => x.n < x.target)?.text || 'All done, great job!')),
      h('span.go', '›'),
    ),
  );

  const path = h('div.path');
  let lastLevel = null;
  UNITS.forEach((u, i) => {
    if (u.level !== lastLevel) {
      lastLevel = u.level;
      path.append(h('div.level-head', LEVEL_NAME[u.level] || u.level));
    }
    const p = unitProgress(u.id);
    const stars = unitStars(u.id);
    const open = unitUnlocked(i);
    const pct = p.total ? p.lessons / p.total : 0;
    const offset = Math.round(Math.sin(i * 0.9) * 70);
    const isCurrent = i === currentIdx;
    const R = 40;
    const C = 2 * Math.PI * R;
    path.append(
      h(
        'div.node-wrap' + (isCurrent ? '.has-bubble' : ''),
        { style: { transform: `translateX(${offset}px)` } },
        isCurrent ? h('div.bubble', p.lessons ? 'CONTINUE' : 'START') : null,
        h(
          'button.node' + (open ? '' : '.locked') + (stars >= 3 ? '.gold' : '') + (isCurrent ? '.current' : ''),
          { type: 'button', onclick: () => unitSheet(u.id, i), 'aria-label': `${u.title}${open ? '' : ' (locked)'}` },
          h('span.node-ring', {
            html: `<svg viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="${R}" class="nr-bg"/><circle cx="46" cy="46" r="${R}" class="nr-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>`,
          }),
          h('span.node-emoji', open ? u.emoji : '🔒'),
        ),
        h('div.node-stars', [0, 1, 2].map((k) => h('span' + (k < stars ? '.on' : ''), '★'))),
        h('div.node-title', u.title),
      ),
    );
  });
  const wrap = h('div.view.learn', cards, path);
  // Scroll the current unit into view on first render.
  setTimeout(() => {
    const cur = wrap.querySelector('.node.current');
    if (cur && !learnView.scrolled) {
      learnView.scrolled = true;
      cur.scrollIntoView({ block: 'center' });
    }
  }, 50);
  return wrap;
}

function startReview() {
  const steps = buildReview(15);
  if (!steps.length) return toast('Nothing to review right now 🎉');
  startSession({ kind: 'review', title: 'Review', steps, onExit: after });
}

export function startLesson(unitId, k) {
  startSession({ kind: 'lesson', unit: unitId, lesson: k, title: unitById(unitId).title, steps: buildLesson(unitId, k), pool: unitWords(unitId), onExit: after });
}

function unitSheet(id, index) {
  const u = unitById(id);
  const p = unitProgress(id);
  const stars = unitStars(id);
  const open = unitUnlocked(index);
  const n = lessonCount(id);
  let close;
  const go = (fn) => () => {
    close();
    fn();
  };
  const nextLesson = Math.min(p.lessons, n - 1);
  const lessons = h(
    'div.lessons',
    Array.from({ length: n }, (_, k) => {
      const state = k < p.lessons ? 'done' : k === p.lessons ? 'next' : 'later';
      return h(
        'button.lesson.' + state,
        { type: 'button', disabled: !open || state === 'later', onclick: go(() => startLesson(id, k)), 'aria-label': `Lesson ${k + 1}` },
        state === 'done' ? '✓' : String(k + 1),
      );
    }),
  );
  const allDone = p.lessons >= n;
  const content = h(
    'div.pad.unit-sheet',
    h('div.unit-head', h('div.unit-emoji', u.emoji), h('div', h('h2', u.title), h('div.muted', `${u.sv} · ${u.level}`))),
    h('div.stars-big', [0, 1, 2].map((k) => h('span' + (k < stars ? '.on' : ''), '★'))),
    h('p.muted.small', '★ finish all lessons · ★ beat the boss · ★ make 80% of words strong'),
    h(
      'div.tiles',
      h('div.tile', h('b', `${p.lessons}/${n}`), h('span', 'lessons')),
      h('div.tile', h('b', `${p.strong}/${p.words}`), h('span', 'strong words')),
    ),
    open
      ? [
          allDone
            ? h('button.btn.wide', { type: 'button', onclick: go(() => startSession({ kind: 'practice', title: `Practice: ${u.title}`, steps: buildPractice(id), pool: unitWords(id), onExit: after })) }, '🎯 Practice this unit')
            : h('button.btn.wide', { type: 'button', onclick: go(() => startLesson(id, nextLesson)) }, p.lessons ? `Continue: lesson ${nextLesson + 1}` : 'Start lesson 1'),
          h(
            'button.btn.wide.boss-btn' + (allDone ? '' : '.disabled'),
            {
              type: 'button',
              disabled: !allDone,
              onclick: go(() => startSession({ ...bossConfig(id), onExit: after })),
            },
            `${u.boss.emoji} ${p.boss ? 'Rematch' : 'Fight'} ${u.boss.name}`,
            allDone ? null : h('small', ' (finish all lessons)'),
          ),
          h('h3', 'Lessons'),
          lessons,
        ]
      : [
          h('div.locked-msg', `🔒 Finish half of “${UNITS[index - 1].title}” to unlock this unit.`),
          h(
            'button.btn.wide',
            { type: 'button', onclick: go(() => startSession({ ...jumpConfig(index), onExit: after })) },
            '🦘 Jump here: take a test',
          ),
          h('p.muted.small', 'Answer 12 questions from earlier units and lose fewer than 3 hearts to unlock it.'),
        ],
    h('h3', 'Words in this unit'),
    h('div.wordlist', unitWords(id).map((w) => wordRow(w))),
  );
  close = sheet(content, { tall: true });
}

// ---------- practice hub ----------

export function practiceView() {
  const due = dueWords().length;
  const q = quests();
  const weak = weakestWords(12);
  const game = (icon, name, desc, best, fn, disabled) =>
    h(
      'button.game' + (disabled ? '.disabled' : ''),
      { type: 'button', disabled: !!disabled, onclick: fn },
      h('span.game-icon', icon),
      h('b', name),
      h('span.muted.small', desc),
      best != null ? h('span.best', `Best: ${best}`) : null,
    );
  return h(
    'div.view.practice',
    h(
      'section.card.quests',
      h('h2', '📜 Daily quests'),
      q.map((x) =>
        h(
          'div.quest' + (x.n >= x.target ? '.done' : ''),
          h('div.q-text', x.n >= x.target ? '✅ ' : '', x.text),
          h('div.bar', h('div.fill', { style: { width: `${(x.n / x.target) * 100}%` } })),
          h('div.q-meta', `${x.n}/${x.target} · ${questReward} kr`),
        ),
      ),
      h('p.muted.small', 'Finish all three for a 25 kr bonus chest. New quests every day.'),
    ),
    h(
      'button.card.review-card',
      { type: 'button', onclick: startReview, disabled: !due },
      h('span.card-icon', '🔁'),
      h('div', h('b', due ? `Review ${Math.min(due, 15)} due words` : 'No words due'), h('div.muted', due ? `${due} waiting in total` : 'Come back later, or play a game below')),
      h('span.go', '›'),
    ),
    h(
      'div.games',
      game('⚡', 'Blitz', '60 seconds, as many as you can', S.best.blitz, () => blitz(after)),
      game('❤️', 'Survival', '3 lives, it keeps getting harder', S.best.survival, () => startSession({ ...survivalConfig(), onExit: after })),
      game('⚖️', 'Gender Rush', 'en or ett? Fast!', S.best.gender, () => genderRush(after)),
      game('🧩', 'Match Madness', 'Match pairs against the clock', S.best.match, () => matchMadness(after)),
      game('🎧', 'Listening Lab', canListen() ? 'Train your ear' : 'Needs a Swedish voice', null, () => startSession({ ...labConfig('listen'), onExit: after }), !canListen()),
      speechRecognitionSupported()
        ? game('🎙️', 'Speaking', 'Say words out loud', null, () => startSession({ ...labConfig('speak'), onExit: after }), !S.settings.speaking)
        : null,
      game('🎯', 'Weak words', weak.length ? `${weak.length} words that need love` : 'Learn some words first', null, () =>
        startSession({ kind: 'practice', title: 'Weak words', steps: buildPractice(null), onExit: after }), weak.length < 3),
      game('🔊', 'Sound guide', 'How Swedish sounds work', null, soundGuide),
    ),
  );
}

// ---------- words ----------

function wordRow(w) {
  const t = tier(S.words[w.id]);
  return h(
    'div.wrow',
    { onclick: () => wordSheet(w), role: 'button', tabindex: 0 },
    h('span.dot.' + t, { title: TIER_LABEL[t] }),
    h('div.wtext', h('b', display(w)), h('span.muted', w.en)),
    speakerBtn(w),
  );
}

function wordSheet(w) {
  const r = S.words[w.id];
  const t = tier(r);
  sheet(
    h(
      'div.pad',
      wordCard(w),
      h(
        'div.wstats',
        h('span.chip.' + t, TIER_LABEL[t]),
        r ? h('span.muted', `✓ ${r.c}  ✗ ${r.w} · next review ${r.d <= Date.now() ? 'now' : new Date(r.d).toLocaleDateString()}`) : h('span.muted', 'Not learned yet'),
      ),
      h('p.muted.small', `Unit: ${unitById(w.u)?.title || w.u}`),
    ),
    { tall: true },
  );
}

let wordsState = { q: '', filter: 'all', unit: '', limit: 80 };
export function wordsView() {
  const ws = wordStats();
  const list = h('div.wordlist');
  const more = h('button.btn.ghost.wide', { type: 'button' }, 'Show more');
  const draw = () => {
    const q = wordsState.q.trim().toLowerCase();
    const items = WORDS.filter((w) => {
      if (wordsState.unit && w.u !== wordsState.unit) return false;
      const t = tier(S.words[w.id]);
      if (wordsState.filter === 'learning' && !(t === 'learning' || t === 'familiar')) return false;
      if (wordsState.filter === 'mastered' && t !== 'mastered') return false;
      if (wordsState.filter === 'new' && t !== 'new') return false;
      if (q && !w.sv.toLowerCase().includes(q) && !w.en.toLowerCase().includes(q) && !(w.alt || []).some((a) => a.toLowerCase().includes(q)) && !(w.f || []).some((f) => f && f.toLowerCase().includes(q)))
        return false;
      return true;
    });
    list.replaceChildren(...items.slice(0, wordsState.limit).map(wordRow));
    if (!items.length) list.append(h('p.muted.center', 'No words match.'));
    more.hidden = items.length <= wordsState.limit;
    count.textContent = `${items.length} word${items.length === 1 ? '' : 's'}`;
  };
  more.onclick = () => {
    wordsState.limit += 120;
    draw();
  };
  const count = h('span.muted.small');
  const search = h('input.search', {
    type: 'search',
    placeholder: 'Search Swedish or English…',
    value: wordsState.q,
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
    oninput: (e) => {
      wordsState.q = e.target.value;
      wordsState.limit = 80;
      draw();
    },
  });
  const chips = h(
    'div.chips',
    ['all', 'new', 'learning', 'mastered'].map((f) =>
      h(
        'button.chip' + (wordsState.filter === f ? '.sel' : ''),
        {
          type: 'button',
          onclick: (e) => {
            wordsState.filter = f;
            wordsState.limit = 80;
            chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
            e.currentTarget.classList.add('sel');
            draw();
          },
        },
        f[0].toUpperCase() + f.slice(1),
      ),
    ),
  );
  const unitSel = h(
    'select.unit-select',
    {
      'aria-label': 'Unit',
      onchange: (e) => {
        wordsState.unit = e.target.value;
        wordsState.limit = 80;
        draw();
      },
    },
    h('option', { value: '' }, 'All units'),
    UNITS.map((u) => h('option', { value: u.id, selected: wordsState.unit === u.id }, `${u.emoji} ${u.title}`)),
  );
  const view = h(
    'div.view.words',
    h('div.wsum', h('b', `${ws.learned}`), ' learned · ', h('b', `${ws.mastered}`), ' mastered · ', `${ws.total} words in the course`),
    search,
    h('div.row.wrap', chips, unitSel),
    count,
    list,
    more,
    h('button.btn.ghost.wide', { type: 'button', onclick: soundGuide }, '🔊 Swedish sound guide'),
  );
  draw();
  return view;
}

// ---------- profile ----------

const AVATARS = [
  ['🦊', 0],
  ['🐻', 40],
  ['🦉', 40],
  ['🐺', 60],
  ['🫎', 80],
  ['🐧', 60],
  ['🐸', 40],
  ['🦄', 120],
  ['🐉', 150],
  ['🧌', 100],
  ['🎅', 100],
  ['👑', 250],
];
const THEMES = [
  ['blue', 'Sverige', 0],
  ['midsommar', 'Midsommar', 100],
  ['lucia', 'Lucia', 100],
  ['fika', 'Fika', 100],
  ['norrsken', 'Norrsken', 150],
];

export function profileView() {
  const li = levelInfo();
  const ws = wordStats();
  const xp = totalXp();
  const acc = S.counts.answers ? Math.round(((S.counts.correct || 0) / S.counts.answers) * 100) : 0;
  const nameInput = h('input.name', {
    value: S.name,
    placeholder: 'Your name',
    maxlength: 24,
    onchange: (e) => {
      S.name = e.target.value.trim();
      save();
    },
  });
  // 16-week activity heatmap.
  const today = dayKey();
  const start = addDays(today, -(7 * 16 - 1) - ((new Date().getDay() + 6) % 7) + 6);
  const heat = [];
  for (let k = start; k <= today; k = addDays(k, 1)) {
    const v = S.days[k] || 0;
    const lvl = v === 0 ? 0 : v < 20 ? 1 : v < 50 ? 2 : v < 100 ? 3 : 4;
    heat.push(h('div.hc.l' + lvl, { title: `${k}: ${v} XP` }));
  }
  return h(
    'div.view.profile',
    h(
      'section.card.me',
      h('button.avatar', { type: 'button', onclick: shopSheet, 'aria-label': 'Change avatar' }, S.avatar),
      h('div.me-info', nameInput, h('div.muted', `Level ${li.level} · ${li.sv} (${li.en})`), h('div.bar', h('div.fill', { style: { width: `${li.pct * 100}%` } })), h('div.muted.small', `${xp - li.cur} / ${li.next - li.cur} XP to level ${li.level + 1}`)),
    ),
    h(
      'div.tiles.grid3',
      h('div.tile', h('b', `🔥 ${streak()}`), h('span', 'day streak')),
      h('div.tile', h('b', fmtNum(xp)), h('span', 'total XP')),
      h('div.tile', h('b', ws.learned), h('span', 'words learned')),
      h('div.tile', h('b', ws.mastered), h('span', 'mastered')),
      h('div.tile', h('b', S.counts.lessons || 0), h('span', 'lessons')),
      h('div.tile', h('b', `${acc}%`), h('span', 'accuracy')),
    ),
    h('section.card', h('h2', 'Activity'), h('div.heat', heat), h('p.muted.small', 'Each square is a day. Darker = more XP.')),
    h(
      'section.card',
      h('h2', '🏆 Personal bests'),
      h(
        'div.tiles.grid4',
        [
          ['⚡', 'Blitz', S.best.blitz],
          ['❤️', 'Survival', S.best.survival],
          ['⚖️', 'Gender', S.best.gender],
          ['🧩', 'Match', S.best.match],
        ].map(([i, n, v]) => h('div.tile', h('b', `${i} ${v || 0}`), h('span', n))),
      ),
    ),
    h(
      'section.card',
      h('h2', `🎖️ Achievements ${Object.keys(S.ach).length}/${ACHIEVEMENTS.length}`),
      h(
        'div.achs',
        ACHIEVEMENTS.map((a) =>
          h('button.ach' + (S.ach[a.id] ? '.got' : ''), { type: 'button', onclick: () => toast(`${a.icon} ${a.name}: ${a.desc}${S.ach[a.id] ? ' ✓' : ''}`) }, h('span.ach-icon', S.ach[a.id] ? a.icon : '🔒'), h('span.small', a.name)),
        ),
      ),
    ),
    h('button.btn.wide', { type: 'button', onclick: shopSheet }, '🛍️ Shop'),
  );
}

function shopSheet() {
  let close;
  const buy = (price, what, fn) => {
    if (!spendCoins(price)) return toast(`You need ${price - coins()} more kr`);
    fn();
    sfx('coin');
    save(true);
    toast(`Bought ${what}!`);
    close();
    shopSheet();
    rerender();
  };
  const content = h(
    'div.pad.shop',
    h('h2', `🛍️ Shop · 🪙 ${coins()} kr`),
    h('p.muted.small', 'Earn kronor from lessons, quests, bosses and achievements.'),
    h('h3', 'Power-ups'),
    h(
      'div.shop-item',
      h('span.shop-icon', '🧊'),
      h('div', h('b', 'Streak freeze'), h('div.muted.small', `Protects your streak for one missed day. You have ${S.freezes}/3.`)),
      h('button.btn.small', { type: 'button', disabled: S.freezes >= 3, onclick: () => buy(50, 'a streak freeze', () => S.freezes++) }, '50 kr'),
    ),
    h('h3', 'Avatars'),
    h(
      'div.avatars',
      AVATARS.map(([a, price]) => {
        const owned = S.owned.includes(a) || price === 0;
        return h(
          'button.av' + (S.avatar === a ? '.sel' : ''),
          {
            type: 'button',
            onclick: () => {
              if (owned) {
                S.avatar = a;
                save();
                close();
                shopSheet();
                rerender();
              } else buy(price, a, () => (S.owned.push(a), (S.avatar = a)));
            },
          },
          h('span', a),
          h('small', owned ? (S.avatar === a ? 'using' : 'owned') : `${price} kr`),
        );
      }),
    ),
    h('h3', 'Color themes'),
    h(
      'div.themes',
      THEMES.map(([id, name, price]) => {
        const owned = S.owned.includes('theme:' + id) || price === 0;
        return h(
          'button.theme-btn.t-' + id + (S.theme === id ? '.sel' : ''),
          {
            type: 'button',
            onclick: () => {
              if (owned) {
                S.theme = id;
                save();
                applyTheme();
                close();
                shopSheet();
              } else buy(price, `the ${name} theme`, () => (S.owned.push('theme:' + id), (S.theme = id), applyTheme()));
            },
          },
          h('span.swatch'),
          h('b', name),
          h('small', owned ? (S.theme === id ? 'using' : 'owned') : `${price} kr`),
        );
      }),
    ),
  );
  close = sheet(content, { tall: true });
}

export function applyTheme() {
  const root = document.documentElement;
  root.dataset.accent = S.theme || 'blue';
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--brand').trim() || '#006aa7';
}

// ---------- settings ----------

export function settingsView() {
  const st = S.settings;
  const set = (k, v) => {
    st[k] = v;
    S.settingsUpdated = Date.now();
    save();
    if (k === 'theme') applyTheme();
  };
  const toggle = (k, label, desc, disabled) =>
    h(
      'label.setting',
      h('div', h('b', label), desc ? h('div.muted.small', desc) : null),
      h('input.switch', { type: 'checkbox', checked: !!st[k], disabled: !!disabled, onchange: (e) => set(k, e.target.checked) }),
    );
  const voiceSel = h('select', { 'aria-label': 'Swedish voice', onchange: (e) => set('voice', e.target.value) });
  const voiceNote = h('div.muted.small');
  const fillVoices = () => {
    const vs = swedishVoices();
    voiceSel.replaceChildren(h('option', { value: '' }, 'Automatic'), ...vs.map((v) => h('option', { value: v.voiceURI, selected: st.voice === v.voiceURI }, `${v.name} (${v.lang})`)));
    voiceNote.replaceChildren(
      !ttsSupported()
        ? 'This browser has no speech synthesis.'
        : vs.length
          ? `${vs.length} Swedish voice${vs.length > 1 ? 's' : ''} found.`
          : h(
              'span.warn',
              '⚠️ No Swedish voice found on this device. iPhone: Settings → Accessibility → Spoken Content → Voices → Swedish (download “Alva”). Android: Settings → System → Languages → Text-to-speech → Google → install Swedish. Then reopen the app.',
            ),
    );
  };
  fillVoices();
  const unsub = onVoices(fillVoices);
  setTimeout(() => !document.body.contains(voiceSel) && unsub(), 60000);

  const storageLine = h('div.muted.small', storageOk ? 'Saved on this device.' : '⚠️ This browser is blocking storage (private mode?). Progress will not be kept.');
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => {
      storageLine.textContent = p
        ? '✅ Saved on this device, and the browser promised not to clear it.'
        : 'Saved on this device. Add the app to your home screen and make regular backups to be safe.';
    });
  }

  // A plain text field (masked with CSS) so phones don't offer to replace it with a generated password.
  const tokenIn = h('input.token', {
    type: 'text',
    placeholder: 'Paste token (starts with ghp_)',
    value: gistToken(),
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
    inputmode: 'text',
    'aria-label': 'GitHub token',
  });
  const showToken = h('button.btn.ghost.small', { type: 'button', onclick: () => tokenIn.classList.toggle('shown') }, '👁 Show');
  const gistIn = h('input', { type: 'text', placeholder: 'Gist ID (filled in automatically)', value: gistId(), autocomplete: 'off', 'aria-label': 'Gist ID' });
  const syncMsg = h('div.muted.small', S.lastSync ? `Last synced ${ago(S.lastSync)}.` : 'Not set up.');
  const doSync = async () => {
    const token = cleanToken(tokenIn.value);
    tokenIn.value = token;
    const problem = tokenProblem(token);
    if (problem) {
      syncMsg.textContent = '⚠️ ' + problem;
      return;
    }
    setGist(token, gistIn.value);
    syncMsg.textContent = 'Checking token…';
    try {
      const r = await syncGist({ verify: true });
      gistIn.value = gistId();
      syncMsg.textContent = r === 'created' ? '✅ Created a private gist with your progress.' : '✅ Synced.';
      toast(r === 'created' ? '☁️ Sync is set up: your progress is now backed up to a private gist.' : '☁️ Synced with GitHub');
      rerender();
    } catch (e) {
      syncMsg.textContent = '⚠️ ' + e.message;
    }
  };

  const fileIn = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        restoreFlow(parseBackup(await f.text()));
      } catch (err) {
        toast('⚠️ ' + err.message);
      }
    },
  });

  return h(
    'div.view.settings',
    h('h1', 'Settings'),
    h(
      'section.card',
      h('h2', 'Learning'),
      h(
        'label.setting',
        h('div', h('b', 'Daily goal'), h('div.muted.small', 'XP per day')),
        h(
          'select',
          { onchange: (e) => set('dailyGoal', Number(e.target.value)) },
          [
            [20, 'Casual · 20'],
            [50, 'Regular · 50'],
            [100, 'Serious · 100'],
            [150, 'Intense · 150'],
          ].map(([v, l]) => h('option', { value: v, selected: st.dailyGoal === v }, l)),
        ),
      ),
      toggle('typing', 'Typing exercises', 'Write words yourself (å ä ö keys included)'),
      toggle('speaking', 'Speaking exercises', speechRecognitionSupported() ? 'Uses the microphone and your browser’s speech recognition' : 'Not supported in this browser', !speechRecognitionSupported()),
      toggle('showIpa', 'Show IPA pronunciation', 'Phonetic spelling under each word'),
      toggle('freeMode', 'Free mode', 'Unlock every unit right away'),
    ),
    h(
      'section.card',
      h('h2', 'Sound'),
      toggle('autoplay', 'Auto-play pronunciation'),
      toggle('native', 'Native-speaker recordings', 'Fetches real recordings from Wikimedia Commons when one exists'),
      toggle('sfx', 'Sound effects'),
      'vibrate' in navigator ? toggle('haptics', 'Vibration') : null,
      h(
        'label.setting',
        h('div', h('b', 'Speech speed')),
        h('input', { type: 'range', min: 0.5, max: 1.2, step: 0.05, value: st.rate, oninput: (e) => set('rate', Number(e.target.value)) }),
      ),
      h('div.setting', h('div', h('b', 'Swedish voice'), voiceNote), voiceSel),
      h('button.btn.ghost', { type: 'button', onclick: () => speak('Hej! Välkommen till Svenska Quest. Sju sjösjuka sjömän.') }, '▶︎ Test voice'),
    ),
    h(
      'section.card',
      h('h2', 'Appearance'),
      h(
        'label.setting',
        h('b', 'Theme'),
        h(
          'select',
          { onchange: (e) => set('theme', e.target.value) },
          [
            ['auto', 'Match my phone'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ].map(([v, l]) => h('option', { value: v, selected: st.theme === v }, l)),
        ),
      ),
    ),
    h(
      'section.card',
      h('h2', '💾 Your progress'),
      storageLine,
      h('p.muted.small', `Last backup: ${ago(S.lastBackup)}`),
      h('div.btn-col',
        h('button.btn', { type: 'button', onclick: () => (downloadBackup(), toast('Backup downloaded'), rerender()) }, '⬇️ Download backup file'),
        h(
          'button.btn.ghost',
          {
            type: 'button',
            onclick: async () => {
              const code = backupCode();
              try {
                await navigator.clipboard.writeText(code);
                S.lastBackup = Date.now();
                save();
                toast('Backup code copied. Paste it somewhere safe (e.g. a note).');
              } catch {
                sheet(h('div.pad', h('h2', 'Backup code'), h('p.muted.small', 'Copy all of this:'), h('textarea.code', { readonly: true, rows: 8 }, code)));
              }
            },
          },
          '📋 Copy backup code',
        ),
        h('button.btn.ghost', { type: 'button', onclick: () => fileIn.click() }, '⬆️ Restore from file'),
        h('button.btn.ghost', { type: 'button', onclick: pasteFlow }, '📥 Paste backup code'),
      ),
      fileIn,
    ),
    h(
      'section.card',
      h('h2', '☁️ Sync with GitHub (optional)'),
      h(
        'p.muted.small',
        'Keeps your progress in a private Gist on your own GitHub account, so it survives a lost phone and syncs between devices. Create a token at github.com → Settings → Developer settings → Personal access tokens → Tokens (classic), with only the “gist” scope. The token is stored only on this device.',
      ),
      h('div.row', tokenIn, showToken),
      gistIn,
      h('div.row', h('button.btn', { type: 'button', onclick: doSync }, 'Sync now'), h('button.btn.ghost', { type: 'button', onclick: () => (setGist('', ''), (tokenIn.value = ''), (gistIn.value = ''), (syncMsg.textContent = 'Disconnected.')) }, 'Disconnect')),
      syncMsg,
    ),
    h(
      'section.card',
      h('h2', '📱 Install on your phone'),
      installHelp(),
    ),
    h(
      'section.card',
      h('h2', 'Danger zone'),
      h(
        'button.btn.danger',
        {
          type: 'button',
          onclick: async () => {
            if (await confirmDialog('Reset all progress?', 'This deletes everything on this device. Download a backup first if you might want it back.', 'Delete everything', true)) {
              replaceState(defaultState());
              toast('Progress reset');
              location.hash = '#learn';
              rerender();
            }
          },
        },
        'Reset progress',
      ),
    ),
    h(
      'section.card.about',
      h('h2', 'About'),
      h(
        'p.small',
        'Svenska Quest is a free, open-source app. Pronunciations were checked against Wiktionary (via ',
        h('a', { href: 'https://github.com/CUNY-CL/wikipron', target: '_blank', rel: 'noopener' }, 'WikiPron'),
        ') and ',
        h('a', { href: 'https://github.com/open-dict-data/ipa-dict', target: '_blank', rel: 'noopener' }, 'ipa-dict'),
        '. Native recordings stream from ',
        h('a', { href: 'https://commons.wikimedia.org', target: '_blank', rel: 'noopener' }, 'Wikimedia Commons'),
        ' (CC BY-SA; speakers credited under each word). Word frequencies come from ',
        h('a', { href: 'https://github.com/hermitdave/FrequencyWords', target: '_blank', rel: 'noopener' }, 'FrequencyWords'),
        '.',
      ),
      h('p.muted.small', `${WORDS.length} words · ${UNITS.length} units`),
    ),
  );
}

function restoreFlow(data) {
  sheet(
    h(
      'div.pad',
      h('h2', 'Restore backup'),
      h('p', `This backup has ${Object.keys(data.words || {}).length} words and was saved ${ago(data.updated)}.`),
      h('div.btn-col',
        h('button.btn', { type: 'button', onclick: (e) => (importBackup(data, 'merge'), toast('Backup merged ✓'), document.querySelector('.backdrop')?.click(), rerender()) }, 'Merge with this device (recommended)'),
        h('button.btn.ghost', { type: 'button', onclick: (e) => (importBackup(data, 'replace'), toast('Backup restored ✓'), document.querySelector('.backdrop')?.click(), rerender()) }, 'Replace this device’s progress'),
      ),
    ),
  );
}

function pasteFlow() {
  const ta = h('textarea.code', { rows: 6, placeholder: 'Paste your SQ1:… code here' });
  let close;
  close = sheet(
    h(
      'div.pad',
      h('h2', 'Paste backup code'),
      ta,
      h('button.btn.wide', {
        type: 'button',
        onclick: () => {
          try {
            const d = parseBackup(ta.value);
            close();
            restoreFlow(d);
          } catch (e) {
            toast('⚠️ ' + (e.message || 'Invalid code'));
          }
        },
      }, 'Continue'),
    ),
  );
}

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
});
export function installHelp() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return h('p.small', '✅ Installed. You’re running Svenska Quest as an app.');
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return h(
    'div',
    installEvent
      ? h('button.btn', { type: 'button', onclick: async () => (installEvent.prompt(), (installEvent = null)) }, '📲 Install app')
      : null,
    ios
      ? h('p.small', 'In Safari tap the Share button ', h('b', '⎙'), ', then “Add to Home Screen”. Installed web apps keep their data safely and work offline.')
      : h('p.small', 'In Chrome open the ⋮ menu and choose “Install app” or “Add to Home screen”. It then works offline like a normal app.'),
  );
}

// ---------- sound guide ----------

const GUIDE = [
  {
    title: 'Long and short vowels',
    text: 'Every stressed syllable has either a long vowel or a long (double) consonant. A single consonant after the vowel usually means the vowel is long; a double consonant means it is short.',
    ex: [
      ['tak', 'roof (long a)'],
      ['tack', 'thanks (short a)'],
      ['glas', 'glass (long a)'],
      ['glass', 'ice cream (short a)'],
      ['vit', 'white (long i)'],
      ['vitt', 'white, ett-form (short i)'],
    ],
  },
  {
    title: 'The nine vowels',
    text: 'a e i o u y å ä ö. Watch out: o often sounds like English “oo” (bok), u is a rounded sound with no English match (hus), and y is like German ü (ny).',
    ex: [
      ['bok', 'book: o = “oo”'],
      ['hus', 'house: long u'],
      ['hund', 'dog: short u'],
      ['ny', 'new: y'],
      ['båt', 'boat: å'],
      ['äta', 'to eat: ä'],
      ['röd', 'red: ö'],
    ],
  },
  {
    title: 'The sj-sound /ɧ/',
    text: 'A breathy, whooshing sound unique to Swedish. Spelled sj, skj, stj, sk before e/i/y/ä/ö, and -tion.',
    ex: [
      ['sju', 'seven'],
      ['skjorta', 'shirt'],
      ['stjärna', 'star'],
      ['sked', 'spoon'],
      ['station', 'station'],
    ],
  },
  {
    title: 'The tj-sound /ɕ/',
    text: 'Softer, like a thin “sh” with the tongue forward. Spelled tj, kj, and k before e/i/y/ä/ö.',
    ex: [
      ['tjugo', 'twenty'],
      ['kjol', 'skirt'],
      ['kök', 'kitchen'],
      ['kyckling', 'chicken'],
    ],
  },
  {
    title: 'Soft g and silent letters',
    text: 'g before e/i/y/ä/ö sounds like j. In dj-, gj-, hj- and lj- at the start of a word, only the j is heard.',
    ex: [
      ['göra', 'to do'],
      ['ge', 'to give'],
      ['djur', 'animal'],
      ['hjälp', 'help'],
      ['ljus', 'light'],
      ['gjorde', 'did'],
    ],
  },
  {
    title: 'r + consonant',
    text: 'r followed by d, n, s, t or l melts into one “retroflex” sound with the tongue curled back: rs sounds almost like “sh”.',
    ex: [
      ['bord', 'table'],
      ['barn', 'child'],
      ['först', 'first'],
      ['kort', 'short / card'],
      ['kärlek', 'love'],
    ],
  },
  {
    title: 'Word melody: accent 1 and accent 2',
    text: 'Swedish words have one of two pitch patterns. Accent 1 has a single fall. Accent 2 has a “sing-song” double tone and is typical of two-syllable words and compounds. The app marks each word “accent 1” or “accent 2”. Device voices don’t always get the melody right, so listen to native recordings when they’re available.',
    ex: [
      ['anden', 'the duck (accent 1)'],
      ['anden', 'the spirit (accent 2)'],
      ['flicka', 'girl (accent 2)'],
      ['hunden', 'the dog (accent 1)'],
    ],
  },
  {
    title: 'Spoken shortcuts',
    text: 'Everyday speech drops some sounds: jag → “ja”, mig/dig → “mej/dej”, de/dem → “dom”, och → “å”, det → “de”.',
    ex: [
      ['jag', 'I'],
      ['mig', 'me'],
      ['dem', 'them'],
      ['och', 'and'],
    ],
  },
];

export function soundGuide() {
  sheet(
    h(
      'div.pad.guide',
      h('h2', '🔊 How Swedish sounds'),
      h('p.muted.small', 'Tap any word to hear it.'),
      GUIDE.map((g) =>
        h(
          'section',
          h('h3', g.title),
          h('p.small', g.text),
          h('div.guide-ex', g.ex.map(([sv, en]) => h('button.chip.say', { type: 'button', onclick: () => speak(sv) }, h('b', sv), ' ', h('span.muted', en)))),
        ),
      ),
    ),
    { tall: true },
  );
}

export { unitSheet, startReview };
