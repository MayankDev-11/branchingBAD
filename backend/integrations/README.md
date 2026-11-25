# RootTrace AI and integrations

From the repository root, install the backend requirements and the additional AI dependencies in your virtual environment.

```bash
.venv/bin/python -m pip install -r requirements.txt -r backend/ai/requirements.txt
.venv/bin/python -m spacy download en_core_web_sm
```

Set the following in the repository root's git-ignored `.env`.

| Variable | Purpose |
| --- | --- |
| `BEDROCK_MODEL_ID` | India inference profile `in.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `BEDROCK_GUARDRAIL_ID` and `BEDROCK_GUARDRAIL_VERSION` | Required for Ask. Use a Bedrock guardrail configured with sensitive-information masking |
| `ELEVENLABS_API_KEY` | Read server-side for weekly narration |
| `ELEVENLABS_VOICE_ID` | Voice to use for weekly narration |

Configure the AWS credential chain with a profile or environment variables whose identity can invoke the selected Bedrock inference profile in `ap-south-1`. Presidio requires the local spaCy model before an Ask request can reach Bedrock.

Stop the existing backend if it is running, then start the combined app on port 8000.

```bash
.venv/bin/python -m uvicorn backend.integrations.app:app --reload --port 8000
```

The Vite dev server still runs on port 5173. Open the Judge Demo and use the Ask box in an investigation. The weekly report and Obsidian ZIP are available at the following same-origin URLs after sign-in.

- `/api/report/weekly` supplies five Python-generated report lines and an audio URL. Cached audio stays under the git-ignored `data/uploads/weekly-audio/`.
- `/api/export/obsidian` downloads a ZIP. Extract it and open the extracted directory as an Obsidian vault. Start at `RootTrace.md`.
- The existing frontend exposes its own audio brief and single-file Markdown export. The new weekly report and ZIP endpoints can be opened directly after sign-in.

Run the mocked tests with `.venv/bin/python -m pytest backend/integrations/tests -q`. The tests use synthetic demo data and make no external AI or voice requests.
