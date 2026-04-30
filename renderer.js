const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_SUMMARY_MODEL = "gpt-4o-mini";
const WHISPER_MODEL = "whisper-1";
const CHUNK_INTERVAL_MS = 10000;
const MIN_CHUNK_BYTES = 6000;
const TRIAL_DAYS = 7;
const LICENSE_HASH_PREFIX = "SVC_LICENSE_V1:";

const STORAGE = {
  openAiKey: "svc_openai_api_key",
  licenseKey: "svc_license_key",
  trialStartedAt: "svc_trial_started_at",
};

const el = {
  openAiKey: document.getElementById("openAiKey"),
  openAiKeyStatus: document.getElementById("openAiKeyStatus"),
  licenseKey: document.getElementById("licenseKey"),
  licenseStatus: document.getElementById("licenseStatus"),
  activateLicenseBtn: document.getElementById("activateLicenseBtn"),
  accessTitle: document.getElementById("accessTitle"),
  accessDetail: document.getElementById("accessDetail"),
  queueStatus: document.getElementById("queueStatus"),
  status: document.getElementById("status"),
  recordingTime: document.getElementById("recordingTime"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  transcript: document.getElementById("transcript"),
  clearTranscriptBtn: document.getElementById("clearTranscriptBtn"),
  summary: document.getElementById("summary"),
  summaryBtn: document.getElementById("summaryBtn"),
  summaryPrompt: document.getElementById("summaryPrompt"),
};

let recorder = null;
let screenStream = null;
let audioStream = null;
let isRecording = false;
let recordingStartedAt = 0;
let timerId = null;
let segmentTimerId = null;
let activeChunks = 0;
let chunkCount = 0;
let transcriptionQueue = Promise.resolve();
let licenseValid = false;
let captureStopping = false;
let recorderToReleaseOnStop = null;

function getOpenAiKey() {
  return (el.openAiKey.value || "").trim();
}

function setStatus(message) {
  el.status.textContent = message || "Ready";
}

function normalizeLicenseKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatLicenseKey(value) {
  const normalized = normalizeLicenseKey(value);
  if (!normalized) return "";
  if (!normalized.startsWith("SVC")) return normalized;
  const body = normalized.slice(3).match(/.{1,5}/g) || [];
  return ["SVC", ...body].join("-");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateLicenseKey(value) {
  const normalized = normalizeLicenseKey(value);
  if (!normalized) return false;
  const hash = await sha256Hex(`${LICENSE_HASH_PREFIX}${normalized}`);
  return Array.isArray(window.SVC_LICENSE_HASHES) && window.SVC_LICENSE_HASHES.includes(hash);
}

function getTrialStartedAt() {
  const stored = Number(localStorage.getItem(STORAGE.trialStartedAt));
  const now = Date.now();
  if (Number.isFinite(stored) && stored > 0 && stored <= now) return stored;
  localStorage.setItem(STORAGE.trialStartedAt, String(now));
  return now;
}

function getTrialState() {
  const startedAt = getTrialStartedAt();
  const expiresAt = startedAt + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const msLeft = expiresAt - Date.now();
  return {
    active: msLeft > 0,
    daysLeft: Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))),
  };
}

function hasAccess() {
  const trial = getTrialState();
  return licenseValid || trial.active;
}

function updateQueueStatus() {
  const label = chunkCount === 1 ? "chunk" : "chunks";
  el.queueStatus.textContent = `${chunkCount} ${label}${activeChunks ? `, ${activeChunks} processing` : ""}`;
}

function updateTimer() {
  if (!isRecording) {
    el.recordingTime.textContent = "00:00";
    return;
  }
  const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  el.recordingTime.textContent = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function updateButtons() {
  const apiKeyReady = Boolean(getOpenAiKey());
  const accessReady = hasAccess();
  el.startBtn.disabled = isRecording || !apiKeyReady || !accessReady;
  el.stopBtn.disabled = !isRecording;
  el.summaryBtn.disabled = isRecording || !apiKeyReady || !accessReady || !(el.transcript.value || "").trim();
  el.openAiKeyStatus.textContent = apiKeyReady ? "Saved locally in this app." : "Required for transcription and summary.";
}

function updateAccessUi() {
  const trial = getTrialState();
  if (licenseValid) {
    el.accessTitle.textContent = "Licensed";
    el.accessDetail.textContent = "Full access is active.";
    el.licenseStatus.textContent = "License key accepted.";
  } else if (trial.active) {
    el.accessTitle.textContent = "Trial active";
    el.accessDetail.textContent = `${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left.`;
  } else {
    el.accessTitle.textContent = "License required";
    el.accessDetail.textContent = "Enter a valid license key to continue.";
  }
  updateButtons();
}

function appendTranscript(text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  const prefix = el.transcript.value.trim() ? "\n" : "";
  el.transcript.value += `${prefix}${clean}`;
  el.transcript.scrollTop = el.transcript.scrollHeight;
  updateButtons();
}

function getRecorderMimeType() {
  const preferred = [
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  return preferred.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function releaseCaptureStreams() {
  audioStream?.getTracks().forEach((track) => track.stop());
  screenStream?.getTracks().forEach((track) => track.stop());
  audioStream = null;
  screenStream = null;
}

function startSegmentRecorder() {
  if (!audioStream || !isRecording) return;

  const chunks = [];
  const mimeType = getRecorderMimeType();
  const currentRecorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);
  recorder = currentRecorder;

  currentRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  currentRecorder.onerror = (event) => {
    console.error(event.error);
    setStatus(event.error?.message || "Recording error.");
  };

  currentRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: currentRecorder.mimeType || "audio/webm" });
    enqueueTranscription(blob);
    if (captureStopping && recorderToReleaseOnStop === currentRecorder) {
      recorderToReleaseOnStop = null;
      releaseCaptureStreams();
    } else if (!captureStopping && isRecording) {
      startSegmentRecorder();
    }
  };

  currentRecorder.start();
}

function rotateSegmentRecorder() {
  if (!isRecording) return;

  const currentRecorder = recorder;
  if (currentRecorder && currentRecorder.state !== "inactive") {
    currentRecorder.stop();
  } else {
    startSegmentRecorder();
  }
}

async function transcribeChunk(blob) {
  const form = new FormData();
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append("file", blob, `screen-audio-${Date.now()}.webm`);

  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiKey()}`,
    },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `OpenAI transcription error ${response.status}`;
    throw new Error(message);
  }

  return data.text || "";
}

function enqueueTranscription(blob) {
  if (!blob || blob.size < MIN_CHUNK_BYTES) return;
  chunkCount += 1;
  activeChunks += 1;
  updateQueueStatus();

  transcriptionQueue = transcriptionQueue
    .then(async () => {
      setStatus("Transcribing screen audio...");
      const text = await transcribeChunk(blob);
      appendTranscript(text);
    })
    .catch((error) => {
      console.error(error);
      setStatus(error.message || "Transcription failed.");
    })
    .finally(() => {
      activeChunks -= 1;
      updateQueueStatus();
      if (!isRecording && activeChunks === 0) setStatus("Stopped");
    });
}

async function startCapture() {
  if (isRecording || !hasAccess()) return;

  if (!getOpenAiKey()) {
    setStatus("Enter an OpenAI API key.");
    updateButtons();
    return;
  }

  try {
    setStatus("Opening screen audio...");
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    const audioTracks = screenStream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error("No screen audio track was captured.");
    }

    // Keep display capture alive because some Chromium builds tie loopback audio to it.
    // Only audio tracks are recorded and sent to OpenAI.
    audioStream = new MediaStream(audioTracks);

    chunkCount = 0;
    activeChunks = 0;
    captureStopping = false;
    recorderToReleaseOnStop = null;
    updateQueueStatus();
    isRecording = true;
    recordingStartedAt = Date.now();
    timerId = setInterval(updateTimer, 500);
    startSegmentRecorder();
    segmentTimerId = setInterval(rotateSegmentRecorder, CHUNK_INTERVAL_MS);
    setStatus("Capturing screen audio...");
    updateTimer();
    updateButtons();
  } catch (error) {
    console.error(error);
    stopCapture();
    setStatus(error.message || "Could not capture screen audio.");
  }
}

function stopCapture() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  if (segmentTimerId) {
    clearInterval(segmentTimerId);
    segmentTimerId = null;
  }

  captureStopping = true;
  const currentRecorder = recorder;
  if (currentRecorder && currentRecorder.state !== "inactive") {
    recorderToReleaseOnStop = currentRecorder;
    currentRecorder.stop();
  } else {
    recorderToReleaseOnStop = null;
    releaseCaptureStreams();
  }

  recorder = null;
  isRecording = false;
  updateTimer();
  updateButtons();
  if (activeChunks > 0) setStatus("Finishing transcription...");
  else setStatus("Stopped");
}

async function createSummary() {
  const transcript = (el.transcript.value || "").trim();
  if (!transcript) {
    setStatus("Transcript is empty.");
    return;
  }

  setStatus("Creating summary...");
  el.summaryBtn.disabled = true;

  try {
    const response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenAiKey()}`,
      },
      body: JSON.stringify({
        model: OPENAI_SUMMARY_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You summarize screen-audio transcripts. Use the same language as the transcript unless the user prompt asks otherwise.",
          },
          {
            role: "user",
            content: `${(el.summaryPrompt.value || "").trim()}\n\n${transcript}`,
          },
        ],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `OpenAI summary error ${response.status}`);
    }

    el.summary.value = data.choices?.[0]?.message?.content?.trim() || "";
    setStatus("Summary ready.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Summary failed.");
  } finally {
    updateButtons();
  }
}

async function activateLicense() {
  const entered = formatLicenseKey(el.licenseKey.value);
  el.licenseKey.value = entered;
  el.licenseStatus.textContent = "Checking license...";

  const ok = await validateLicenseKey(entered);
  licenseValid = ok;
  if (ok) {
    localStorage.setItem(STORAGE.licenseKey, entered);
  } else {
    localStorage.removeItem(STORAGE.licenseKey);
    el.licenseStatus.textContent = "License key not accepted.";
  }
  updateAccessUi();
}

async function restoreLicense() {
  const stored = localStorage.getItem(STORAGE.licenseKey) || "";
  if (stored) {
    el.licenseKey.value = formatLicenseKey(stored);
    licenseValid = await validateLicenseKey(stored);
    if (!licenseValid) localStorage.removeItem(STORAGE.licenseKey);
  }
  updateAccessUi();
}

function bindEvents() {
  el.startBtn.addEventListener("click", startCapture);
  el.stopBtn.addEventListener("click", stopCapture);
  el.summaryBtn.addEventListener("click", createSummary);
  el.clearTranscriptBtn.addEventListener("click", () => {
    el.transcript.value = "";
    el.summary.value = "";
    updateButtons();
  });
  el.activateLicenseBtn.addEventListener("click", activateLicense);

  el.openAiKey.addEventListener("input", () => {
    localStorage.setItem(STORAGE.openAiKey, getOpenAiKey());
    updateButtons();
  });
  el.transcript.addEventListener("input", updateButtons);
  el.licenseKey.addEventListener("input", () => {
    el.licenseKey.value = formatLicenseKey(el.licenseKey.value);
  });

  window.addEventListener("beforeunload", () => {
    if (isRecording) stopCapture();
  });
}

async function init() {
  el.openAiKey.value = localStorage.getItem(STORAGE.openAiKey) || "";
  bindEvents();
  updateQueueStatus();
  await restoreLicense();
  updateAccessUi();
  updateButtons();
}

init();
