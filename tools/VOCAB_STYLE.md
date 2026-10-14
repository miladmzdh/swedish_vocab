# Vocabulary style guide

Every unit lives in its own JSON file: an array of entries. `tools/build-vocab.mjs` merges them into
`data/vocab.json`. Run `node tools/validate.mjs <file>` after every edit. It must report 0 errors.
Then go through every `PRON` and `WARN` line and decide on each one.

The target is **standard Central Swedish** (rikssvenska, the Stockholm/Mälardalen standard) in present-day,
natural usage.

## Entry fields

| field | required | meaning |
|---|---|---|
| `sv` | yes | Swedish headword. Nouns: indefinite singular **without** article (`hund`). Verbs: infinitive **without** `att` (`äta`, `tycka om`, `känna sig`). Adjectives: common-gender base form (`stor`). Phrases: written as normally punctuated (`Hur mår du?`). Lowercase unless it is always capitalised. |
| `en` | yes | Main English meaning, short (1–4 words). Verbs start with `to ` (`to eat`). When the Swedish word has a near-synonym in the course, **disambiguate** in parentheses so the quiz is fair. For example, `veta` → `to know (a fact)`, `känna` → `to know (a person); to feel`, `kunna` → `can; to be able to`. Use American spelling. No trailing period. |
| `alt` | no | Other English answers a learner might type and that should count as correct (`["hound"]`). Leave out the parenthesised parts. |
| `pos` | yes | `noun` `verb` `adj` `adv` `pron` `prep` `conj` `num` `interj` `det` `phrase` |
| `g` | nouns | `"en"` or `"ett"`, or `"pl"` for plural-only nouns (`pengar`, `kläder`). |
| `f` | noun/verb/adj | Inflected forms; see below. Use `null` for a form that doesn't exist. |
| `ipa` | yes | Broad IPA; see the pronunciation rules below. No slashes or brackets. |
| `tone` | single words | Tonal word accent: `1` (accent 1, acute) or `2` (accent 2, grave). Monosyllables are always `1`. Leave it out for phrases and multi-word entries. |
| `ex` | yes | One short, natural example sentence at the entry's level. Mark the headword **as it appears in the sentence** (any inflected form) with exactly one pair of curly braces: `{Hunden} springer i parken.` The marked text must be a form of the headword. Particle verbs mark the whole verb: `Jag {tycker om} kaffe.` |
| `exEn` | yes | Natural English translation of the example. No braces. |
| `lvl` | yes | CEFR estimate for this word: `A1` `A2` `B1` `B2`. |
| `note` | no | One short, useful tip: an irregularity, a false friend, a pronunciation trap (`k before e/i/y/ä/ö is soft: tj-sound`), or a usage nuance. Only add it where it really helps. |

### Forms (`f`)

* **noun**: `[definite singular, indefinite plural, definite plural]`
  * `hund` → `["hunden", "hundar", "hundarna"]`
  * `äpple` → `["äpplet", "äpplen", "äpplena"]`
  * `mjölk` (uncountable) → `["mjölken", null, null]`
  * `pengar` (g `pl`) → `[null, "pengar", "pengarna"]`
* **verb**: `[present, past (preterite), supine, imperative]`
  * `äta` → `["äter", "åt", "ätit", "ät"]`
  * `tycka om` → `["tycker om", "tyckte om", "tyckt om", "tyck om"]`
  * modals without a real imperative → `null` (`kunna` → `["kan", "kunde", "kunnat", null]`)
* **adj**: `[neuter (ett-form), plural/definite form, comparative, superlative]`
  * `stor` → `["stort", "stora", "större", "störst"]`
  * `intressant` → `["intressant", "intressanta", "mer intressant", "mest intressant"]`
  * `bra` → `["bra", "bra", "bättre", "bäst"]`
  * `liten` → `["litet", "små", "mindre", "minst"]` (mention `lilla` in `note`)
  * adjectives that can't be compared → `null` for comparative and superlative

## Pronunciation rules (`ipa` + `tone`)

Use broad phonemic IPA in the style of Swedish Wiktionary/English Wiktionary for Central Standard Swedish.

* **Stress.** Put `ˈ` before the stressed syllable of every polysyllabic word (`ˈflɪkːa`). Mark the main secondary stress of compounds with `ˌ` (`ˈɧʉːkˌɧøːtɛʂka`). Monosyllables get no stress mark (`hɵnd`). For phrases, mark stress on each stressed word, separated by spaces (`hʉːr ˈmoːr dʉː`).
* **Quantity.** A stressed syllable has either a long vowel (`ː`) or a long (written double) consonant after a short vowel: `katt` → `katː`, `flicka` → `ˈflɪkːa`, `glass` → `ɡlasː`. Unstressed syllables never have length marks.
* **Retroflexes.** r + t/d/n/s/l becomes `ʈ ɖ ɳ ʂ ɭ`, also across syllables in a word: `bord` → `buːɖ`, `barn` → `bɑːɳ`, `kärlek` → `ˈɕɛːɭeːk`, `först` → `fœʂʈ`. Never write `rt rd rn rs rl` inside a word.
* **Vowels.** `a` short `a` / long `ɑː`; `e` short `ɛ` / long `eː`; `i` `ɪ`/`iː`; `o` long `uː` (usually) or `oː`, short `ʊ` or `ɔ`; `u` long `ʉː`, short `ɵ`; `y` `ʏ`/`yː`; `å` `ɔ`/`oː`; `ä` `ɛ`/`ɛː`, and before r `æ`/`æː`; `ö` `œ`/`øː`, and before r `œ`/`œː`. Unstressed final -e is `ɛ` (`ˈɛpːlɛ`), unstressed -a is `a`, unstressed -or is `ʊr`.
* **Consonants.** sj-sound `ɧ` (sj, skj, stj, sk + soft vowel, -tion `ɧuːn`); tj-sound `ɕ` (tj, kj, k + soft vowel); ng `ŋ`; g + soft vowel and initial gj/dj/hj/lj → `j`; final -rg/-lg → `rj`/`lj`. Write `ɡ` (IPA U+0261) or ASCII `g`; the build step turns both into `ɡ`.
* **Tone.** Swedish polysyllables have accent 1 (acute) or accent 2 (grave).
  * Accent 1: every monosyllable. Definite and other suffixed forms of monosyllabic nouns (`hunden`, `huset`). Words that were historically monosyllabic, with a later -el/-en/-er (`fågel`, `åker`, `vatten`, `finger`). Words not stressed on the first syllable (`betala`, `förstå`, `hotell`, `restaurang`, `banan`). Umlaut plurals and comparatives (`händer`, `böcker`, `större`).
  * Accent 2: most native words stressed on the first syllable that have two or more syllables (`flicka`, `gata`, `pojke`, `gammal`, verb infinitives like `äta`, `tala`), and almost all compounds (`sjuksköterska`, `ishockey`).
  * There are exceptions and minimal pairs (`anden` "the duck", accent 1, vs `anden` "the spirit", accent 2), so decide word by word.
* `tools/lookup.mjs <word>` shows the Wiktionary (WikiPron) and ipa-dict pronunciations. Treat them as strong evidence but not as ground truth: both have occasional errors, and WikiPron often leaves out the `²` mark. When you disagree with a reference, you must be able to say why.

## Quality bar

* Every Swedish string must be correctly spelled, with correct å/ä/ö.
* Genders, plurals and verb forms must be correct. Irregular verbs must be checked one by one.
* The examples must sound like something a native speaker would actually say, and the English must match their meaning.
* Prefer high-frequency, genuinely useful words. Leave out obsolete words, rare synonyms, slang and offensive words.
* No duplicates within a unit. Avoid words whose natural home is another unit's scope.
