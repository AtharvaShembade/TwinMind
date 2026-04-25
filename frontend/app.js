const state = {
  transcriptChunks: [],
  suggestionBatches: [],
  chatMessages: [],
  settings: {
    suggestionPrompt: "",
    detailPrompt: "",
    chatPrompt: "",
    suggestionChunks: 5,
    detailChunks: 20,
  },
};

let batchCount = 0;
let refreshTimer = null;
let refreshCountdown = 30;
let countdownTimer = null;
let isStreaming = false;

const $ = (id) => document.getElementById(id);

// DOM refs
const micBtn = $("mic-btn");
const micLabel = $("mic-label");
const recStatus = $("rec-status");
const transcriptBody = $("transcript-body");
const suggestionsBody = $("suggestions-body");
const batchCountEl = $("batch-count");
const autoLabel = $("auto-label");
const refreshBtn = $("refresh-btn");
const chatBody = $("chat-body");
const chatInput = $("chat-input");
const sendBtn = $("send-btn");
const exportBtn = $("export-btn");
const settingsBtn = $("settings-btn");
const settingsModal = $("settings-modal");
const settingsClose = $("settings-close");
const settingsSave = $("settings-save");

// --- Transcript ---

function addTranscriptChunk(text) {
  const chunk = { id: crypto.randomUUID(), timestamp: Date.now(), text };
  state.transcriptChunks.push(chunk);

  const el = document.createElement("div");
  el.className = "transcript-chunk";
  el.innerHTML = `<span class="chunk-time">${formatTime(chunk.timestamp)}</span><span class="chunk-text">${escapeHtml(text)}</span>`;
  transcriptBody.appendChild(el);
  transcriptBody.scrollTop = transcriptBody.scrollHeight;
}

function getRecentTranscript(n) {
  return state.transcriptChunks.slice(-n).map((c) => c.text).join("\n");
}

// --- Suggestions ---

let isLoadingSuggestions = false;

async function loadSuggestions() {
  if (isLoadingSuggestions) return;
  if (!state.transcriptChunks.length) return;
  if (!localStorage.getItem("groq_key")) { showToast("Add your Groq API key in Settings."); return; }

  isLoadingSuggestions = true;
  refreshBtn.disabled = true;
  try {
    const transcript = getRecentTranscript(state.settings.suggestionChunks);
    const suggestions = await fetchSuggestions(transcript, state.settings);
    addSuggestionBatch(suggestions);
  } catch (err) {
    showToast(err.message || "Failed to load suggestions.");
  } finally {
    isLoadingSuggestions = false;
    refreshBtn.disabled = false;
  }
}

function addSuggestionBatch(suggestions) {
  batchCount++;
  const batch = { id: crypto.randomUUID(), batchNumber: batchCount, timestamp: Date.now(), suggestions };
  state.suggestionBatches.unshift(batch);
  batchCountEl.textContent = `${batchCount} BATCH${batchCount !== 1 ? "ES" : ""}`;

  // fade all existing batches
  suggestionsBody.querySelectorAll(".suggestion-batch").forEach((el) => el.classList.add("faded"));

  const batchEl = document.createElement("div");
  batchEl.className = "suggestion-batch";
  batchEl.dataset.batchId = batch.id;

  suggestions.forEach((s) => {
    const card = document.createElement("div");
    card.className = "suggestion-card";
    card.innerHTML = `
      <span class="suggestion-type ${typeClass(s.type)}">${s.type}</span>
      <span class="suggestion-preview">${escapeHtml(s.preview)}</span>
    `;
    card.addEventListener("click", () => onSuggestionClick(s));
    batchEl.appendChild(card);
  });

  if (batchCount > 1) {
    const divider = document.createElement("div");
    divider.className = "batch-divider";
    divider.textContent = `— BATCH ${batchCount} · ${formatTime(batch.timestamp)} —`;
    suggestionsBody.prepend(divider);
  }

  suggestionsBody.prepend(batchEl);
  resetCountdown();
}

// --- Suggestion click → detail stream ---

function onSuggestionClick(suggestion) {
  if (isStreaming) return;
  const transcript = getRecentTranscript(state.settings.detailChunks);
  addChatMessage("user", suggestion.preview, suggestion.preview);
  const assistantEl = addChatMessage("assistant", "");
  streamDetail(
    suggestion.preview,
    transcript,
    state.settings,
    (token) => appendToMessage(assistantEl, token),
    () => { finalizeMessage(assistantEl); isStreaming = false; },
    (err) => { showToast(err.message || "Stream error."); isStreaming = false; }
  );
  isStreaming = true;
}

// --- Chat ---

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;
  chatInput.value = "";

  addChatMessage("user", text);
  const transcript = getRecentTranscript(state.settings.detailChunks);
  const messages = state.chatMessages.map((m) => ({ role: m.role, content: m.content }));
  const assistantEl = addChatMessage("assistant", "");

  isStreaming = true;
  streamChat(
    messages,
    transcript,
    state.settings,
    (token) => appendToMessage(assistantEl, token),
    () => { finalizeMessage(assistantEl); isStreaming = false; },
    (err) => { showToast(err.message || "Stream error."); isStreaming = false; }
  );
}

function addChatMessage(role, content, sourceSuggestion = null) {
  const msg = { id: crypto.randomUUID(), role, content, timestamp: Date.now(), sourceSuggestion };
  state.chatMessages.push(msg);

  const el = document.createElement("div");
  el.className = `chat-message ${role}`;
  el.dataset.msgId = msg.id;
  el.innerHTML = `
    <span class="chat-role">${role === "user" ? "YOU" : "ASSISTANT"}</span>
    <div class="chat-content">${escapeHtml(content)}</div>
  `;
  chatBody.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
  return el;
}

function appendToMessage(el, token) {
  const content = el.querySelector(".chat-content");
  content.textContent += token;
  chatBody.scrollTop = chatBody.scrollHeight;
}

function finalizeMessage(el) {
  const content = el.querySelector(".chat-content");
  const rawText = content.textContent;
  content.innerHTML = marked.parse(rawText);
  const msg = state.chatMessages.find((m) => m.id === el.dataset.msgId);
  if (msg) msg.content = rawText;
}

// --- Mic ---

micBtn.addEventListener("click", () => {
  if (getIsRecording()) {
    stopRecording();
    micBtn.classList.remove("recording");
    micLabel.textContent = "Click to start recording";
    recStatus.textContent = "IDLE";
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);
  } else {
    if (!localStorage.getItem("groq_key")) { showToast("Add your Groq API key in Settings first."); return; }
    startRecording(
      (text) => {
        addTranscriptChunk(text);
        clearInterval(refreshTimer);
        refreshTimer = setInterval(loadSuggestions, 30000);
        refreshCountdown = 30;
        loadSuggestions();
      },
      (err) => showToast(err)
    );
    micBtn.classList.add("recording");
    micLabel.textContent = "Recording...";
    recStatus.textContent = "RECORDING";
    startAutoRefresh();
  }
});

// --- Auto refresh ---

function startAutoRefresh() {
  refreshCountdown = 30;
  refreshTimer = setInterval(loadSuggestions, 30000);
  countdownTimer = setInterval(() => {
    refreshCountdown--;
    autoLabel.textContent = `auto-refresh in ${refreshCountdown}s`;
    if (refreshCountdown <= 0) refreshCountdown = 30;
  }, 1000);
}

function resetCountdown() {
  refreshCountdown = 30;
}

refreshBtn.addEventListener("click", loadSuggestions);

// --- Settings ---

settingsBtn.addEventListener("click", () => {
  $("groq-key-input").value = localStorage.getItem("groq_key") || "";
  $("suggestion-chunks").value = state.settings.suggestionChunks;
  $("detail-chunks").value = state.settings.detailChunks;
  $("suggestion-prompt").value = state.settings.suggestionPrompt;
  $("detail-prompt").value = state.settings.detailPrompt;
  $("chat-prompt").value = state.settings.chatPrompt;
  settingsModal.classList.remove("hidden");
});

settingsClose.addEventListener("click", () => settingsModal.classList.add("hidden"));
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.add("hidden"); });

settingsSave.addEventListener("click", () => {
  const key = $("groq-key-input").value.trim();
  if (key) localStorage.setItem("groq_key", key);
  else localStorage.removeItem("groq_key");
  state.settings.suggestionChunks = parseInt($("suggestion-chunks").value) || 5;
  state.settings.detailChunks = parseInt($("detail-chunks").value) || 20;
  state.settings.suggestionPrompt = $("suggestion-prompt").value.trim() || state.settings.suggestionPrompt;
  state.settings.detailPrompt = $("detail-prompt").value.trim() || state.settings.detailPrompt;
  state.settings.chatPrompt = $("chat-prompt").value.trim() || state.settings.chatPrompt;
  settingsModal.classList.add("hidden");
});

// --- Export ---

exportBtn.addEventListener("click", () => exportSession(state));

// --- Chat input ---

sendBtn.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChatMessage(); });

// --- Toast ---

function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

// --- Helpers ---

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function typeClass(type) {
  const map = {
    "ANSWER": "type-answer",
    "FACT-CHECK": "type-factcheck",
    "QUESTION TO ASK": "type-question",
    "TALKING POINT": "type-talking",
  };
  return map[type] || "type-answer";
}
