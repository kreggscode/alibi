# Alibi

A voice murder mystery. Question AI suspects **out loud**, catch them in a
contradiction, accuse the one whose story does not hold.

Built for [pollinations/pollinations](https://github.com/pollinations/pollinations) quest **#15724**.

**Play it:** https://kreggscode.github.io/alibi/

## How it plays

1. **Open a new case.** A fresh victim, scene and cast of 3–5 suspects is
   invented by the model every time you play — same game, never the same
   murders.
2. **Question a suspect.** Tap *Ask out loud* and speak. Your question is
   transcribed, the suspect hears it, and answers back in their own voice.
   No microphone? Type it instead — the text path is always there.
3. **Work the notebook.** Every answer you collect becomes a claim. Flag the
   ones that do not add up.
4. **Accuse.** One accusation. The verdict tells you whether you were right,
   and the timeline shows exactly where the culprit's alibi came apart.

### The lie

Each suspect is generated with an alibi. Whoever killed the victim has an
alibi they invented — and must keep telling the same way, every time, without
ever contradicting themselves. The other suspects are honest witnesses with a
secret of their own. That is the whole game: ask enough of everyone, find the
one whose story never bends because it was never true.

## Bring your own Pollen

Alibi signs in with your own [Pollinations](https://pollinations.ai) account
(PKCE, publishable App Key, token kept in `sessionStorage` for the tab only).
The suspects speak and listen on **your** Pollen — the key is publishable and
appears in the JavaScript bundle, so anyone can read it; what it cannot do is
reach your account.

Sign-in is required: without it the game refuses to open a case rather than
silently playing on someone else's quota.

## What it calls

| Step | Endpoint | Model |
| --- | --- | --- |
| Invent the case | `POST /v1/chat/completions` | `openai/gpt-5.4-nano` |
| Suspect answers | `POST /v1/chat/completions` | `openai/gpt-5.4-nano` |
| Heard your question | `POST /v1/audio/transcriptions` | `openai/whisper-large-v3` |
| Their reply, spoken | `POST /v1/audio/speech` | `elevenlabs/eleven-v3` |

Voices are assigned by position in the lineup (`onyx`, `nova`, `shimmer`,
`ash`, `fable`), so a suspect keeps the same voice for the whole case.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/alibi/
npm run lint       # tsc --noEmit
npm test           # 29 unit + integration tests
npx playwright test   # 3 end-to-end tests against the built app
```

`POLLINATIONS_API_KEY` enables the live transcription test; without it that
suite skips. `E2E_BASE_URL=https://kreggscode.github.io/alibi/` runs the same
specs against production, which also enables the consent-screen test.

Audio for end-to-end testing: Playwright's fake microphone produces a tone,
not speech, so the E2E suite drives the typed fallback instead. The real
transcription path is proven by `src/transcribe.test.ts`, which round-trips a
recorded question through the live endpoint.

Screenshots of a full playthrough are in [`evidence/`](evidence).
