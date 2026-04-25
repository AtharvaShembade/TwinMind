from groq import Groq

TRANSCRIPTION_MODEL = "whisper-large-v3"
GENERATION_MODEL = "openai/gpt-oss-120b"


def create_client(api_key: str) -> Groq:
    return Groq(api_key=api_key)
