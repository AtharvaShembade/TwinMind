function formatTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

function exportSession(state) {
  const payload = {
    exportedAt: new Date().toISOString(),
    transcript: state.transcriptChunks.map((c) => ({
      time: formatTime(c.timestamp),
      text: c.text,
    })),
    suggestions: state.suggestionBatches.map((b) => ({
      batch: b.batchNumber,
      time: formatTime(b.timestamp),
      items: b.suggestions.map((s) => ({ type: s.type, preview: s.preview })),
    })),
    chat: state.chatMessages.map((m) => ({
      time: formatTime(m.timestamp),
      role: m.role,
      content: m.content,
      ...(m.sourceSuggestion ? { sourceSuggestion: m.sourceSuggestion } : {}),
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `twinmind-session-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
