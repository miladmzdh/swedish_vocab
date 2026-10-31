#!/usr/bin/env node
// Validates YKI practice files against tools/YKI_STYLE.md.
//   node tools/validate-yki.mjs data/yki/speaking.json [more ...]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const SWEDEN_ONLY = /\b(kronor|krona|BankID|Skatteverket|Försäkringskassan|vårdcentral(en)?|SFI|Systembolaget)\b/i;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
let total = 0;

for (const file of process.argv.slice(2)) {
  const errs = [];
  const warn = [];
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`✗ ${file}: invalid JSON (${e.message})`);
    total++;
    continue;
  }
  const kind = basename(file, '.json');
  const list = data.tasks || data.items;
  if (!Array.isArray(list) || !list.length) errs.push('top level needs a non-empty "tasks" (speaking, writing) or "items" (reading, listening) array');
  const ids = new Set();
  const str = (o, k, where) => (typeof o[k] === 'string' && o[k].trim() ? true : (errs.push(`${where}: missing "${k}"`), false));
  const phrases = (o, where, min = 4) => {
    if (!Array.isArray(o.phrases) || o.phrases.length < min || o.phrases.some((p) => !p.sv || !p.en)) errs.push(`${where}: "phrases" needs ≥${min} {sv, en}`);
  };
  const scan = (o, where) => {
    const text = JSON.stringify(o);
    const m = text.match(SWEDEN_ONLY);
    if (m) errs.push(`${where}: Sweden-only term "${m[0]}" (use Finland's)`);
  };
  const questions = (qs, where) => {
    if (!Array.isArray(qs) || qs.length < 3 || qs.length > 7) errs.push(`${where}: needs 3–7 questions`);
    if ((qs || []).filter((q) => q.type === 'open').length > 2) errs.push(`${where}: at most 2 "open" questions`);
    (qs || []).forEach((q, i) => {
      const w = `${where} q${i + 1}`;
      str(q, 'q', w);
      str(q, 'explain', w);
      if (q.type === 'mc') {
        if (!Array.isArray(q.options) || q.options.length < 3 || q.options.length > 4) errs.push(`${w}: mc needs 3–4 options`);
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options || []).length) errs.push(`${w}: mc answer must be an option index`);
        if (new Set((q.options || []).map((x) => x.trim().toLowerCase())).size !== (q.options || []).length) errs.push(`${w}: duplicate options`);
      } else if (q.type === 'tf') {
        if (typeof q.answer !== 'boolean') errs.push(`${w}: tf answer must be true/false`);
      } else if (q.type === 'open') {
        if (str(q, 'answer', w) && words(q.answer) > 15) warn.push(`${w}: open answer is ${words(q.answer)} words (keep it short)`);
      } else errs.push(`${w}: type must be "mc", "tf" or "open"`);
    });
  };

  (list || []).forEach((t, i) => {
    const where = `#${i + 1} ${t.id || '?'}`;
    if (!t.id || ids.has(t.id)) errs.push(`${where}: missing or duplicate id`);
    ids.add(t.id);
    str(t, 'title', where);
    str(t, 'titleEn', where);
    scan(t, where);
    if (kind === 'speaking') {
      if (!['account', 'situation', 'presentation'].includes(t.type)) errs.push(`${where}: type must be account | situation | presentation`);
      phrases(t, where);
      if (!Array.isArray(t.tips) || !t.tips.length) errs.push(`${where}: needs "tips"`);
      if (t.type === 'situation') {
        str(t, 'context', where);
        str(t, 'contextEn', where);
        if (!Array.isArray(t.turns) || t.turns.length < 3 || t.turns.length > 5) errs.push(`${where}: needs 3–5 turns`);
        (t.turns || []).forEach((u, k) => ['them', 'themEn', 'you', 'youEn', 'goal'].forEach((f) => str(u, f, `${where} turn ${k + 1}`)));
        if (!t.reply) errs.push(`${where}: needs "reply" seconds`);
      } else if (t.type) {
        ['prompt', 'promptEn', 'model', 'modelEn'].forEach((f) => str(t, f, where));
        if (!t.prep || !t.speak) errs.push(`${where}: needs "prep" and "speak" seconds`);
        if (!Array.isArray(t.structure) || t.structure.length < 3) errs.push(`${where}: "structure" needs ≥3 steps`);
        const n = words(t.model);
        const [lo, hi] = t.type === 'account' ? [110, 200] : [150, 250];
        if (n < lo || n > hi) warn.push(`${where}: model is ${n} words (aim ${lo}–${hi})`);
      }
    } else if (kind === 'writing') {
      if (!['informal', 'formal', 'opinion'].includes(t.type)) errs.push(`${where}: type must be informal | formal | opinion`);
      ['prompt', 'promptEn', 'model', 'modelEn'].forEach((f) => str(t, f, where));
      if (!Array.isArray(t.points) || t.points.length < 2) errs.push(`${where}: needs ≥2 "points"`);
      if (!Array.isArray(t.words) || t.words.length !== 2) errs.push(`${where}: "words" must be [min, max]`);
      else {
        const n = words(t.model);
        if (n < t.words[0] * 0.9 || n > t.words[1] * 1.1) warn.push(`${where}: model is ${n} words (task asks ${t.words[0]}–${t.words[1]})`);
      }
      if (!Array.isArray(t.checklist) || t.checklist.length < 3) errs.push(`${where}: needs ≥3 "checklist" items`);
      phrases(t, where);
    } else if (kind === 'reading') {
      str(t, 'text', where);
      str(t, 'textEn', where);
      const n = words(t.text);
      if (n < 80 || n > 270) warn.push(`${where}: text is ${n} words (aim 90–250)`);
      questions(t.questions, where);
    } else if (kind === 'listening') {
      if (!Array.isArray(t.script) || !t.script.length || t.script.some((l) => !['A', 'B'].includes(l.spk) || !l.text)) errs.push(`${where}: "script" lines need spk A|B and text`);
      str(t, 'scriptEn', where);
      const n = words((t.script || []).map((l) => l.text).join(' '));
      if (n < 50 || n > 220) warn.push(`${where}: script is ${n} words (aim 60–200)`);
      questions(t.questions, where);
    } else errs.push(`unknown file "${kind}" (expected speaking, writing, reading or listening)`);
  });

  total += errs.length;
  console.log(`${errs.length ? '✗' : '✓'} ${file}: ${(list || []).length} items · ${errs.length} errors · ${warn.length} warnings`);
  errs.forEach((e) => console.log('  ERROR ' + e));
  warn.forEach((w) => console.log('  WARN  ' + w));
}
process.exit(total ? 1 : 0);
