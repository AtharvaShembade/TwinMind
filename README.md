# TwinMind - Real-Time Meeting Assistant

A 3-column web app that listens to a live conversation and surfaces AI-powered suggestions in real time: answers, fact-checks, questions to ask, and talking points.

---

## Setup

**Live app:** `<FRONTEND_URL>`

1. Open the link above
2. Click **Settings** and paste your [Groq API key](https://console.groq.com)
3. Click the mic to start recording

The API key is stored in `localStorage` and sent per-request, never stored server-side.

---

## Stack

**Backend:** FastAPI + Groq Python SDK
- FastAPI for lightweight async HTTP and SSE streaming
- Groq for both transcription (Whisper Large V3) and generation (openai/gpt-oss-120b)
- Fully stateless, no database, no session storage

**Frontend:** Vanilla JS + HTML + CSS, no framework, no build step
- Single page, all session state in JS variables
- `marked.js` for markdown rendering in chat

**Models:**
- `whisper-large-v3` - transcription, `language="en"` set explicitly to prevent mid-session language drift
- `openai/gpt-oss-120b` - suggestions, chat, and detail expansion

---

## How It Works

Audio is recorded in 30-second chunks via `MediaRecorder`. Each chunk is sent to `/transcribe` (Whisper), and the resulting text is appended to the transcript. Suggestions auto-refresh every 30 seconds and also fire immediately when a new chunk arrives. The timer resets on both manual and automatic refresh so the display stays in sync.

For context, the last **5 chunks (~2.5 minutes)** are sent for suggestions and the last **20 chunks (~10 minutes)** for detail expansion. Both are user-configurable in Settings.

Clicking a suggestion card opens a detailed expansion via `/detail` (SSE stream). The chat panel uses `/chat` (SSE stream) for free-form questions with the same transcript context.

---

## Prompt Strategy

### Suggestions

The core design decision: suggestions are chosen by trigger condition, not randomly or by fixed slots.

Each of the 4 types has a concrete trigger:
- **ANSWER** - a question was asked or a concept needs clarification
- **FACT-CHECK** - a claim was made, or a topic came up with a relevant fact worth surfacing
- **QUESTION TO ASK** - a key angle is missing or unexplored
- **TALKING POINT** - a statement was made that the listener can build on, challenge, or add insight to

The model picks the 3 types whose triggers are most clearly met by the last 2-3 exchanges. This means suggestions adapt to the type of meeting: a technical Q&A surfaces more ANSWERs, a negotiation surfaces more TALKING POINTs. Duplicates are explicitly prohibited.

The prompt also instructs the model to focus only on the last 2-3 exchanges. The 5-chunk context window already handles recency, but the prompt reinforces it to prevent the model from fixating on earlier parts of the conversation.

### Detail

Leads with the most important point immediately. Length is calibrated to complexity, no padding. Tables only when content is genuinely comparative. The transcript is context for what is being discussed, not a constraint on what the model can answer.

### Chat

First sentence is the answer, not setup. No restating the question, no filler. Length matches question complexity.

---

## Tradeoffs

**Blocking suggestions over streamed.**
Suggestions are returned as a single JSON response rather than streamed card by card. This keeps the parsing pipeline simple and avoids partial-JSON edge cases. The cost is all cards appear at once, which is acceptable since suggestion refresh is mostly background.

**Trigger-based type selection over fixed slots.**
The 4 suggestion types are not always shown equally. 3 are chosen based on what is actually happening in the conversation. This makes suggestions more relevant but means some types appear less in certain meetings (e.g. fewer FACT-CHECKs in a planning discussion with no specific claims).

---

## Deployment

- Backend: Google Cloud Run (see `backend/Dockerfile`)
- Frontend: Vercel (point at `frontend/` directory)
- Update `API_BASE` in `frontend/api.js` to the Cloud Run URL before deploying frontend
