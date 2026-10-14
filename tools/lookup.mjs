#!/usr/bin/env node
// Look up reference pronunciations and frequency ranks for Swedish words.
//   node tools/lookup.mjs hund "tycka om" sjuksköterska
// Prints every reference IPA (WikiPron = Wiktionary, ipa-dict) with its tonal-accent mark
// (² = accent 2) and the word's rank in the OpenSubtitles frequency list (lower = more common).
import { refsFor } from './refs.mjs';

const words = process.argv.slice(2);
if (!words.length) {
  console.error('usage: node tools/lookup.mjs <word> [word...]');
  process.exit(1);
}
for (const w of words) {
  const { prons, ranks } = refsFor(w);
  const rank = ranks.map((r) => (r == null ? '—' : `#${r}`)).join(' ');
  console.log(`${w}   freq ${rank}`);
  if (!prons.length) console.log('   (no reference pronunciation)');
  for (const p of prons) console.log(`   ${p.src.padEnd(16)} ${p.tone === 2 ? '²' : ' '} ${p.ipa}`);
}
