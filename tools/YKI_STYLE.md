# YKI practice content guide

Practice material for the Finnish **YKI test in Swedish, intermediate level** (*Allmänna språkexamina, svenska, mellannivå*).
Grade **3 = CEFR B1** is what Finnish citizenship needs. The files live in `data/yki/`. Check each one with
`node tools/validate-yki.mjs data/yki/<file>.json`: it must report 0 errors.

## Audience and language

* The learner is an adult immigrant in **Finland** who is learning Swedish in order to pass YKI and apply for Finnish citizenship.
* All Swedish is correct, natural **standard Swedish at B1** that a Finland-Swedish examiner would find natural. Use short and medium sentences, everyday connectors (*först, sedan, eftersom, därför, men, dessutom, till exempel, å ena sidan … å andra sidan, enligt mig*) and only an occasional subordinate clause. Avoid rare idioms and C1 vocabulary.
* **Finland context, never Sweden's.** Use euros (never kronor); Finnish towns with their Swedish names (Helsingfors, Esbo, Vanda, Åbo, Vasa, Borgå, Karleby, Jakobstad, Tammerfors, Uleåborg); and Finnish institutions under their Finland-Swedish names: *FPA* (Kela), *hälsostation*, *kommunen*, *välfärdsområdet*, *Migri*, *Myndigheten för digitalisering och befolkningsdata*, *skattebyrån / Skatteförvaltningen*, *arbetskraftsservicen*, *HRT* (public transport in the Helsinki region), *VR* (trains), *Alko*, *daghem/dagis*, *lågstadiet, högstadiet, gymnasiet, studentexamen*, *bastu*, *sommarstuga*, *midsommar*, *självständighetsdagen (6 december)*. Never use Sweden-only words or institutions: kronor, BankID, Skatteverket, Försäkringskassan, vårdcentral, SFI, Systembolaget.
* Names: a mix of Finland-Swedish, Finnish and international names (Anna, Mikael, Johanna, Erik, Aino, Jukka, Sara, Ahmed, Mei, Olga…).
* All instructions shown to the learner (how to answer, tips, structure) are in **English**. Prompts, model answers, phrases, texts and questions are in **Swedish**, and every Swedish item has an English translation.
* Never claim something about the official test that the sources don't support. Exam-format facts are already in the app; content files only hold tasks.

## data/yki/speaking.json

```json
{ "tasks": [ … ] }
```

The official sample has three task types, and every task has `id`, `type`, `title`, `titleEn`:

**`account`**: describe or tell about something from your own life (*redogörelse*). The official sample gives about **1 min to prepare and 1.5 min to speak**.
`prompt`, `promptEn`: the exam-style instruction in Swedish, e.g. "Berätta om din skoltid. Var gick du i skolan? Vilka ämnen tyckte du om? Vad var svårt?". Two to four guiding questions.
`prep`: 60, `speak`: 90. `structure`: 3–5 steps in English, each with a Swedish starter, e.g. "Start: say what you'll talk about — *Jag ska berätta om …*". `model`: a B1 model answer of about 130–170 words, which fits about 90 seconds of calm speech. `modelEn`. `phrases`: 6–10 `{sv, en}` useful phrases. `tips`: 2–4 short tips in English.

**`situation`**: a conversation where someone on the recording speaks and you answer (*situationsuppgifter*).
`context`, `contextEn`: the situation, e.g. "Du ringer till hälsostationen för att boka en tid." `turns`: 3–5 items `{ "them": "what the other person says (Swedish)", "themEn": "…", "you": "a good B1 model reply, 1–3 sentences", "youEn": "…", "goal": "what your reply must do, in English, e.g. 'Say why you need an appointment and when you can come.'" }`. `reply`: seconds per answer, 20. `phrases`, `tips` as above.

**`presentation`**: a short talk where you explain your view or compare options (*kort anförande*). The official sample gives about **2 min to prepare and 2 min to speak**.
`prompt`, `promptEn` (a topic plus 2–3 guiding questions), `prep`: 120, `speak`: 120, `structure`, `model` (about 170–220 words, giving an opinion with reasons and an example, and if suitable both sides), `modelEn`, `phrases`, `tips`.

## data/yki/writing.json

```json
{ "tasks": [ { "id", "type": "informal" | "formal" | "opinion", "title", "titleEn", "prompt", "promptEn", "points": ["…"], "words": [min, max], "minutes": 15, "model", "modelEn", "phrases": [{sv, en}], "checklist": ["… (English)"] } ] }
```

* `informal`: a message, email or forum post to a friend, neighbour or hobby group. `words` about [50, 90]. `points` lists the 3 things the text must contain, e.g. "Tacka för inbjudan", "Säg att du inte kan komma och varför", "Föreslå en annan dag".
* `formal`: a message to a landlord, *disponent*, employer, teacher, shop, service or authority, such as an inquiry, complaint or request. `words` about [60, 100]. It needs a polite opening and closing (*Hej / Bästa …*, *Med vänliga hälsningar*).
* `opinion`: an opinion text, such as a reply to a newspaper debate or an online forum. `words` about [100, 150], `minutes` 20. It needs a clear opinion, reasons, an example and a conclusion. The prompt may quote a short statement to react to.
* `model` meets every point, stays within the word range, and is B1 (not native-perfect C2). `checklist`: 4–6 checks the learner can tick, in English.

## data/yki/reading.json and data/yki/listening.json

```json
{ "items": [ { "id", "title", "titleEn", "kind", … , "questions": [ … ], "glossary": [{sv, en}] } ] }
```

* Reading: `kind` is notice, email, ad, article or forum. `text`: 90–250 words of Swedish (paragraphs separated by `\n\n`). `textEn`: an English translation, shown only after answering.
* Listening: `kind` is dialogue, voicemail, announcement or radio. `script`: lines `{ "spk": "A" | "B", "text": "…" }`, 60–200 words in all, natural spoken Swedish (an announcement has a single speaker A). `scriptEn`: an English translation of the whole script. `plays`: 2 (the learner may listen twice).
* `questions`: 3–5 per item, each either
  * `{ "type": "mc", "q": "…", "options": ["…", "…", "…"], "answer": 0, "explain": "English: why, quoting the text" }` with 3–4 options and only one defensible answer, or
  * `{ "type": "tf", "q": "statement in Swedish", "answer": true | false, "explain": "…" }`.
* The answer must be clearly in the text or script; distractors must be plausible but clearly wrong. Questions are in Swedish, like the exam.
* **Written-answer questions** (`open`): `{ "type": "open", "q": "…", "answer": "…", "explain": "…" }`. Every item has 1–2 of them, placed after its mc/tf questions (so an item has at most 7 questions). The learner types a short answer in Swedish, sees `answer`, and marks themselves right or wrong (or asks ChatGPT), so:
  * ask about one concrete fact that is clearly stated in the text or script and that the mc/tf questions do not already give away: a time, date, place, price, reason, what someone must do or bring. Use question words: *Vad, När, Var, Varför, Hur, Vem, Hur mycket, Vilken*. No opinion questions, no yes/no questions.
  * `answer`: the expected answer in short, natural Swedish, 1–10 words (a phrase is fine: *"Före den 15 maj."*, *"Eftersom hissen ska repareras."*). If two different answers are both right, give both: *"Med buss 55 eller med taxi."*
  * `explain`: in English, quote where the answer is and say what a correct answer must contain, e.g. *"The text says 'senast fredag den 12 april'. The answer needs the day and the date."*
* `glossary`: 4–8 harder words from the text with English meanings.
