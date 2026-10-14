# 🇸🇪 Svenska Quest

A free, gamified Swedish vocabulary app built for phones. It is a plain static website, so it runs on
**GitHub Pages** without any server, works offline, and installs on your home screen like a real app.

## What's inside

- **~1,800 words in 35 themed units** (A1 → B1): greetings, food, home, verbs, travel, work, health, Swedish culture and more.
  Every entry has gender (en/ett), all inflected forms, an example sentence with translation, IPA pronunciation and tonal accent.
- **A learning path** of units with lessons, ★★★ stars and a **boss battle** at the end of each unit (Tomten, Älgen, Surströmmingen…).
- **11 exercise types** plus new-word cards: multiple choice both ways, listening, typing (with å ä ö keys), en/ett, word forms, fill-the-gap,
  letter scramble, matching pairs, dictation and **speaking** (speech recognition checks your pronunciation).
- **Arcade games**: Blitz (60 s), Survival (3 lives), Gender Rush (en or ett?), Match Madness, Listening Lab.
- **Gamification**: XP and levels, daily goal ring, streaks with streak freezes, daily quests, 34 achievements,
  kronor (coins) to spend on avatars and color themes, combos, confetti.
- **Spaced repetition** (Leitner boxes) decides when each word comes back for review.
- **Pronunciation**: your phone's Swedish voice (with a slow 🐢 mode), plus **native-speaker recordings** streamed from
  Wikimedia Commons (Wiktionary / Lingua Libre) whenever one exists for a word. A built-in sound guide explains å/ä/ö,
  the sj- and tj-sounds, retroflexes and pitch accent.

## Put it online (GitHub Pages, one time)

1. Merge this branch into `main` (or pick this branch in the next step).
2. On GitHub open **Settings → Pages**.
3. Under **Build and deployment** choose **Source: Deploy from a branch**, branch **`main`**, folder **`/ (root)`**, then **Save**.
4. After a minute the app is live at **`https://<your-username>.github.io/swedish_vocab/`**.

## Use it on your phone

- **iPhone (Safari):** open the link → Share button → **Add to Home Screen**.
- **Android (Chrome):** open the link → ⋮ menu → **Install app**.

Installing matters: it runs full screen, works offline, and the browser keeps its saved data safely
(iOS can clear website data that hasn't been used for a while, but not data of home-screen apps).

**No Swedish voice?** iPhone: Settings → Accessibility → Spoken Content → Voices → Swedish (download “Alva”).
Android: Settings → System → Languages → Text-to-speech → Google → install Swedish.

## Your progress is never lost

- Progress saves automatically on the device after every answer (plus a daily safety copy).
- **Settings → Your progress**: download a backup file or copy a backup code; restore by uploading or pasting it
  (merging with what's on the device).
- **Optional cloud sync**: paste a GitHub token with only the `gist` scope in **Settings → Sync with GitHub**. Progress is
  then kept in a private Gist on your own account and merged across devices automatically.

## Development

No build step: edit the files and reload. Run locally with any static server, e.g. `npx http-server .`

```
js/          app code (ES modules)          data/units.json   unit list, bosses, scope
css/         styles                          data/vocab.json   merged vocabulary (generated)
vocab/       one JSON file per unit (source) tools/            validation & build scripts
sw.js        offline service worker          tests/            unit + phone-size browser tests
```

- `tools/fetch-refs.sh` downloads reference pronunciation data (Wiktionary via WikiPron, ipa-dict) and word frequencies.
- `node tools/validate.mjs vocab/food.json` checks a unit against the schema in `tools/VOCAB_STYLE.md` and compares every IPA
  transcription with the references.
- `node tools/build-vocab.mjs --report` merges the units into `data/vocab.json` and lists overlaps.
- `node --test tests/*.test.mjs` runs unit tests; `node tests/smoke.mjs http://localhost:8080/` plays a lesson in a phone-sized browser.
- After changing app files, bump `VERSION` in `sw.js` so installed apps pick up the update.

## Credits

Pronunciations were cross-checked against [WikiPron](https://github.com/CUNY-CL/wikipron) (Wiktionary, CC BY-SA) and
[ipa-dict](https://github.com/open-dict-data/ipa-dict); frequencies from [FrequencyWords](https://github.com/hermitdave/FrequencyWords).
Native recordings stream from [Wikimedia Commons](https://commons.wikimedia.org) and are credited in the app.
