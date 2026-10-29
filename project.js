"use strict";

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

const fields = [
  "worker",
  "beneficiary",
  "age",
  "village",
  "visitDate",
  "followUp",
  "notes"
];

let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let recognition = null;
let currentFormat = "A";

function todayLocal() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function readForm() {
  return {
    worker: $("worker").value.trim(),
    beneficiary: $("beneficiary").value.trim(),
    age: $("age").value.trim(),
    village: $("village").value.trim(),
    visitDate: $("visitDate").value,
    followUp: $("followUp").value,
    notes: $("notes").value.trim()
  };
}

function setStatus(id, message) {
  $(id).textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// ---------- Voice-to-text (browser dependent) ----------
const SpeechRecognitionAPI =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.lang = "hi-IN";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalText += result[0].transcript + " ";
      } else {
        interimText += result[0].transcript;
      }
    }

    const box = $("transcript");
    if (finalText.trim()) {
      box.value = (box.value + " " + finalText).trim();
    }

    setStatus(
      "voiceStatus",
      interimText ? "Listening: " + interimText : "Speech captured. Check the transcript."
    );
  };

  recognition.onerror = (event) => {
    setStatus("voiceStatus", "Speech recognition error: " + event.error);
  };

  recognition.onend = () => {
    $("startVoice").disabled = false;
    $("stopVoice").disabled = true;
  };
} else {
  $("startVoice").disabled = true;
  setStatus(
    "voiceStatus",
    "Is browser mein speech-to-text available nahi hai. Transcript manually type ya paste karo."
  );
}

$("startVoice").addEventListener("click", () => {
  if (!recognition) return;

  try {
    recognition.lang = "hi-IN";
    $("startVoice").disabled = true;
    $("stopVoice").disabled = false;
    setStatus("voiceStatus", "Listening in Hindi. Bolna shuru karo...");
    recognition.start();
  } catch (error) {
    setStatus("voiceStatus", "Voice start nahi hui. Dobara try karo.");
    $("startVoice").disabled = false;
    $("stopVoice").disabled = true;
  }
});

$("stopVoice").addEventListener("click", () => {
  if (recognition) recognition.stop();
  $("stopVoice").disabled = true;
});

// ---------- Audio recording ----------
// This saves an audio clip; it does NOT transcribe that clip.
$("startRecording").addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("voiceStatus", "Audio recording is browser/device par supported nahi hai.");
    return;
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(audioStream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm"
      });
      $("audioPlayer").src = URL.createObjectURL(audioBlob);
      $("audioPlayer").hidden = false;

      audioStream?.getTracks().forEach((track) => track.stop());
      audioStream = null;
      setStatus("voiceStatus", "Audio clip ready. Ye clip automatically text mein convert nahi hui.");
    };

    mediaRecorder.start();
    $("startRecording").disabled = true;
    $("stopRecording").disabled = false;
    setStatus("voiceStatus", "Audio recording chal rahi hai...");
  } catch (error) {
    setStatus("voiceStatus", "Microphone permission nahi mili ya recording fail hui.");
  }
});

$("stopRecording").addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  $("startRecording").disabled = false;
  $("stopRecording").disabled = true;
});

// ---------- Simple transcript extraction ----------
// This is a basic pattern matcher, not an AI/NLP model.
function extractDetails() {
  const text = $("transcript").value.trim();

  if (!text) {
    setStatus("saveStatus", "Pehle transcript type karo ya voice se text lao.");
    return;
  }

  const patterns = [
    {
      field: "beneficiary",
      regex: /(?:beneficiary|patient|name|naam)\s*(?:is|hai|:|-)?\s*([A-Za-z][A-Za-z .'-]{1,50}|[\u0900-\u097F][\u0900-\u097F .'-]{1,50})/i
    },
    {
      field: "age",
      regex: /(?:age|umar|umr)\s*(?:is|hai|:|-)?\s*(\d{1,3})\s*(?:years?|yrs?|saal|वर्ष)?/i
    },
    {
      field: "village",
      regex: /(?:village|gaon|गाँव|गांव|area|location)\s*(?:is|hai|:|-)?\s*([A-Za-z][A-Za-z .'-]{1,50}|[\u0900-\u097F][\u0900-\u097F .'-]{1,50})/i
    },
    {
      field: "worker",
      regex: /(?:asha worker|worker|worker name|asha)\s*(?:is|hai|:|-)?\s*([A-Za-z][A-Za-z .'-]{1,50}|[\u0900-\u097F][\u0900-\u097F .'-]{1,50})/i
    }
  ];

  for (const item of patterns) {
    const match = text.match(item.regex);
    if (match && match[1] && $(item.field).value.trim() === "") {
      $(item.field).value = match[1].trim().replace(/[.,;]+$/, "");
    }
  }

  if (!/[\u0900-\u097F]/.test(text)) {
    // Try common English date format: 2026-10-28
    const isoDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoDate && !$("visitDate").value) {
      $("visitDate").value = isoDate[1];
    }
  }

  if (!$("visitDate").value) $("visitDate").value = todayLocal();

  if (!$("notes").value.trim()) $("notes").value = text;

  setStatus(
    "saveStatus",
    "Possible details filled. Sab fields manually verify karo; extraction errors ho sakte hain."
  );
}

$("extractBtn").addEventListener("click", extractDetails);

// ---------- Local storage ----------
const STORAGE_KEY = "ekBaarBoloRecords_v1";

function getRecords() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function saveRecord() {
  const record = readForm();

  if (!record.beneficiary) {
    setStatus("saveStatus", "Beneficiary name bharna zaroori hai.");
    $("beneficiary").focus();
    return;
  }

  if (record.age && (!Number.isInteger(Number(record.age)) ||
      Number(record.age) < 0 || Number(record.age) > 120)) {
    setStatus("saveStatus", "Age 0 se 120 ke beech ek valid whole number honi chahiye.");
    return;
  }

  if (!record.visitDate) record.visitDate = todayLocal();

  const records = getRecords();
  record.id = (window.crypto?.randomUUID)
    ? window.crypto.randomUUID()
    : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  record.savedAt = new Date().toISOString();

  try {
    records.unshift(record);
    writeRecords(records);
    renderRecords();
    setStatus("saveStatus", "Record is browser mein save ho gaya.");
  } catch (error) {
    setStatus("saveStatus", "Save nahi hua. Browser storage full ya disabled ho sakta hai.");
  }
}

$("saveBtn").addEventListener("click", saveRecord);

function renderRecords() {
  const records = getRecords();
  const list = $("recordsList");

  if (!records.length) {
    list.innerHTML = '<p class="empty">Abhi koi saved record nahi hai.</p>';
    return;
  }

  list.innerHTML = records.map((record) => `
    <article class="record-item">
      <h3>${escapeHtml(record.beneficiary || "Unnamed beneficiary")}</h3>
      <p>Age: ${escapeHtml(record.age || "Not entered")} ·
         Village: ${escapeHtml(record.village || "Not entered")}</p>
      <p>Visit: ${escapeHtml(record.visitDate || "Not entered")}</p>
      <div class="button-row">
        <button class="btn secondary" data-action="load" data-id="${escapeHtml(record.id)}">Load</button>
        <button class="btn secondary" data-action="print" data-id="${escapeHtml(record.id)}">Print</button>
        <button class="btn danger" data-action="delete" data-id="${escapeHtml(record.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

$("recordsList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  const records = getRecords();
  const record = records.find((item) => item.id === id);

  if (!record) return;

  if (action === "load") {
    fields.forEach((field) => {
      $(field).value = record[field] ?? "";
    });
    setStatus("saveStatus", "Record form mein load ho gaya.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (action === "delete") {
    if (!confirm("Is record ko is browser se delete karna hai?")) return;
    writeRecords(records.filter((item) => item.id !== id));
    renderRecords();
  }

  if (action === "print") {
    printRegister([record]);
  }
});

// ---------- Configurable JSON schemas ----------
function getSchema(id) {
  try {
    const schema = JSON.parse($(id).value);
    if (!schema || Array.isArray(schema) || typeof schema !== "object") {
      throw new Error("Schema object hona chahiye.");
    }

    for (const [source, destination] of Object.entries(schema)) {
      if (!fields.includes(source)) {
        throw new Error("Unknown source field: " + source);
      }
      if (typeof destination !== "string" || !destination.trim()) {
        throw new Error("Har field mapping ki destination string honi chahiye.");
      }
    }
    return schema;
  } catch (error) {
    throw new Error("Schema JSON check karo: " + error.message);
  }
}

function generateFormat(schemaId, formatName) {
  try {
    const schema = getSchema(schemaId);
    const record = readForm();
    const output = {
      schema_version: "1.0",
      format: formatName,
      data: {}
    };

    for (const [source, destination] of Object.entries(schema)) {
      output.data[destination] = record[source];
    }

    $("jsonOutput").value = JSON.stringify(output, null, 2);
    currentFormat = formatName;
    setStatus("saveStatus", "Format " + formatName + " generate ho gaya.");
  } catch (error) {
    setStatus("saveStatus", error.message);
  }
}

$("formatABtn").addEventListener("click", () => {
  generateFormat("schemaA", "A");
});

$("formatBBtn").addEventListener("click", () => {
  generateFormat("schemaB", "B");
});

$("downloadJson").addEventListener("click", () => {
  const content = $("jsonOutput").value;
  if (!content) {
    setStatus("saveStatus", "Pehle Generate A ya Generate B dabao.");
    return;
  }

  downloadFile(
    "ek-baar-bolo-format-" + currentFormat.toLowerCase() + ".json",
    content,
    "application/json"
  );
});

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

$("exportAll").addEventListener("click", () => {
  downloadFile(
    "ek-baar-bolo-all-records.json",
    JSON.stringify(getRecords(), null, 2),
    "application/json"
  );
});

// ---------- Printable paper register ----------
function printRegister(records) {
  let sheet = $("printSheet");

  if (!sheet) {
    sheet = document.createElement("section");
    sheet.id = "printSheet";
    sheet.hidden = true;
    document.body.appendChild(sheet);
  }

  const rows = records.map((record) => `
    <tr>
      <td>${escapeHtml(record.visitDate)}</td>
      <td>${escapeHtml(record.worker)}</td>
      <td>${escapeHtml(record.beneficiary)}</td>
      <td>${escapeHtml(record.age)}</td>
      <td>${escapeHtml(record.village)}</td>
      <td>${escapeHtml(record.notes)}</td>
      <td>${escapeHtml(record.followUp)}</td>
    </tr>
  `).join("");

  sheet.innerHTML = `
    <h2>Visit Register</h2>
    <p>Ek Baar Bolo — Human-reviewed record</p>
    <table>
      <thead>
        <tr>
          <th>Visit date</th>
          <th>Worker</th>
          <th>Beneficiary</th>
          <th>Age</th>
          <th>Village</th>
          <th>Visit notes</th>
          <th>Follow-up</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Worker signature: ____________________</p>
    <p>Review/signature: ____________________</p>
  `;

  window.print();
}

$("printBtn").addEventListener("click", () => {
  const record = readForm();

  if (!record.beneficiary) {
    setStatus("saveStatus", "Print se pehle beneficiary name bharo.");
    return;
  }

  if (!record.visitDate) record.visitDate = todayLocal();
  printRegister([record]);
});

$("clearRecords").addEventListener("click", () => {
  if (!confirm("Kya tum is browser mein saved SAARE records delete karna chahte ho?")) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  renderRecords();
  setStatus("saveStatus", "Is app ke saved records delete ho gaye.");
});

// ---------- Initial state ----------
$("visitDate").value = todayLocal();
renderRecords();