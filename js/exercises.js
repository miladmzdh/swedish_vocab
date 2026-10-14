// Exercise builders and renderers. A renderer gets (ex, ctx) and calls ctx.answer(ok, info) exactly once
// (match exercises call ctx.mistake(word) for wrong taps and ctx.answer when the board is cleared).
import { h } from './ui.js';
import { S } from './store.js';
import { display, prefix, distractors, shuffle, splitExample, unitWords, WORDS, SV_FORMS, POS_LABEL, FORM_LABELS } from './data.js';
import { sayWord, speak, slowRate, sfx, findNative, cachedNative, playNative, nativeStatus, swedishVoices, ttsSupported, listenOnce, speechRecognitionSupported } from './audio.js';
import { checkTyped, checkSpoken, norm } from './answer.js';

// ---------- capability checks ----------

export const canListen = () => ttsSupported() && swedishVoices().length > 0;
let speakPausedUntil = 0;
export const canSpeakEx = () => speechRecognitionSupported() && S.settings.speaking && Date.now() > speakPausedUntil;
export const pauseSpeaking = (ms = 3600000) => (speakPausedUntil = Date.now() + ms);

const FORM_PROMPT = {
  noun: ['definite singular — "the …"', 'plural', 'definite plural — "the …s"'],
  verb: ['present tense', 'past tense', 'supine — "har …"', 'imperative'],
  adj: ['ett-form (neuter)', 'plural / definite form', 'comparative — "more …"', 'superlative — "most …"'],
};

const isGenderNoun = (w) => w.pos === 'noun' && (w.g === 'en' || w.g === 'ett');
const scrambleable = (w) => /^[a-zåäöéü]{3,12}$/i.test(w.sv);

function formChoices(w) {
  if (!w.f) return null;
  const all = [w.sv, ...w.f].filter(Boolean);
  const idx = w.f.map((f, i) => i).filter((i) => w.f[i] && w.f[i] !== w.sv && all.filter((x) => x === w.f[i]).length === 1);
  if (!idx.length) return null;
  const i = idx[Math.floor(Math.random() * idx.length)];
  const opts = [...new Set(all)];
  if (opts.length < 3) return null;
  const answer = w.f[i];
  const others = shuffle(opts.filter((o) => o !== answer)).slice(0, 3);
  return { i, answer, options: shuffle([answer, ...others]) };
}

/** Which exercise types suit a word at a given difficulty stage (0 = brand new, 1 = learning, 2 = known). */
export function typesFor(w, stage) {
  const t = [];
  const listen = canListen();
  const typing = S.settings.typing;
  if (stage === 0) {
    t.push('sv2en', 'en2sv');
    if (listen) t.push('listen');
  } else if (stage === 1) {
    t.push('en2sv', 'sv2en');
    if (listen) t.push('listen');
    if (isGenderNoun(w)) t.push('gender');
    if (w.ex) t.push('cloze');
    if (formChoices(w)) t.push('form');
    if (scrambleable(w)) t.push('scramble');
    if (typing) t.push('type');
  } else {
    if (typing) t.push('type', 'type');
    if (typing && listen) t.push('dictation');
    if (w.ex) t.push('cloze');
    if (formChoices(w)) t.push('form', 'form');
    if (isGenderNoun(w)) t.push('gender');
    if (canSpeakEx() && w.sv.length <= 30) t.push('speak');
    t.push('en2sv');
    if (scrambleable(w)) t.push('scramble');
  }
  return t;
}

export function stageOf(rec) {
  if (!rec || rec.b <= 1) return rec && rec.c > 2 ? 1 : 0;
  return rec.b <= 3 ? 1 : 2;
}

export function makeExercise(type, w, pool) {
  pool = pool && pool.length >= 8 ? pool : WORDS;
  switch (type) {
    case 'sv2en':
      return { type, w, options: shuffle([w, ...distractors(w, 3, pool, (x) => x.en)]), label: (x) => x.en };
    case 'en2sv':
    case 'listen':
      return { type, w, options: shuffle([w, ...distractors(w, 3, pool)]), label: (x) => display(x) };
    case 'gender':
      return { type, w };
    case 'form': {
      const fc = formChoices(w);
      return fc ? { type, w, ...fc } : makeExercise('en2sv', w, pool);
    }
    case 'cloze': {
      const parts = splitExample(w);
      if (!parts.word) return makeExercise('en2sv', w, pool);
      const markOf = (x) => splitExample(x).word;
      const others = distractors(w, 6, pool)
        .map(markOf)
        .filter((m) => m && norm(m) !== norm(parts.word));
      const uniq = [...new Set(others)].slice(0, 3);
      if (uniq.length < 2) return makeExercise('en2sv', w, pool);
      return { type, w, parts, options: shuffle([parts.word, ...uniq]) };
    }
    case 'scramble': {
      const letters = [...w.sv.toLowerCase()];
      let tiles = shuffle(letters);
      for (let i = 0; i < 5 && tiles.join('') === letters.join(''); i++) tiles = shuffle(letters);
      return { type, w, tiles };
    }
    default:
      return { type, w };
  }
}

export function exerciseFor(w, stage, pool, avoid) {
  let types = typesFor(w, stage);
  if (avoid && types.length > 1) types = types.filter((t) => t !== avoid);
  return makeExercise(types[Math.floor(Math.random() * types.length)], w, pool);
}

// ---------- shared pieces ----------

const ICON_SPEAKER =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
const ICON_TURTLE = '🐢';

// 🔊 / 🐢 always use the phone's Swedish voice (normal / half speed). The big listening button plays the
// best available audio: the native recording when one exists, otherwise the phone voice.
export function speakerBtn(w, { big = false, slow = false, label } = {}) {
  return h(
    'button.speaker' + (big ? '.big' : ''),
    {
      type: 'button',
      'aria-label': label || (slow ? 'Phone voice, slow' : big ? 'Play' : 'Phone voice'),
      title: slow ? 'Phone voice, slow' : big ? 'Play' : 'Phone voice',
      onclick: (e) => {
        e.stopPropagation();
        sayWord(w, slow ? { slow: true, native: false } : { native: big });
      },
      html: slow ? ICON_TURTLE : ICON_SPEAKER,
    },
  );
}

/** 🎙️ native speaker at the original speed. Hidden until a recording is found for this word. */
export function nativeBtn(w, { onStatus } = {}) {
  const btn = h('button.speaker.native', { type: 'button', 'aria-label': 'Native speaker (original speed)', title: 'Native speaker (original speed)', hidden: true, onclick: (e) => (e.stopPropagation(), playNative(w)) }, '🎙️');
  if (!S.settings.native || /\s/.test(w.sv)) {
    onStatus && onStatus('off', null);
    return btn;
  }
  const show = (n) => {
    btn.hidden = !n;
    onStatus && onStatus(n ? 'found' : nativeStatus(w.sv) === 'none' ? 'none' : 'unknown', n);
  };
  const c = cachedNative(w.sv);
  if (c) show(c);
  else {
    onStatus && onStatus('looking', null);
    findNative(w.sv).then(show);
  }
  return btn;
}

export function ipaLine(w) {
  if (!S.settings.showIpa || !w.ipa) return null;
  return h(
    'div.ipa',
    `/${w.ipa}/`,
    w.tone && /[ˈ]/.test(w.ipa) ? h('span.chip.tone', { title: w.tone === 2 ? 'Accent 2: the "sing-song" double tone' : 'Accent 1: single falling tone' }, `accent ${w.tone}`) : null,
  );
}

function formsTable(w) {
  if (!w.f || !FORM_LABELS[w.pos]) return null;
  const rows = w.f.map((f, i) => (f ? h('tr', h('th', FORM_LABELS[w.pos][i]), h('td', f)) : null)).filter(Boolean);
  return rows.length ? h('table.forms', rows) : null;
}

export function exampleBlock(w, { speakable = true } = {}) {
  if (!w.ex) return null;
  const p = splitExample(w);
  const plain = w.ex.replace(/[{}]/g, '');
  return h(
    'div.example',
    h(
      'p.sv',
      speakable ? { onclick: () => speak(plain), role: 'button', tabindex: 0, title: 'Tap to listen' } : null,
      p.before,
      h('b', p.word),
      p.after,
      speakable ? h('span.mini', ' 🔊') : null,
    ),
    h('p.en', w.exEn),
    speakable
      ? h('button.chip.slow-ex', { type: 'button', onclick: (e) => (e.stopPropagation(), speak(plain, { rate: slowRate() })) }, '🐢 Slowly')
      : null,
  );
}

function setNativeLine(el, st, n) {
  el.replaceChildren(
    ...(st === 'found'
      ? ['🎙️ Native speaker: ', h('a.credit', { href: n.page, target: '_blank', rel: 'noopener' }, n.credit)]
      : st === 'looking'
        ? ['Looking for a native-speaker recording…']
        : st === 'none'
          ? ['No native recording of this word yet: 🔊 uses your phone’s Swedish voice.']
          : []),
  );
}

export function wordCard(w, { compact = false } = {}) {
  const nativeLine = h('div.native-line.muted.small');
  return h(
    'div.wordcard',
    h(
      'div.headline',
      h('div', prefix(w) ? h('span.prefix', prefix(w) + ' ') : null, h('span.sv', w.sv)),
      speakerBtn(w),
      speakerBtn(w, { slow: true }),
      nativeBtn(w, { onStatus: (st, n) => setNativeLine(nativeLine, st, n) }),
    ),
    ipaLine(w),
    nativeLine,
    h('div.en', w.en),
    h('div.meta', h('span.chip', POS_LABEL[w.pos] || w.pos), w.g === 'pl' ? h('span.chip', 'plural only') : null, h('span.chip', w.lvl)),
    compact ? null : formsTable(w),
    compact ? null : exampleBlock(w),
    w.note ? h('div.note', '💡 ', w.note) : null,
  );
}

function optionButtons(options, label, correct, ctx, { onPick } = {}) {
  let done = false;
  const btns = options.map((o, i) =>
    h(
      'button.opt',
      {
        type: 'button',
        onclick: () => {
          if (done) return;
          done = true;
          const ok = o === correct;
          btn(i).classList.add(ok ? 'correct' : 'wrong');
          if (!ok) btns[options.indexOf(correct)].classList.add('correct');
          btns.forEach((b) => (b.disabled = true));
          onPick && onPick(o, ok);
          ctx.answer(ok, { picked: o });
        },
      },
      h('span.key', String(i + 1)),
      h('span.lbl', label(o)),
    ),
  );
  const btn = (i) => btns[i];
  ctx.keys = (k) => {
    const n = Number(k);
    if (n >= 1 && n <= btns.length) btns[n - 1].click();
  };
  return h('div.opts', btns);
}

function typedInput(ctx, accepted, { placeholder = 'Type in Swedish', w } = {}) {
  const input = h('input.answer', {
    type: 'text',
    lang: 'sv',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
    enterkeyhint: 'done',
    placeholder,
    'aria-label': placeholder,
  });
  const insert = (ch) => {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, s) + ch + input.value.slice(e);
    input.focus();
    input.setSelectionRange(s + 1, s + 1);
    ctx.setCheck(input.value.trim() ? check : null);
  };
  const keys = h(
    'div.special',
    ['å', 'ä', 'ö', 'é'].map((ch) =>
      h('button.key', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => insert(ch) }, ch),
    ),
  );
  let done = false;
  const check = () => {
    if (done || !input.value.trim()) return;
    done = true;
    input.disabled = true;
    const res = checkTyped(input.value, accepted, {
      isOtherWord: (s) => SV_FORMS.has(s) && !accepted.some((a) => norm(a) === s || norm(a).replace(/^(en|ett|att) /, '') === s),
    });
    input.classList.add(res.ok ? 'correct' : 'wrong');
    ctx.answer(res.ok, { kind: res.kind, typed: input.value, expected: res.expected });
  };
  input.addEventListener('input', () => ctx.setCheck(input.value.trim() ? check : null));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      check();
    }
  });
  ctx.focus = () => input.focus({ preventScroll: true });
  return h('div.typed', input, keys);
}

const header = (text) => h('div.instr', text);

// ---------- renderers ----------

export const RENDER = {
  intro(ex, ctx) {
    const w = ex.w;
    ctx.setCheck(() => ctx.answer(null), 'Got it');
    if (S.settings.autoplay) setTimeout(() => sayWord(w), 250);
    return h('div.ex.intro', header('New word'), wordCard(w));
  },

  sv2en(ex, ctx) {
    const w = ex.w;
    if (S.settings.autoplay) setTimeout(() => sayWord(w), 200);
    return h(
      'div.ex',
      header('What does this mean?'),
      h('div.prompt', h('div.big-word', prefix(w) ? h('span.prefix', prefix(w) + ' ') : null, w.sv), h('div.row.center-row', speakerBtn(w), speakerBtn(w, { slow: true }), nativeBtn(w)), ipaLine(w)),
      optionButtons(ex.options, ex.label, w, ctx),
    );
  },

  en2sv(ex, ctx) {
    const w = ex.w;
    return h(
      'div.ex',
      header('Choose the Swedish word'),
      h('div.prompt', h('div.big-en', w.en), h('div.hint', POS_LABEL[w.pos])),
      optionButtons(ex.options, ex.label, w, ctx),
    );
  },

  listen(ex, ctx) {
    const w = ex.w;
    setTimeout(() => sayWord(w), 250);
    return h(
      'div.ex',
      header('What do you hear?'),
      h('div.prompt.listen', speakerBtn(w, { big: true }), speakerBtn(w, { slow: true }), nativeBtn(w)),
      optionButtons(ex.options, ex.label, w, ctx),
    );
  },

  gender(ex, ctx) {
    const w = ex.w;
    return h(
      'div.ex',
      header('En or ett?'),
      h('div.prompt', h('div.big-word', h('span.blank', '___'), ' ', w.sv), h('div.hint', w.en)),
      optionButtons(['en', 'ett'], (x) => x, w.g, ctx),
    );
  },

  form(ex, ctx) {
    const w = ex.w;
    return h(
      'div.ex',
      header(`Pick the ${FORM_PROMPT[w.pos][ex.i]}`),
      h('div.prompt', h('div.big-word', prefix(w) ? h('span.prefix', prefix(w) + ' ') : null, w.sv), h('div.hint', w.en)),
      optionButtons(ex.options, (x) => x, ex.answer, ctx, { onPick: () => speak(ex.answer) }),
    );
  },

  cloze(ex, ctx) {
    const w = ex.w;
    const p = ex.parts;
    return h(
      'div.ex',
      header('Fill in the gap'),
      h('div.prompt.cloze', h('p.sv', p.before, h('span.gap', '_____'), p.after), h('p.en', w.exEn)),
      optionButtons(ex.options, (x) => x, p.word, ctx, { onPick: () => speak(w.ex.replace(/[{}]/g, '')) }),
    );
  },

  type(ex, ctx) {
    const w = ex.w;
    const hint = w.pos === 'noun' && w.g !== 'pl' ? 'noun — the article is optional' : POS_LABEL[w.pos];
    return h(
      'div.ex',
      header('Write this in Swedish'),
      h('div.prompt', h('div.big-en', w.en), h('div.hint', hint)),
      typedInput(ctx, [w.sv, display(w)], { w }),
    );
  },

  dictation(ex, ctx) {
    const w = ex.w;
    setTimeout(() => sayWord(w), 250);
    return h(
      'div.ex',
      header('Type what you hear'),
      h('div.prompt.listen', speakerBtn(w, { big: true }), speakerBtn(w, { slow: true }), nativeBtn(w)),
      typedInput(ctx, [w.sv, display(w)], { placeholder: 'Type what you hear', w }),
    );
  },

  scramble(ex, ctx) {
    const w = ex.w;
    const target = w.sv.toLowerCase();
    const slots = h('div.slots');
    const tray = h('div.tray');
    const picked = [];
    let done = false;
    const tiles = ex.tiles.map((ch, i) =>
      h('button.ltile', { type: 'button', onclick: () => pickTile(i) }, ch),
    );
    function redraw() {
      slots.replaceChildren(
        ...target.split('').map((_, k) =>
          h('button.slot' + (picked[k] != null ? '.filled' : ''), { type: 'button', onclick: () => unpick(k) }, picked[k] != null ? ex.tiles[picked[k]] : ''),
        ),
      );
      tiles.forEach((t, i) => (t.disabled = picked.includes(i) || done));
    }
    function pickTile(i) {
      if (done || picked.includes(i)) return;
      sfx('tap');
      picked.push(i);
      redraw();
      if (picked.length === target.length) {
        done = true;
        const ok = picked.map((k) => ex.tiles[k]).join('') === target;
        slots.classList.add(ok ? 'correct' : 'wrong');
        redraw();
        ctx.answer(ok, { typed: picked.map((k) => ex.tiles[k]).join(''), expected: w.sv });
      }
    }
    function unpick(k) {
      if (done || picked[k] == null) return;
      picked.splice(k, 1);
      redraw();
    }
    tray.append(...tiles);
    redraw();
    return h('div.ex', header('Spell the Swedish word'), h('div.prompt', h('div.big-en', w.en), h('div.hint', POS_LABEL[w.pos])), slots, tray);
  },

  match(ex, ctx) {
    const words = ex.words;
    const left = shuffle(words);
    const right = shuffle(words);
    let sel = null;
    let errors = 0;
    const L = left.map((w) => h('button.mcard', { type: 'button', onclick: () => tapLeft(w, L[left.indexOf(w)]) }, display(w)));
    const R = right.map((w) => h('button.mcard', { type: 'button', onclick: () => tapRight(w, R[right.indexOf(w)]) }, w.en));
    let remaining = words.length;
    function tapLeft(w, el) {
      if (el.disabled) return;
      sayWord(w);
      L.forEach((b) => b.classList.remove('sel'));
      el.classList.add('sel');
      sel = { w, el };
    }
    function tapRight(w, el) {
      if (el.disabled || !sel) return;
      if (w === sel.w) {
        sfx('correct');
        sel.el.classList.replace('sel', 'done');
        el.classList.add('done');
        sel.el.disabled = el.disabled = true;
        sel = null;
        if (--remaining === 0) ctx.answer(errors === 0, { match: true });
      } else {
        sfx('wrong');
        errors++;
        ctx.mistake(sel.w);
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 400);
      }
    }
    return h('div.ex', header('Tap the matching pairs'), h('div.match', h('div.col', L), h('div.col', R)));
  },

  speak(ex, ctx) {
    const w = ex.w;
    let tries = 0;
    const status = h('div.heard', 'Tap the microphone and say the word.');
    const mic = h(
      'button.mic',
      {
        type: 'button',
        'aria-label': 'Speak',
        onclick: async () => {
          if (mic.classList.contains('on')) return;
          mic.classList.add('on');
          status.textContent = 'Listening…';
          try {
            const heard = await listenOnce();
            mic.classList.remove('on');
            const ok = checkSpoken(heard, w.sv);
            tries++;
            if (ok) {
              status.textContent = `✅ “${heard[0]}”`;
              ctx.answer(true, { spoken: true });
            } else {
              status.textContent = heard.length ? `I heard “${heard[0]}”. Try again!` : 'I didn’t catch that. Try again!';
              if (tries >= 3) ctx.answer(null, { spoken: false, skip: true });
            }
          } catch (e) {
            mic.classList.remove('on');
            status.textContent = /not-allowed|denied/i.test(e.message)
              ? 'Microphone access is blocked. You can turn speaking exercises off in Settings.'
              : 'Speech recognition is not available right now.';
            ctx.answer(null, { skip: true });
          }
        },
      },
      '🎤',
    );
    return h(
      'div.ex',
      header('Say it out loud'),
      h('div.prompt', h('div.big-word', w.sv), h('div.row.center-row', speakerBtn(w), speakerBtn(w, { slow: true }), nativeBtn(w)), ipaLine(w), h('div.hint', w.en)),
      h('div.speakbox', mic, status),
      h(
        'button.btn.ghost.small',
        {
          type: 'button',
          onclick: () => {
            pauseSpeaking();
            ctx.answer(null, { skip: true });
          },
        },
        "Can't speak now",
      ),
    );
  },
};

// Text shown in the feedback panel after a wrong answer.
export function solutionText(ex) {
  const w = ex.w;
  switch (ex.type) {
    case 'sv2en':
      return w.en;
    case 'gender':
      return display(w);
    case 'form':
      return `${ex.answer} (${FORM_PROMPT[w.pos][ex.i].split(' —')[0]} of ${w.sv})`;
    case 'cloze':
      return w.ex.replace(/[{}]/g, '');
    default:
      return display(w);
  }
}
