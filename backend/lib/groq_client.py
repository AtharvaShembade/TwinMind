from groq import Groq

TRANSCRIPTION_MODEL = "whisper-large-v3"
GENERATION_MODEL = "llama-3.3-70b-versatile"


def create_client(api_key: str) -> Groq:
    return Groq(api_key=api_key)
