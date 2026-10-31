// "Grade in ChatGPT": builds an examiner prompt from a YKI task (and the learner's answer) and opens it
// as a new chat (chatgpt.com/?q=…). The prompt is also copied, so it can be pasted if the chat opens empty
// or into any other AI. Nothing is sent anywhere until the learner taps the button.
import { h, toast } from './ui.js';

const CHATGPT = 'https://chatgpt.com/';
const MAX_URL = 7000; // longer links get cut off by some browsers; then we rely on the copied prompt

const EXAMINER =
  'You are an experienced examiner for the Finnish National Certificates of Language Proficiency (YKI), Swedish, intermediate level. ' +
  'The intermediate level is graded 3, 4 or 5 (below 3 = not passed); grade 3 is about CEFR B1, the level needed for Finnish citizenship. ' +
  'I am an adult learner in Finland practising for the test.';
const HONEST = 'Be encouraging but honest: do not give a higher grade than my answer deserves. Write your feedback in English and quote Swedish where useful.';
const SPOKEN = 'I will answer by voice dictation, so my answer arrives as a transcript: ignore punctuation, capital letters and spelling, and judge it as speech.';

const clean = (s) => String(s || '').replace(/\*([^*]+)\*/g, '$1').trim();
const list = (items, numbered) => items.map((x, i) => `${numbered ? `${i + 1}.` : '-'} ${clean(x)}`).join('\n');
const quote = (s) => `"""\n${String(s).trim()}\n"""`;

export function writingPrompt(t, label, text) {
  const n = (String(text).trim().match(/\S+/g) || []).length;
  return [
    EXAMINER,
    `Please grade my answer to this writing task (${label}, about ${t.words[0]}–${t.words[1]} words, ${t.minutes} minutes).`,
    `TASK:\n${t.prompt}\n(In English: ${t.promptEn})`,
    `The text must:\n${list(t.points)}`,
    `MY TEXT (${n} words):\n${quote(text)}`,
    'Give me:\n' +
      '1. An estimated YKI grade (below 3, 3, 4 or 5) and one sentence on why.\n' +
      '2. Task completion: did I cover every point? Is the register (formal or informal) right? Is the length OK?\n' +
      '3. My most important language mistakes as "wrong → right" with a short reason (at most 8). Skip tiny typos unless they change the meaning.\n' +
      '4. A corrected version of my text that keeps my ideas and stays at about B1 level.\n' +
      '5. Two or three tips for my next text.',
    HONEST,
  ].join('\n\n');
}

export function speakingPrompt(t, label) {
  return [
    EXAMINER,
    `Let's practise this speaking task (${label}). In the test I get ${t.prep} seconds to prepare and ${t.speak} seconds to speak.`,
    `TASK:\n${t.prompt}\n(In English: ${t.promptEn})`,
    `How this works: in your first reply, only show me the task in Swedish, remind me of the times, and wait for my answer. ${SPOKEN}`,
    'When you have my answer, give me:\n' +
      '1. An estimated YKI grade (below 3, 3, 4 or 5) and one sentence on why.\n' +
      `2. Task completion: did I answer every question in the task? Was it enough for ${t.speak} seconds of speech?\n` +
      '3. Fluency and structure: did I connect my ideas (först, sedan, eftersom, men, därför…)?\n' +
      '4. My most important grammar and vocabulary mistakes as "wrong → right" (at most 8).\n' +
      '5. An improved version of my answer at about B1 level that I can practise saying out loud.\n' +
      '6. Two tips. Then ask if I want to try again.',
    HONEST,
  ].join('\n\n');
}

export function situationPrompt(t) {
  return [
    EXAMINER,
    "Let's practise the situations part of the speaking test as a role-play. You play the other person and speak Swedish; I answer in Swedish.",
    `THE SITUATION:\n${t.context}\n(In English: ${t.contextEn})`,
    `Your lines, in this order (you may adjust a line slightly so it fits what I said before). After each line, my reply should do what it says in brackets:\n${t.turns
      .map((u, i) => `${i + 1}. "${u.them}" (my reply should: ${u.goal})`)
      .join('\n')}`,
    `Rules: send only line 1 now, then wait for my reply. After each of my replies, send only your next line: no feedback yet. In the test I have about ${t.reply} seconds for each reply. ${SPOKEN}`,
    'After my last reply, give me:\n' +
      '1. For each of my replies: did it do what it should? The most important corrections as "wrong → right", and a natural B1 reply I could have given.\n' +
      '2. An estimated YKI grade (below 3, 3, 4 or 5) for the whole conversation, and two tips.',
    HONEST,
  ].join('\n\n');
}

export function answersPrompt(t, part, rows) {
  const listening = part === 'listening';
  const source = listening ? t.script.map((l) => `${l.spk}: ${l.text}`).join('\n') : t.text;
  return [
    EXAMINER,
    `Please check my written answers to these ${listening ? 'listening' : 'reading'} comprehension questions.`,
    `${listening ? 'TRANSCRIPT OF THE RECORDING' : 'THE TEXT'} ("${t.title}"):\n${quote(source)}`,
    `QUESTIONS, MY ANSWERS AND THE EXPECTED ANSWER:\n${rows
      .map((r, i) => `${i + 1}. ${r.q}\n   My answer: ${r.mine.trim() || '(no answer)'}\n   Expected: ${r.answer}`)
      .join('\n')}`,
    'For each answer, say whether it is correct, partly correct or wrong, and why. The content is what counts: an answer with small language mistakes is still correct if the meaning is clear and matches the text. ' +
      'Then show how to write each answer in short, correct Swedish, and give me one tip for answering this kind of question.',
    'Write your feedback in English.',
  ].join('\n\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or the page lost focus: fall back to a hidden textarea.
    try {
      const ta = h('textarea', { readonly: true, style: { position: 'fixed', top: '-1000px', opacity: '0' } });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const chatUrl = (prompt) => {
  const url = `${CHATGPT}?q=${encodeURIComponent(prompt)}`;
  return url.length <= MAX_URL ? url : CHATGPT;
};

// A card with "Open in ChatGPT" and "Copy prompt". getPrompt() builds the prompt when tapped, or
// returns '' after explaining (with a toast) why there's nothing to grade yet.
export function gptCard({ title, text, button = '✨ Open in ChatGPT', getPrompt }) {
  const open = h('a.btn.wide.y-gpt-open', { href: CHATGPT, target: '_blank', rel: 'noopener' }, button);
  open.addEventListener('click', (e) => {
    const prompt = getPrompt();
    if (!prompt) return e.preventDefault();
    const url = chatUrl(prompt);
    open.href = url;
    copyText(prompt).then((ok) =>
      toast(url === CHATGPT ? (ok ? 'Prompt copied: paste it into the new chat' : 'Use “Copy prompt” and paste it into ChatGPT') : ok ? 'Opening ChatGPT… (the prompt is copied too)' : 'Opening ChatGPT…'),
    );
  });
  const copy = h('button.btn.ghost.wide', {
    type: 'button',
    onclick: async () => {
      const prompt = getPrompt();
      if (prompt) toast((await copyText(prompt)) ? 'Copied: paste it into ChatGPT or any AI chat' : 'Could not copy on this phone');
    },
  }, '📋 Copy prompt');
  return h(
    'section.card.y-gpt',
    h('h3', title),
    h('p.muted.small', text),
    open,
    copy,
    h('p.muted.small', 'You need a ChatGPT account (the free one works). If the chat opens empty, paste: the prompt is already copied.'),
  );
}
