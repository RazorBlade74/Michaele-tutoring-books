# Gemini cert-intake setup

One-time setup for the Slice 8 cert-intake path. Replaces the Drive PDF-to-Doc OCR conversion, which regressed in May 2026 and could no longer read the right-hand money column of MVA certificates. The new path posts each cert PDF directly to Gemini 2.5 Flash and asks for the fields as JSON.

## What the tutor needs to do

1. **Get an AI Studio API key.**
   - Sign in at <https://aistudio.google.com> with `lamp.post.tutoring@gmail.com`.
   - Click **Get API key** → **Create API key**. Choose **Create API key in new project** (a default AI Studio project is fine — no billing card required).
   - Copy the key. It starts with `AIza…`. Treat it like a password.

2. **Paste the key into Script Properties.**
   - Open the Apps Script editor for the Sheet (Extensions → Apps Script).
   - In the left rail: **Project Settings** (the gear) → scroll to **Script Properties** → **Add script property**.
   - Property: `GEMINI_API_KEY`. Value: the `AIza…` key. Save.

3. **Delete the leftover `Debug.js` file** in the Apps Script project (added on 2026-05-16 to diagnose the Drive OCR regression). Not needed once Gemini is in.

4. **Smoke-test.** In the Sheet, **Lamp Post Tutoring → Run now**. Open the **lamp.post.tutoring** inbox and check the digest:
   - Certs that were previously `amount-unreadable` should now show up under **Certificates entered**.
   - If the API key isn't set, every cert will be flagged `extraction-failed` and the digest will say so — go back to step 2.

## Privacy note — free tier

The AI Studio free tier sends prompts and outputs into Google's model-improvement corpus, and human reviewers may read them. Each cert PDF contains the student's name, parent's name, school, and dollar amount.

We accepted this tradeoff in exchange for not linking a billing card. If that changes — or if the tutor wants stricter privacy later — switch the same project to the paid tier (link a billing card in the AI Studio console; the per-cert cost at our volume is effectively $0). No code change is required; only the billing posture changes.

## How the code is wired

- `src/CertExtractor.js` — single I/O entry point. Reads `GEMINI_API_KEY` from `PropertiesService`, posts the PDF inline-base64 to `gemini-2.5-flash:generateContent` with a `responseSchema`, parses the JSON, and returns the same Certificate shape Intake expects. Throws on HTTP / JSON / shape failures.
- `src/Intake.js` — wraps `CertExtractor.extract` in try/catch. Failures are surfaced to the digest as `extraction-failed` flagged items instead of crashing the run.
- Model is pinned to `gemini-2.5-flash` (not `…-latest`) so a Google-side bump can't silently change extraction behavior. Bump deliberately when revisiting.

## If extraction quality regresses later

Run-now repeatedly flags real certs as `amount-unreadable` or `extraction-failed`:

1. Confirm the API key is still valid (the Gemini console will say if quota / billing is the issue).
2. Try `gemini-2.5-flash-lite` or the current Gemini 3 Flash by changing `GEMINI_MODEL` in `CertExtractor.js` — community reports say 2.5 Flash is the most reliable for structured PDF extraction, but the contract is identical.
3. Last resort: switch the same code path to Vertex AI Cloud Vision (`DOCUMENT_TEXT_DETECTION`). Same shape, requires a billing card.
