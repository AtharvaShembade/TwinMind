import json
from fastapi import APIRouter, Header, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from lib.groq_client import create_client, TRANSCRIPTION_MODEL, GENERATION_MODEL
from lib.models import SuggestionsRequest, SuggestionsResponse, Suggestion, ChatRequest, DetailRequest
from lib.prompts import SUGGESTION_PROMPT, DETAIL_PROMPT, CHAT_PROMPT

router = APIRouter()


def get_client(x_groq_key: str = Header(...)):
    if not x_groq_key:
        raise HTTPException(status_code=401, detail="Missing Groq API key")
    return create_client(x_groq_key)


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    x_groq_key: str = Header(...)
):
    client = get_client(x_groq_key)
    content = await audio.read()

    try:
        result = client.audio.transcriptions.create(
            file=(audio.filename, content, audio.content_type),
            model=TRANSCRIPTION_MODEL,
            response_format="text"
        )
        return {"text": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggestions", response_model=SuggestionsResponse)
async def suggestions(req: SuggestionsRequest, x_groq_key: str = Header(...)):
    client = get_client(x_groq_key)
    prompt = req.prompt or SUGGESTION_PROMPT

    try:
        response = client.chat.completions.create(
            model=GENERATION_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Transcript:\n{req.transcript}"}
            ],
            temperature=0.7,
            max_tokens=512,
        )
        raw = response.choices[0].message.content.strip()
        parsed = json.loads(raw)
        return SuggestionsResponse(suggestions=[Suggestion(**s) for s in parsed])
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Model returned invalid JSON")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat")
async def chat(req: ChatRequest, x_groq_key: str = Header(...)):
    client = get_client(x_groq_key)
    prompt = req.prompt or CHAT_PROMPT

    system_content = f"{prompt}\n\nTranscript context:\n{req.transcript}"
    messages = [{"role": "system", "content": system_content}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    def stream():
        try:
            with client.chat.completions.stream(
                model=GENERATION_MODEL,
                messages=messages,
                temperature=0.5,
                max_tokens=1024,
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'token': text})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/detail")
async def detail(req: DetailRequest, x_groq_key: str = Header(...)):
    client = get_client(x_groq_key)
    prompt = req.prompt or DETAIL_PROMPT

    system_content = f"{prompt}\n\nTranscript context:\n{req.transcript}"

    def stream():
        try:
            with client.chat.completions.stream(
                model=GENERATION_MODEL,
                messages=[
                    {"role": "system", "content": system_content},
                    {"role": "user", "content": req.suggestion}
                ],
                temperature=0.5,
                max_tokens=1024,
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'token': text})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
