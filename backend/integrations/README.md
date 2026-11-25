# RootTrace AI and integrations

## Gemini demo on the free tier

`gemini-3.5-flash-lite` has a free tier. Keep the Gemini project on the free tier and put its server-side key in the repository root's git-ignored `.env`.

```dotenv
ROOTTRACE_AI_PROVIDER=gemini
GEMINI_API_KEY=
```

The value after `GEMINI_API_KEY=` is your key. The Gemini path uses the standard Python requirements and needs no AWS settings or spaCy model. It sends a fixed demo topic and evidence rebuilt from the synthetic generator in memory. The typed question, account details, workspace branches and imported data stay local. The backend handles red flags first, enables Gemini content filters, and verifies selections before returning citations. Google may use free-tier requests to improve its products. [Model pricing](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite#pricing) · [Gemini terms](https://aistudio.google.com/docs/terms)

Try asking about water and headaches, sleep over the last week, the sleep shift on Nov 3, or the next step for the selected investigation. Python answers readings, detected changes, and experiment next steps directly. Gemini sees only hypotheses related to a recognized evidence question. Unsupported questions show that the demo has no matching evidence.

## Bedrock and weekly audio

To use Bedrock, set `ROOTTRACE_AI_PROVIDER=bedrock` and install its additional dependencies.

```bash
.venv/bin/python -m pip install -r requirements.txt -r backend/ai/requirements.txt
.venv/bin/python -m spacy download en_core_web_sm
```

These providers read their settings from the same local `.env`.

| Variable | Purpose |
| --- | --- |
| `BEDROCK_MODEL_ID` | India inference profile `in.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `BEDROCK_GUARDRAIL_ID` and `BEDROCK_GUARDRAIL_VERSION` | Required for Bedrock Ask. Use a guardrail configured with sensitive-information masking |
| `ELEVENLABS_API_KEY` | Read server-side for weekly narration |
| `ELEVENLABS_VOICE_ID` | Voice to use for weekly narration |

Configure the AWS credential chain with an identity that can invoke the selected Bedrock inference profile in `ap-south-1`. Presidio requires the local spaCy model before an Ask request can reach Bedrock. Weekly audio still uses ElevenLabs. The existing frontend audio brief can use the browser's built-in voice without an API key.

## Run the app

Stop the existing backend if it is running, then start the combined app on port 8000.

```bash
.venv/bin/python -m uvicorn backend.integrations.app:app --reload --port 8000
```

The Vite dev server still runs on port 5173. Open the Judge Demo and use the Ask box in an investigation. The weekly report and Obsidian ZIP are available at the following same-origin URLs after sign-in.

- `/api/report/weekly` supplies five Python-generated report lines and an audio URL. Cached audio stays under the git-ignored `data/uploads/weekly-audio/`.
- `/api/export/obsidian` downloads a ZIP. Extract it and open the extracted directory as an Obsidian vault. Start at `RootTrace.md`.
- The existing frontend exposes its own audio brief and single-file Markdown export. The new weekly report and ZIP endpoints can be opened directly after sign-in.

Run the mocked tests with `.venv/bin/python -m pytest backend/integrations/tests -q`. The tests use synthetic demo data and make no external AI or voice requests.

## New Branch

Use **New Branch** in the signed-in dashboard, choose an investigation or habit, and
submit a manual or voice draft. Saved branches are stored per account in the SQLite
workspace database (`data/roottrace_workspace.db`, overridable with
`ROOTTRACE_WORKSPACE_DB`). They stay visible after reload or a demo clock reset.
The shared Judge Demo login uses one shared demo account.

Select linked factors and the outcome the branch should explain. Leaving possible
factors blank derives them from the chosen metrics. Linked demo readings remain
available for context. Matched, supported demo outcomes use Python's pattern
comparison for scoring. Missing outcomes, such as afternoon energy, and factors
with insufficient paired evidence stay unscored. The voice transcript is not persisted.

Workspace branches can be resolved or dissolved from Investigations. Resolving
requires a note and moves that note into the main timeline as a user resolution.
Dissolving removes the branch from the active graph. History replays both the
creation and closure dates for user-owned branches.

ElevenLabs narration and microphone transcription use the server-side
`ELEVENLABS_API_KEY`. Set `ELEVENLABS_VOICE_ID` to choose the voice. The guided
audio brief keeps its browser speech fallback. Voice recordings are sent to
ElevenLabs only when using microphone transcription. The raw recording is not
retained by the app. [ElevenLabs transcription](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) · [Narration](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)

For tracked investigation outcomes, leaving possible factors blank lets Gemini
draft sub-branches from matching synthetic readings. Existing branches can use
**Generate Gemini drafts**. Each draft describes what would support or weaken
the hypothesis and links the evidence behind any computed score. Branch titles,
private resolution notes, raw records and imported data stay local. Related
resolutions are retrieved locally for the signed-in account. The exact outbound
request is available from the branch's **View Gemini draft request** disclosure.
