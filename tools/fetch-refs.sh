#!/usr/bin/env bash
# Downloads the open reference data used by tools/lookup.mjs and tools/validate.mjs.
# The files are not committed (see .gitignore); run this once before validating.
#   - WikiPron (Wiktionary pronunciations, CC BY-SA): https://github.com/CUNY-CL/wikipron
#   - ipa-dict (Swedish IPA dictionary, MIT):         https://github.com/open-dict-data/ipa-dict
#   - FrequencyWords (OpenSubtitles frequencies, MIT): https://github.com/hermitdave/FrequencyWords
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p ref
curl -fsSL -o ref/swe_broad.tsv  https://raw.githubusercontent.com/CUNY-CL/wikipron/master/data/scrape/tsv/swe_latn_broad.tsv
curl -fsSL -o ref/swe_narrow.tsv https://raw.githubusercontent.com/CUNY-CL/wikipron/master/data/scrape/tsv/swe_latn_narrow.tsv
curl -fsSL -o ref/ipadict_sv.txt https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/sv.txt
curl -fsSL -o ref/sv_50k.txt     https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sv/sv_50k.txt
echo "Reference data saved in tools/ref/"
