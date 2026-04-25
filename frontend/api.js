const API_BASE = window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : "https://twinmind-backend-12349696088.us-central1.run.app";

function getKey() {
  return localStorage.getItem("groq_key") || "";
}

async function transcribeAudio(blob) {
  const form = new FormData();
  form.append("audio", blob, "chunk.webm");

  const res = await fetch(`${API_BASE}/transcribe`, {
    method: "POST",
    headers: { "x-groq-key": getKey() },
    body: form,
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.text;
}

async function fetchSuggestions(transcript, settings) {
  const res = await fetch(`${API_BASE}/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-groq-key": getKey() },
    body: JSON.stringify({
      transcript,
      prompt: settings.suggestionPrompt,
      context_chunks: settings.suggestionChunks,
    }),
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.suggestions;
}

function streamDetail(suggestion, transcript, settings, onToken, onDone, onError) {
  fetch(`${API_BASE}/detail`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-groq-key": getKey() },
    body: JSON.stringify({
      suggestion,
      transcript,
      prompt: settings.detailPrompt,
      context_chunks: settings.detailChunks,
    }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return readStream(res.body, onToken, onDone);
    })
    .catch(onError);
}

function streamChat(messages, transcript, settings, onToken, onDone, onError) {
  fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-groq-key": getKey() },
    body: JSON.stringify({
      messages,
      transcript,
      prompt: settings.chatPrompt,
      context_chunks: settings.detailChunks,
    }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return readStream(res.body, onToken, onDone);
    })
    .catch(onError);
}

async function readStream(body, onToken, onDone) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") { onDone(); return; }
      try {
        const parsed = JSON.parse(payload);
        if (parsed.token) onToken(parsed.token);
        if (parsed.error) throw new Error(parsed.error);
      } catch {}
    }
  }
  onDone();
}
