# 2026-05-27

## App Store-ready ZIP export

Both **Export All Languages** and **Export Single Language** now produce ZIP files
that you can drag straight into App Store Connect.

- Folder names use Apple's locale codes (`de-DE`, `en-US`, `pt-BR`, `zh-Hans`, …) instead of the internal short codes
- Filenames are zero-padded (`01.png`, `02.png`, …, `10.png`) so the alphabetical sort in the ASC uploader matches your screenshot order — even past 9 screenshots
- Each locale folder now contains a `README.txt` listing the headline + subheadline per file as a quick sanity check

## Live model list from your API key

The AI model dropdowns in **Settings** now have a refresh button next to them.

- Click the refresh icon to load the actual list of available models from the provider (Anthropic / OpenAI / Google) using your saved API key
- Only chat/text models are listed (no Whisper, DALL-E, embeddings, …)
- The fetched list is cached locally so it's available the next time you open Settings
