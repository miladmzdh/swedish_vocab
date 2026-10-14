// Arcade games: Blitz (60-second quiz), Gender Rush (en/ett) and Match Madness (pairs against the clock).
import { h, mount, confetti, pushLayer } from './ui.js';
import { S, save } from './store.js';
import { WORDS, display, distractors, shuffle, unitWords } from './data.js';
import { sfx, buzz, sayWord, stopSpeaking } from './audio.js';
import { reward, track, checkAchievements, count } from './gamify.js';

const known = (w) => (S.words[w.id]?.b || 0) > 0;

function poolOf(filter = () => true, min = 20) {
  const k = WORDS.filter((w) => known(w) && filter(w));
  if (k.length >= min) return k;
  return [...k, ...WORDS.filter((w) => !known(w) && filter(w) && (w.lvl === 'A1' || w.lvl === 'A2'))];
}

// A wrong answer in a game makes the word due for review again.
function flagWeak(w) {
  const r = S.words[w.id];
  if (r && r.b) r.d = Math.min(r.d, Date.now());
}

function shell(title, onExit) {
  const root = document.getElementById('session');
  document.body.classList.add('in-session');
  root.hidden = false;
  const top = h('div.s-top');
  const body = h('main.s-body.arcade');
  const foot = h('footer.s-foot');
  const timer = h('div.timer', h('div.fill'));
  mount(root, h('div.session', top, timer, body, foot));
  let closed = false;
  // The phone's back gesture quits the game (stopping its clock) instead of leaving the app.
  let onBack = () => close();
  let layerGone = false;
  const layer = pushLayer(() => {
    layerGone = true;
    onBack();
  });
  const close = () => {
    if (closed) return;
    closed = true;
    if (!layerGone) layer.release();
    stopSpeaking();
    document.body.classList.remove('in-session');
    root.hidden = true;
    root.replaceChildren();
    onExit && onExit();
  };
  return { root, top, body, foot, timer, close, title, setBack: (fn) => (onBack = fn) };
}

function clock(sh, seconds, onTick, onEnd) {
  let left = seconds * 1000;
  let last = Date.now();
  let stopped = false;
  const fill = sh.timer.firstChild;
  const iv = setInterval(() => {
    if (stopped) return;
    const now = Date.now();
    left -= now - last;
    last = now;
    fill.style.width = `${Math.max(0, left / (seconds * 1000)) * 100}%`;
    fill.classList.toggle('low', left < 10000);
    onTick && onTick(Math.ceil(left / 1000));
    if (left <= 0) {
      stopped = true;
      clearInterval(iv);
      onEnd();
    }
  }, 100);
  return {
    add: (ms) => (left = Math.min(seconds * 1000, left + ms)),
    stop: () => ((stopped = true), clearInterval(iv)),
    left: () => left,
  };
}

function topBar(sh, { score, combo, secs }, quit) {
  sh.top.replaceChildren(
    h('button.icon-btn', { type: 'button', 'aria-label': 'Quit', onclick: quit }, '✕'),
    h('div.s-title', sh.title),
    h('div.combo', `⏱ ${secs}s`),
    h('div.combo', combo >= 3 ? `🔥${combo}` : ''),
    h('div.score', `★ ${score}`),
  );
}

function results(sh, mode, score, again, extra = {}) {
  const prev = S.best[mode] || 0;
  S.best[mode] = Math.max(prev, score);
  count('games');
  track('arcade');
  if (mode === 'gender') track('gender', score);
  const xp = Math.min(40, score);
  const kr = Math.floor(score / 5);
  const { levelUp } = reward(xp, kr);
  const ach = checkAchievements();
  save(true);
  const record = score > prev && score > 0;
  if (record) {
    sfx('win');
    confetti();
  } else sfx('coin');
  mount(
    sh.body,
    h(
      'div.summary',
      h('div.sum-emoji', record ? '🏆' : '🎮'),
      h('h1', `Score: ${score}`),
      h('p.muted', record ? 'New personal best!' : `Best: ${S.best[mode]}`),
      levelUp ? h('div.banner.level', `⬆️ Level ${levelUp}!`) : null,
      h('div.tiles', h('div.tile', h('b', `+${xp}`), h('span', 'XP')), h('div.tile', h('b', `+${kr}`), h('span', 'kronor')), extra.acc != null ? h('div.tile', h('b', `${extra.acc}%`), h('span', 'accuracy')) : null),
      ach.length ? h('div.ach-list', h('h3', 'Achievement unlocked'), ach.map((a) => h('div.ach-row', h('span.ach-icon', a.icon), h('div', h('b', a.name), h('div.muted', a.desc))))) : null,
      extra.missed && extra.missed.length
        ? h('div.weak', h('h3', 'Missed'), extra.missed.slice(0, 8).map((w) => h('div.weak-row', h('b', display(w)), h('span.muted', w.en))))
        : null,
    ),
  );
  sh.timer.remove();
  sh.top.replaceChildren(h('div.s-title', sh.title));
  sh.foot.replaceChildren(
    h('div.row', h('button.btn.ghost', { type: 'button', onclick: sh.close }, 'Done'), h('button.btn', { type: 'button', id: 'continue', onclick: () => (sh.close(), again()) }, 'Play again')),
  );
}

// ---------- Blitz ----------

export function blitz(onExit) {
  const sh = shell('Blitz', onExit);
  const pool = poolOf();
  let score = 0,
    combo = 0,
    answers = 0,
    right = 0,
    bag = [];
  const missed = [];
  let ended = false;
  const quit = () => (clk.stop(), sh.close());
  sh.setBack(() => quit());
  const draw = (secs) => topBar(sh, { score, combo, secs }, quit);
  const clk = clock(sh, 60, (s) => draw(s), () => {
    ended = true;
    results(sh, 'blitz', score, () => blitz(onExit), { acc: answers ? Math.round((right / answers) * 100) : 0, missed });
  });
  function q() {
    if (ended) return;
    if (!bag.length) bag = shuffle(pool);
    const w = bag.pop();
    const toEn = Math.random() < 0.55;
    const opts = shuffle([w, ...distractors(w, 3, unitWords(w.u).length >= 8 ? unitWords(w.u) : pool, toEn ? (x) => x.en : (x) => x.sv)]);
    const label = (x) => (toEn ? x.en : display(x));
    let locked = false;
    const btns = opts.map((o) =>
      h(
        'button.opt',
        {
          type: 'button',
          onclick: (e) => {
            if (locked || ended) return;
            locked = true;
            answers++;
            if (o === w) {
              right++;
              combo++;
              score += combo >= 10 ? 3 : combo >= 5 ? 2 : 1;
              e.currentTarget.classList.add('correct');
              sfx(combo % 5 === 0 ? 'combo' : 'correct');
              buzz(15);
              setTimeout(q, 180);
            } else {
              combo = 0;
              clk.add(-3000);
              missed.push(w);
              flagWeak(w);
              e.currentTarget.classList.add('wrong');
              btns[opts.indexOf(w)].classList.add('correct');
              sfx('wrong');
              buzz([30, 40, 30]);
              setTimeout(q, 750);
            }
            draw(Math.ceil(clk.left() / 1000));
          },
        },
        h('span.lbl', label(o)),
      ),
    );
    mount(sh.body, h('div.ex', h('div.prompt', toEn ? h('div.big-word', display(w)) : h('div.big-en', w.en)), h('div.opts', btns)));
    if (toEn && S.settings.autoplay) sayWord(w);
  }
  draw(60);
  q();
}

// ---------- Gender Rush ----------

export function genderRush(onExit) {
  const sh = shell('Gender Rush', onExit);
  const pool = poolOf((w) => w.pos === 'noun' && (w.g === 'en' || w.g === 'ett'));
  let score = 0,
    combo = 0,
    answers = 0,
    right = 0,
    bag = [];
  const missed = [];
  let ended = false;
  const quit = () => (clk.stop(), sh.close());
  sh.setBack(() => quit());
  const draw = (secs) => topBar(sh, { score, combo, secs }, quit);
  const clk = clock(sh, 45, (s) => draw(s), () => {
    ended = true;
    results(sh, 'gender', score, () => genderRush(onExit), { acc: answers ? Math.round((right / answers) * 100) : 0, missed });
  });
  function q() {
    if (ended) return;
    if (!bag.length) bag = shuffle(pool);
    const w = bag.pop();
    let locked = false;
    const word = h('div.big-word.rush-word', h('span.blank', '___'), ' ', w.sv);
    const pickG = (g, el) => {
      if (locked || ended) return;
      locked = true;
      answers++;
      word.replaceChildren(h('span.prefix', w.g + ' '), w.sv);
      if (g === w.g) {
        right++;
        combo++;
        score += combo >= 10 ? 3 : combo >= 5 ? 2 : 1;
        el.classList.add('correct');
        sfx(combo % 5 === 0 ? 'combo' : 'correct');
        buzz(15);
        setTimeout(q, 250);
      } else {
        combo = 0;
        clk.add(-2000);
        missed.push(w);
        flagWeak(w);
        el.classList.add('wrong');
        sfx('wrong');
        buzz([30, 40, 30]);
        sayWord(w);
        setTimeout(q, 900);
      }
      draw(Math.ceil(clk.left() / 1000));
    };
    const en = h('button.gbtn.en', { type: 'button', onclick: (e) => pickG('en', e.currentTarget) }, 'EN');
    const ett = h('button.gbtn.ett', { type: 'button', onclick: (e) => pickG('ett', e.currentTarget) }, 'ETT');
    mount(sh.body, h('div.ex.rush', h('div.prompt', word, h('div.hint', w.en)), h('div.gbtns', en, ett)));
  }
  draw(45);
  q();
}

// ---------- Match Madness ----------

export function matchMadness(onExit) {
  const sh = shell('Match Madness', onExit);
  const pool = poolOf((w) => w.en.length < 40);
  let score = 0,
    combo = 0,
    bag = [];
  let ended = false;
  const quit = () => (clk.stop(), sh.close());
  sh.setBack(() => quit());
  const draw = (secs) => topBar(sh, { score, combo, secs }, quit);
  const clk = clock(sh, 60, (s) => draw(s), () => {
    ended = true;
    results(sh, 'match', score, () => matchMadness(onExit));
  });
  const nextWord = (exclude) => {
    for (let i = 0; i < 50; i++) {
      if (!bag.length) bag = shuffle(pool);
      const w = bag.pop();
      if (!exclude.some((x) => x.id === w.id || x.en === w.en || x.sv === w.sv)) return w;
    }
    return bag.pop() || pool[0];
  };
  const N = 5;
  let words = [];
  for (let i = 0; i < N; i++) words.push(nextWord(words));
  let leftOrder = shuffle(words.map((_, i) => i));
  let rightOrder = shuffle(words.map((_, i) => i));
  let sel = null;
  const colL = h('div.col');
  const colR = h('div.col');
  mount(sh.body, h('div.ex', h('div.instr', 'Match as many pairs as you can!'), h('div.match', colL, colR)));
  function render() {
    colL.replaceChildren(
      ...leftOrder.map((i) => h('button.mcard' + (sel === i ? '.sel' : ''), { type: 'button', onclick: () => tapL(i) }, display(words[i]))),
    );
    colR.replaceChildren(...rightOrder.map((i) => h('button.mcard', { type: 'button', onclick: (e) => tapR(i, e.currentTarget) }, words[i].en)));
  }
  function tapL(i) {
    if (ended) return;
    sel = i;
    sayWord(words[i]);
    render();
  }
  function tapR(i, el) {
    if (ended || sel == null) return;
    if (i === sel) {
      score++;
      combo++;
      sfx(combo % 5 === 0 ? 'combo' : 'correct');
      buzz(15);
      words[i] = nextWord(words);
      // New pair goes into random positions so it isn't trivially aligned.
      leftOrder = shuffle(leftOrder);
      sel = null;
      render();
    } else {
      combo = 0;
      clk.add(-2000);
      flagWeak(words[sel]);
      sfx('wrong');
      buzz([30, 40, 30]);
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 400);
    }
    draw(Math.ceil(clk.left() / 1000));
  }
  draw(60);
  render();
}
