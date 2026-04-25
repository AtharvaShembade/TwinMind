# TwinMind - Live Conversation Copilot

An app that listens to a live conversation and surfaces AI-powered suggestions in real time: answers, fact-checks, questions to ask and talking points.

---

## Setup

**Live app:** `https://twinmind-atharva.vercel.app/`

1. Open the link above
2. Click **Settings** and paste your Groq API key
3. Click the mic to start recording

---

## Stack

**Backend:** FastAPI + Groq 
- FastAPI for lightweight async HTTP and SSE streaming
- Groq for both transcription (Whisper Large V3) and generation (openai/gpt-oss-120b)

**Frontend:** Vanilla JS + HTML + CSS, no framework, no build step
- Single page, all session state in JS variables

**Models:**
- `whisper-large-v3` - transcription
- `openai/gpt-oss-120b` - suggestions, chat, and detail expansion

---

## How It Works

Audio is recorded in 30-second chunks via `MediaRecorder`. Each chunk is sent to `/transcribe` (Whisper), and the resulting text is appended to the transcript. Suggestions auto-refresh every 30 seconds and also fire immediately when a new chunk arrives. The timer resets on both manual and automatic refresh so the display stays in sync.

For context, the last **5 chunks (~2.5 minutes)** are sent for suggestions and the last **20 chunks (~10 minutes)** for detail expansion. Both are user-configurable in Settings.

Clicking a suggestion card opens a detailed expansion via `/detail` (SSE stream). The chat panel uses `/chat` (SSE stream) for free-form questions with the same transcript context.

---

## Prompt Strategy

### Suggestions

All 4 types are evaluated on every refresh. The 3 most relevant to the current moment are returned, ordered by urgency. Duplicates are explicitly prohibited.

- **ANSWER** - surfaces when a direct factual question needs an immediate answer
- **FACT-CHECK** - surfaces when a specific claim or statistic is made and needs verification or context
- **QUESTION TO ASK** - surfaces when a key angle in the conversation is missing or unexplored
- **TALKING POINT** - surfaces when a position or decision is stated that the listener should respond to

This means suggestions adapt naturally to the conversation type; a technical Q&A surfaces more ANSWERS, a negotiation surfaces more TALKING POINTS.

The prompt focuses the model on the last 2-3 exchanges only. The 5-chunk context window already handles recency, but the prompt reinforces it to prevent the model from fixating on earlier parts of the conversation.

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

- Backend: Google Cloud Run 
- Frontend: Vercel
