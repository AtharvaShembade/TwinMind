from pydantic import BaseModel
from typing import Literal

SuggestionType = Literal["ANSWER", "FACT-CHECK", "QUESTION TO ASK", "TALKING POINT"]


class Suggestion(BaseModel):
    type: SuggestionType
    preview: str


class SuggestionsRequest(BaseModel):
    transcript: str
    prompt: str
    context_chunks: int = 5


class SuggestionsResponse(BaseModel):
    suggestions: list[Suggestion]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    transcript: str
    prompt: str
    context_chunks: int = 20


class DetailRequest(BaseModel):
    suggestion: str
    transcript: str
    prompt: str
    context_chunks: int = 20
