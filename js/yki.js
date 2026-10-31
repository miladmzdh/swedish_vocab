// 🇫🇮 YKI: practice for the Finnish citizenship language test in Swedish, intermediate level (grade 3 ≈ B1).
// Speaking (timed, with optional self-recording), writing (word counter, model text, checklist),
// reading and listening (exam-style questions). Content: data/yki/*.json (see tools/YKI_STYLE.md).
import { h, mount, toast, confetti, pushLayer } from './ui.js';
import { S, save } from './store.js';
import { speak, speakLines, stopLines, stopSpeaking, slowRate, sfx } from './audio.js';
import { reward, checkAchievements } from './gamify.js';

const PARTS = [
  { id: 'speaking', icon: '🎤', title: 'Speaking', sv: 'Tal', desc: 'Account, situations and a short presentation, timed like the test.' },
  { id: 'writing', icon: '✍️', title: 'Writing', sv: 'Skrivande', desc: 'Informal and formal messages and an opinion text.' },
  { id: 'reading', icon: '📖', title: 'Reading', sv: 'Läsförståelse', desc: 'Short texts with exam-style questions.' },
  { id: 'listening', icon: '🎧', title: 'Listening', sv: 'Hörförståelse', desc: 'Dialogues and announcements; you may listen twice.' },
];
const TYPE_LABEL = {
  account: ['Account', 'Redogörelse', 'Tell about something from your life. About 1 min to prepare, 1½ min to speak.'],
  situation: ['Situations', 'Situationer', 'Someone speaks to you and you answer, like a phone call or a conversation.'],
  presentation: ['Short presentation', 'Kort anförande', 'Give your view on a topic. About 2 min to prepare, 2 min to speak.'],
  informal: ['Informal message', 'Informellt meddelande', 'To a friend, neighbour or hobby group.'],
  formal: ['Formal message', 'Formellt meddelande', 'To a landlord, employer, shop or authority.'],
  opinion: ['Opinion text', 'Åsiktstext', 'Give and justify your opinion.'],
};
const SOURCES = [
  ['Migri: language skills for citizenship', 'https://migri.fi/en/language-skills'],
  ['OPH: proving your language skills', 'https://www.oph.fi/en/education-and-qualifications/demonstrating-your-language-proficiency-when-applying-finnish'],
  ['Official sample tasks (University of Jyväskylä)', 'https://ykitesti.solki.jyu.fi/en/tutustu-testiin/in-english/intermediate-level-speaking/'],
  ['OPH: subtest days from autumn 2026', 'https://www.oph.fi/en/news/2026/subtest-days-yki-test-will-be-piloted-autumn-2026'],
];

// ---------- data & progress ----------

const loaded = {};
export const loadPart = (id) =>
  (loaded[id] ||= fetch(`data/yki/${id}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && (j.tasks || j.items)) || [])
    .catch(() => []));
const rec = (part) => (S.yki[part] ||= {});
const doneCount = (part, list) => list.filter((t) => rec(part)[t.id]?.done).length;
const wordCount = (s) => (String(s).trim().match(/\S+/g) || []).length;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`;

function award(part, id, xp, extra = {}) {
  const r = rec(part);
  const first = !r[id]?.done;
  r[id] = { ...(r[id] || {}), ...extra, done: 1, t: Date.now() };
  if (first) {
    const { levelUp } = reward(xp, 5);
    sfx('coin');
    toast(`+${xp} XP · +5 kr${levelUp ? ` · ⬆️ Level ${levelUp}!` : ''}`);
    checkAchievements();
  }
  save(true);
}

// ---------- full-screen layers (with ‹ Back and the phone's back gesture) ----------

function screen(title, build) {
  const cleanups = [];
  const body = h('main.y-body');
  let closed = false;
  const el = h(
    'div.y-screen',
    h('div.y-top', h('button.back-btn', { type: 'button', onclick: () => close() }, '‹ Back'), h('div.y-title', title)),
    body,
  );
  const layer = pushLayer(() => close('history'));
  function close(how) {
    if (closed) return;
    closed = true;
    if (how !== 'history') layer.release();
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    el.remove();
    refreshHome();
  }
  document.body.append(el);
  build(body, { onClose: (fn) => cleanups.push(fn), close });
  return close;
}

let homeRefresh = null;
const refreshHome = () => homeRefresh && homeRefresh();

// ---------- home tab ----------

export function ykiView() {
  const parts = h('div.y-parts');
  const draw = () =>
    mount(
      parts,
      PARTS.map((p) => {
        const meta = h('span.y-meta', '…');
        loadPart(p.id).then((list) => {
          meta.textContent = list.length ? `${doneCount(p.id, list)} / ${list.length} practised` : 'Coming soon';
        });
        return h(
          'button.y-part',
          { type: 'button', onclick: () => partList(p) },
          h('span.y-icon', p.icon),
          h('div', h('b', p.title), h('span.muted.small', ` · ${p.sv}`), h('div.muted.small', p.desc), meta),
          h('span.go', '›'),
        );
      }),
    );
  draw();
  homeRefresh = draw;
  return h(
    'div.view.yki',
    h(
      'section.hero.y-hero',
      h('div.hero-top', h('div.hero-emoji', '🇫🇮'), h('div.hero-text', h('div.hero-kicker', 'Finnish citizenship · in Swedish'), h('div.hero-title', 'YKI intermediate level'))),
      h('p.y-hero-sub', 'Grade 3 (≈ B1) in two parts of the test proves your Swedish for citizenship. Practise all four parts here.'),
    ),
    parts,
    aboutCard(),
  );
}

function aboutCard() {
  const sec = (title, ...body) => h('details.y-about', h('summary', title), h('div.y-about-body', ...body));
  return h(
    'section.card.y-info',
    h('h2', 'About the test'),
    sec(
      '🎯 What citizenship needs',
      h('p', 'Satisfactory skills in Finnish or Swedish. With YKI you need ', h('b', 'grade 3 or higher'), ' in one of these pairs of parts:'),
      h('ul', h('li', '🎤 Speaking + ✍️ Writing'), h('li', '🎧 Listening + ✍️ Writing'), h('li', '📖 Reading + 🎤 Speaking')),
      h('p', 'You must already have the certificate when you apply. Other proofs also exist, such as studies in Swedish or Finnish or the civil service language certificate.'),
    ),
    sec(
      '📝 How the test works',
      h('p', 'The intermediate test has four parts. Formats below follow the official sample tasks; details can change.'),
      h(
        'ul',
        h('li', h('b', 'Speaking'), ' (about 20 min, recorded in a language studio): an account, situations where you answer someone on the recording, and a short presentation. You get preparation time and can make notes.'),
        h('li', h('b', 'Writing'), ' (about 55 min): usually three texts, an informal message, a formal message and an opinion text.'),
        h('li', h('b', 'Reading'), ' and ', h('b', 'Listening'), ': multiple-choice, true/false and short open questions. Listening and speaking are done in a studio.'),
      ),
    ),
    sec(
      '🆕 2026–2027',
      h('p', 'From autumn 2026 OPH is piloting ', h('b', 'subtest days'), ': you can register for just one or two parts. A digital version of the test is planned for 2027.'),
    ),
    sec(
      '💡 Tips',
      h(
        'ul',
        h('li', 'Grade 3 does not mean perfect: you need to get your message across clearly, with mostly correct basic grammar.'),
        h('li', 'In speaking, keep talking. Use simple sentences and connect them with "först, sedan, eftersom, men, därför".'),
        h('li', 'In writing, do every point the task asks for. A missing point costs more than a small mistake.'),
        h('li', 'Practise with a timer. The time limits are what surprises people most.'),
      ),
    ),
    h('p.muted.small', '⚠️ This is practice material, not the official test. Check the current format and dates at oph.fi before you book.'),
    h('div.y-sources', SOURCES.map(([t, u]) => h('a', { href: u, target: '_blank', rel: 'noopener' }, t))),
  );
}

// ---------- part lists ----------

async function partList(p) {
  const list = await loadPart(p.id);
  screen(`${p.icon} ${p.title}`, (body) => {
    const draw = () => {
      if (!list.length) return mount(body, h('p.muted.center', 'This part is being written. Check back soon!'));
      const groups = {};
      list.forEach((t) => (groups[t.type || t.kind || 'all'] ||= []).push(t));
      mount(
        body,
        Object.entries(groups).map(([type, items]) =>
          h(
            'section.y-group',
            TYPE_LABEL[type] ? h('div.y-group-head', h('b', TYPE_LABEL[type][0]), h('span.muted.small', ` · ${TYPE_LABEL[type][1]}`), h('div.muted.small', TYPE_LABEL[type][2])) : null,
            items.map((t) => {
              const r = rec(p.id)[t.id];
              const badge = r?.done ? (r.score != null ? `${r.score}/${r.total}` : r.rating || '✓') : '';
              return h('button.y-task' + (r?.done ? '.done' : ''), { type: 'button', onclick: () => openTask(p.id, t, draw) }, h('div', h('b', t.title), h('div.muted.small', t.titleEn)), h('span.y-badge', badge));
            }),
          ),
        ),
      );
    };
    draw();
  });
}

function openTask(part, t, after) {
  const title = TYPE_LABEL[t.type]?.[0] || PARTS.find((p) => p.id === part).title;
  screen(title, (body, api) => {
    api.onClose(() => {
      stopLines();
      after && after();
    });
    if (part === 'speaking') (t.type === 'situation' ? situationTask : speakingTask)(body, t, api);
    else if (part === 'writing') writingTask(body, t, api);
    else questionTask(body, t, api, part);
  });
}

// ---------- shared bits ----------

function toggleEn(sv, en, { tag = 'p' } = {}) {
  const enEl = h(`${tag}.y-en`, { hidden: true }, en);
  const btn = h('button.chip.y-entoggle', { type: 'button', onclick: () => ((enEl.hidden = !enEl.hidden), (btn.textContent = enEl.hidden ? 'Show English' : 'Hide English')) }, 'Show English');
  return [h(`${tag}.y-sv`, sv), enEl, btn];
}
const sayBtns = (text) =>
  h(
    'div.y-say',
    h('button.speaker.sm', { type: 'button', 'aria-label': 'Listen', onclick: () => speak(text) }, '🔊'),
    h('button.speaker.sm', { type: 'button', 'aria-label': 'Listen slowly', onclick: () => speak(text, { rate: slowRate() }) }, '🐢'),
  );
const phraseList = (phrases) =>
  phrases && phrases.length
    ? h('div.y-phrases', phrases.map((p) => h('button.y-phrase', { type: 'button', onclick: () => speak(p.sv) }, h('b', p.sv), h('span.muted.small', p.en))))
    : null;
const tabs = (defs) => {
  const bar = h('div.y-tabs');
  const panes = defs.map(([, build]) => h('div.y-pane', { hidden: true }));
  const show = (i) => {
    defs.forEach((d, k) => {
      panes[k].hidden = k !== i;
      bar.children[k].classList.toggle('sel', k === i);
      if (k === i && !panes[k].childNodes.length) panes[k].append(...[].concat(d[1]()).filter(Boolean));
    });
  };
  defs.forEach(([label], i) => bar.append(h('button.chip', { type: 'button', onclick: () => show(i) }, label)));
  show(0);
  return [bar, ...panes];
};

// Self-recording: stays in memory on this phone, never uploaded.
const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mr = new MediaRecorder(stream);
  const chunks = [];
  mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  mr.start();
  return {
    stop: () =>
      new Promise((res) => {
        mr.onstop = () => {
          stream.getTracks().forEach((tr) => tr.stop());
          res(new Blob(chunks, { type: mr.mimeType || 'audio/mp4' }));
        };
        try {
          mr.stop();
        } catch {
          res(null);
        }
      }),
  };
}
let ownAudio = null;
const playOwn = (blob) => {
  try {
    ownAudio && ownAudio.pause();
    ownAudio = new Audio(URL.createObjectURL(blob));
    ownAudio.play().catch(() => toast('Could not play the recording'));
  } catch {}
};

function countdown(seconds, onTick, onEnd) {
  const t0 = Date.now();
  let stopped = false;
  const iv = setInterval(() => {
    if (stopped) return;
    const left = seconds - (Date.now() - t0) / 1000;
    onTick(Math.max(0, left));
    if (left <= 0) {
      stopped = true;
      clearInterval(iv);
      onEnd();
    }
  }, 200);
  onTick(seconds);
  return () => ((stopped = true), clearInterval(iv));
}

function ratingRow(onRate) {
  const row = h('div.y-rate', h('b', 'How did it go?'));
  [
    ['😬', 'Hard'],
    ['🙂', 'OK'],
    ['😎', 'Easy'],
  ].forEach(([e, l]) =>
    row.append(
      h('button.chip', {
        type: 'button',
        onclick: (ev) => {
          row.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
          ev.currentTarget.classList.add('sel');
          onRate(e);
        },
      }, `${e} ${l}`),
    ),
  );
  return row;
}

// ---------- speaking: account & presentation ----------

function speakingTask(body, t, api) {
  let stopTimer = null;
  let recorder = null;
  let recording = null;
  let wantRecord = canRecord();
  api.onClose(() => {
    stopTimer && stopTimer();
    recorder && recorder.stop();
    stopSpeaking();
  });
  const clock = h('div.y-clock', fmt(t.prep));
  const phase = h('div.y-phase', `Prepare: ${fmt(t.prep)} · Speak: ${fmt(t.speak)}`);
  const actions = h('div.y-actions');
  const after = h('div.y-after');

  const idle = () => {
    clock.textContent = fmt(t.prep);
    clock.className = 'y-clock';
    phase.textContent = `Prepare: ${fmt(t.prep)} · Speak: ${fmt(t.speak)}`;
    mount(
      actions,
      h('button.btn.wide', { type: 'button', onclick: prep }, '▶ Start preparing'),
      canRecord()
        ? h('label.y-check', h('input', { type: 'checkbox', checked: wantRecord, onchange: (e) => (wantRecord = e.target.checked) }), ' Record my answer (it stays on this phone)')
        : h('p.muted.small', 'Recording is not available in this browser. Speak out loud anyway!'),
    );
  };
  const prep = () => {
    sfx('tap');
    clock.className = 'y-clock prep';
    phase.textContent = '📝 Prepare: think and make notes';
    mount(actions, h('button.btn.ghost.wide', { type: 'button', onclick: talk }, 'I’m ready, start speaking'));
    stopTimer && stopTimer();
    stopTimer = countdown(t.prep, (s) => (clock.textContent = fmt(s)), talk);
  };
  const talk = async () => {
    stopTimer && stopTimer();
    sfx('tick');
    clock.className = 'y-clock speak';
    phase.textContent = '🎤 Speak now!';
    mount(actions, h('button.btn.wide.bad', { type: 'button', onclick: finish }, '■ Stop'));
    recording = null;
    if (wantRecord) {
      try {
        recorder = await startRecording();
        phase.textContent = '🔴 Recording · speak now!';
      } catch {
        recorder = null;
        phase.textContent = '🎤 Speak now! (microphone not allowed)';
      }
    }
    stopTimer = countdown(t.speak, (s) => (clock.textContent = fmt(s)), finish);
  };
  const finish = async () => {
    stopTimer && stopTimer();
    stopTimer = null;
    clock.className = 'y-clock';
    clock.textContent = '✓';
    phase.textContent = 'Time’s up. Compare with the model answer below.';
    if (recorder) {
      recording = await recorder.stop();
      recorder = null;
    }
    mount(
      actions,
      recording ? h('button.btn.wide', { type: 'button', onclick: () => playOwn(recording) }, '▶ Listen to yourself') : null,
      h('button.btn.ghost.wide', { type: 'button', onclick: idle }, '↺ Try again'),
    );
    mount(after, ratingRow((r) => award('speaking', t.id, 10, { rating: r })));
  };

  mount(
    body,
    h('section.card.y-prompt', h('div.y-kicker', TYPE_LABEL[t.type][1]), h('h2', t.title), ...toggleEn(t.prompt, t.promptEn), sayBtns(t.prompt)),
    ...tabs([
      [
        '🎤 Practice',
        () => [h('section.card.y-timer', clock, phase, actions), after],
      ],
      [
        '🧭 How to answer',
        () => [
          h('section.card', h('h3', 'Structure'), h('ol.y-steps', (t.structure || []).map((s) => h('li', s)))),
          h('section.card', h('h3', 'Tips'), h('ul', (t.tips || []).map((s) => h('li', s)))),
          h('section.card', h('h3', 'Useful phrases'), h('p.muted.small', 'Tap to hear.'), phraseList(t.phrases)),
        ],
      ],
      [
        '⭐ Model answer',
        () => [h('section.card.y-model', h('p.muted.small', 'An example of a good grade-3 answer. Yours can be simpler.'), ...toggleEn(t.model, t.modelEn, { tag: 'div' }), sayBtns(t.model))],
      ],
    ]),
  );
  idle();
}

// ---------- speaking: situations ----------

function situationTask(body, t, api) {
  let stopTimer = null;
  let recorder = null;
  let showText = false;
  api.onClose(() => {
    stopTimer && stopTimer();
    recorder && recorder.stop();
    stopSpeaking();
  });
  const chat = h('div.y-chat');
  const actions = h('div.y-actions');
  const after = h('div.y-after');
  let i = -1;

  const bubble = (who, sv, en, extra) => h(`div.y-bubble.${who}`, h('div.y-bubble-text', sv), en ? h('div.y-en.small', { hidden: true }, en) : null, extra || null);
  const next = async () => {
    i++;
    if (i >= t.turns.length) return done();
    const turn = t.turns[i];
    const themText = h('div.y-bubble-text', showText ? turn.them : '🔊 …');
    const them = h('div.y-bubble.them', themText, h('button.chip.small', { type: 'button', onclick: () => speak(turn.them) }, '🔊 again'), h('button.chip.small', { type: 'button', onclick: () => (themText.textContent = turn.them) }, 'Show text'));
    chat.append(them);
    them.scrollIntoView({ block: 'end', behavior: 'smooth' });
    mount(actions, h('p.muted.center', 'Listen…'));
    await speak(turn.them);
    yourTurn(turn);
  };
  const yourTurn = async (turn) => {
    const clock = h('span.y-mini-clock', fmt(t.reply));
    mount(actions, h('div.y-goal', h('b', 'Your turn: '), turn.goal, ' ', clock), h('button.btn.wide', { type: 'button', onclick: () => endTurn(turn) }, '✓ Done'));
    if (canRecord()) {
      try {
        recorder = await startRecording();
      } catch {
        recorder = null;
      }
    }
    stopTimer = countdown(t.reply, (s) => (clock.textContent = fmt(s)), () => endTurn(turn));
  };
  const endTurn = async (turn) => {
    stopTimer && stopTimer();
    stopTimer = null;
    let blob = null;
    if (recorder) {
      blob = await recorder.stop();
      recorder = null;
    }
    const mine = blob ? h('button.chip.small', { type: 'button', onclick: () => playOwn(blob) }, '▶ me') : null;
    chat.append(bubble('you', turn.you, turn.youEn, h('div.y-bubble-tools', h('span.muted.small', 'Model reply'), h('button.chip.small', { type: 'button', onclick: () => speak(turn.you) }, '🔊'), mine)));
    mount(actions, h('button.btn.wide', { type: 'button', onclick: next }, i + 1 < t.turns.length ? 'Next ›' : 'Finish'));
    chat.lastChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };
  const done = () => {
    mount(actions, h('button.btn.ghost.wide', { type: 'button', onclick: restart }, '↺ Practise again'), h('button.btn.ghost.wide', { type: 'button', onclick: () => chat.querySelectorAll('.y-en').forEach((e) => (e.hidden = !e.hidden)) }, 'Show / hide English'));
    mount(after, h('section.card', h('h3', 'Useful phrases'), phraseList(t.phrases)), h('section.card', h('h3', 'Tips'), h('ul', (t.tips || []).map((s) => h('li', s)))), ratingRow((r) => award('speaking', t.id, 10, { rating: r })));
  };
  const restart = () => {
    i = -1;
    chat.replaceChildren();
    after.replaceChildren();
    start();
  };
  const start = () =>
    mount(
      actions,
      h('button.btn.wide', { type: 'button', onclick: next }, '▶ Start the conversation'),
      h('label.y-check', h('input', { type: 'checkbox', onchange: (e) => (showText = e.target.checked) }), ' Show what they say as text (the real test is audio only)'),
      canRecord() ? h('p.muted.small', 'Your answers are recorded so you can listen back. They stay on this phone.') : null,
    );

  mount(
    body,
    h('section.card.y-prompt', h('div.y-kicker', TYPE_LABEL.situation[1]), h('h2', t.title), ...toggleEn(t.context, t.contextEn), h('p.muted.small', `You have about ${t.reply} seconds for each answer.`)),
    chat,
    h('section.y-dock', actions),
    after,
  );
  start();
}

// ---------- writing ----------

function writingTask(body, t, api) {
  const r = rec('writing')[t.id] || {};
  const [lo, hi] = t.words;
  const ta = h('textarea.y-text', { rows: 9, lang: 'sv', spellcheck: false, autocapitalize: 'sentences', placeholder: 'Skriv här…' });
  ta.value = r.text || '';
  const counter = h('div.y-count');
  const updateCount = () => {
    const n = wordCount(ta.value);
    counter.textContent = `${n} words · aim ${lo}–${hi}`;
    counter.className = 'y-count' + (n >= lo && n <= hi ? ' ok' : n > hi ? ' over' : '');
  };
  let saveT = null;
  ta.addEventListener('input', () => {
    updateCount();
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      rec('writing')[t.id] = { ...(rec('writing')[t.id] || {}), text: ta.value, t: Date.now() };
      save();
    }, 400);
  });
  api.onClose(() => {
    clearTimeout(saveT);
    if (ta.value !== (r.text || '')) {
      rec('writing')[t.id] = { ...(rec('writing')[t.id] || {}), text: ta.value, t: Date.now() };
      save(true);
    }
    stopTimer && stopTimer();
  });
  const insert = (ch) => {
    const s = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, s) + ch + ta.value.slice(ta.selectionEnd ?? s);
    ta.focus();
    ta.setSelectionRange(s + 1, s + 1);
    ta.dispatchEvent(new Event('input'));
  };
  let stopTimer = null;
  const timer = h('button.chip', {
    type: 'button',
    onclick: () => {
      if (stopTimer) return;
      stopTimer = countdown(t.minutes * 60, (s) => (timer.textContent = `⏱ ${fmt(s)}`), () => ((timer.textContent = '⏱ Time’s up'), sfx('tick')));
    },
  }, `⏱ Start ${t.minutes}-min timer`);
  const result = h('div');
  const compare = () => {
    const checks = (t.checklist || []).map((c) => h('label.y-check', h('input', { type: 'checkbox' }), ' ', c));
    mount(
      result,
      h('section.card', h('h3', '✅ Check your text'), h('p.muted.small', 'Tick what your text does. The exam rewards doing every point.'), checks),
      h('section.card.y-model', h('h3', '⭐ Model text'), ...toggleEn(t.model, t.modelEn, { tag: 'div' }), sayBtns(t.model)),
      h('section.card', h('h3', 'Useful phrases'), phraseList(t.phrases)),
      h('button.btn.wide', { type: 'button', onclick: () => award('writing', t.id, 15, { text: ta.value }) }, '✓ Mark as done'),
    );
    result.firstChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  mount(
    body,
    h(
      'section.card.y-prompt',
      h('div.y-kicker', TYPE_LABEL[t.type][1]),
      h('h2', t.title),
      ...toggleEn(t.prompt, t.promptEn),
      h('ul.y-points', t.points.map((p) => h('li', p))),
      h('p.muted.small', `About ${lo}–${hi} words · suggested time ${t.minutes} min`),
      timer,
    ),
    h('section.card.y-write', ta, h('div.special', ['å', 'ä', 'ö', 'é'].map((ch) => h('button.key', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => insert(ch) }, ch))), counter),
    h('button.btn.wide', { type: 'button', onclick: compare }, 'Compare with the model'),
    result,
  );
  updateCount();
}

// ---------- reading & listening ----------

function questionTask(body, t, api, part) {
  const listening = part === 'listening';
  let plays = 0;
  const maxPlays = t.plays || 2;
  let checked = false;
  const picks = t.questions.map(() => null);
  const playBtn = h('button.btn.wide', { type: 'button' });
  const drawPlay = () => {
    const left = maxPlays - plays;
    playBtn.textContent = checked ? '▶ Listen again' : left > 0 ? `▶ Listen (${left} of ${maxPlays} left)` : 'No listens left: answer the questions';
    playBtn.disabled = !checked && left <= 0;
  };
  playBtn.onclick = async () => {
    if (!checked && plays >= maxPlays) return;
    plays++;
    drawPlay();
    playBtn.disabled = true;
    await speakLines(t.script);
    playBtn.disabled = false;
    drawPlay();
  };
  api.onClose(stopLines);

  const qEls = t.questions.map((q, qi) => {
    const opts = q.type === 'tf' ? [true, false] : q.options.map((_, k) => k);
    const label = (o) => (q.type === 'tf' ? (o ? 'Sant (true)' : 'Falskt (false)') : q.options[o]);
    const btns = opts.map((o) =>
      h('button.opt', {
        type: 'button',
        onclick: () => {
          if (checked) return;
          picks[qi] = o;
          btns.forEach((b, k) => b.classList.toggle('selected', opts[k] === o));
          sfx('tap');
        },
      }, h('span.lbl', label(o))),
    );
    const explain = h('div.y-explain', { hidden: true });
    return { q, opts, btns, explain, el: h('div.y-q', h('div.y-qtext', `${qi + 1}. ${q.q}`), h('div.opts' + (q.type === 'tf' ? '.tf' : ''), btns), explain) };
  });

  const result = h('div');
  const check = () => {
    if (picks.some((p) => p === null)) return toast('Answer every question first');
    checked = true;
    let score = 0;
    qEls.forEach(({ q, opts, btns, explain }, qi) => {
      const ok = picks[qi] === q.answer;
      if (ok) score++;
      btns.forEach((b, k) => {
        b.disabled = true;
        b.classList.remove('selected');
        if (opts[k] === q.answer) b.classList.add('correct');
        else if (opts[k] === picks[qi]) b.classList.add('wrong');
      });
      explain.hidden = false;
      explain.textContent = `${ok ? '✅' : '❌'} ${q.explain}`;
    });
    const total = t.questions.length;
    const prev = rec(part)[t.id];
    sfx(score === total ? 'win' : 'correct');
    if (score === total) confetti(50);
    mount(
      result,
      h('div.banner', `${score === total ? '🌟' : '📊'} ${score} / ${total} correct`),
      listening
        ? h('section.card', h('h3', 'Transcript'), t.script.map((l) => h('p.y-line', h('b', `${l.spk}: `), l.text)), ...toggleEn('', t.scriptEn))
        : h('section.card', ...toggleEn('', t.textEn, { tag: 'div' })),
      t.glossary ? h('section.card', h('h3', 'Words'), h('div.y-phrases', t.glossary.map((g) => h('button.y-phrase', { type: 'button', onclick: () => speak(g.sv) }, h('b', g.sv), h('span.muted.small', g.en))))) : null,
    );
    if (!prev || score > (prev.score || 0)) award(part, t.id, 2 * score, { score, total });
    else rec(part)[t.id] = { ...prev, t: Date.now() };
    save(true);
    checkBtn.hidden = true;
    drawPlay();
    result.firstChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const checkBtn = h('button.btn.wide', { type: 'button', onclick: check }, 'Check answers');

  mount(
    body,
    listening
      ? h('section.card.y-prompt', h('div.y-kicker', 'Hörförståelse'), h('h2', t.title), h('p.muted.small', `Listen (up to ${maxPlays} times), then answer. The transcript appears after you check.`), playBtn)
      : h('section.card.y-prompt.y-reading', h('div.y-kicker', 'Läsförståelse'), h('h2', t.title), String(t.text).split(/\n\n+/).map((p) => h('p', p))),
    h('section.card', h('h3', 'Questions'), qEls.map((x) => x.el)),
    checkBtn,
    result,
  );
  if (listening) drawPlay();
}
