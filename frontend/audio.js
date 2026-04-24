const CHUNK_INTERVAL_MS = 30000;

let mediaRecorder = null;
let chunks = [];
let chunkTimer = null;
let isRecording = false;

async function startRecording(onTranscript, onError) {
  if (isRecording) return;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    onError("Microphone access denied.");
    return;
  }

  isRecording = true;
  recordChunk(stream, onTranscript, onError);

  chunkTimer = setInterval(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }, CHUNK_INTERVAL_MS);
}

function recordChunk(stream, onTranscript, onError) {
  chunks = [];
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    if (!isRecording) return;
    const blob = new Blob(chunks, { type: "audio/webm" });
    try {
      const text = await transcribeAudio(blob);
      if (text && text.trim()) onTranscript(text.trim());
    } catch (err) {
      onError(err.message || "Transcription failed.");
    }
    // immediately start next chunk
    recordChunk(stream, onTranscript, onError);
  };

  mediaRecorder.start();
}

function stopRecording() {
  isRecording = false;
  clearInterval(chunkTimer);
  chunkTimer = null;

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
}

function getIsRecording() {
  return isRecording;
}
