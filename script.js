const bodySvg = document.querySelector(".body-svg");
const strokeLayer = document.querySelector(".massage-strokes");
const progressBar = document.querySelector(".progress-track");
const progressFill = document.querySelector(".progress-fill");
const progressValue = document.querySelector(".progress-value");
const progressNote = document.querySelector(".progress-note");
const oilLevel = document.querySelector(".oil-level");
const oilValue = document.querySelector(".oil-value");
const announcement = document.querySelector("#game-announcement");
const refillButton = document.querySelector(".refill-button");
const resetButton = document.querySelector(".reset-button");
const soundButton = document.querySelector(".sound-button");
const chatPanel = document.querySelector(".companion-panel");
const chatLauncher = document.querySelector(".chat-launcher");
const chatClose = document.querySelector(".chat-close");
const chatForm = document.querySelector(".chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector(".chat-messages");
const chatSend = document.querySelector(".chat-send");
const chatStatus = document.querySelector(".chat-status");
const chatStatusDot = document.querySelector(".chat-status-dot");
const chatSettings = document.querySelector(".chat-settings");
const chatSettingsForm = document.querySelector(".chat-settings-form");
const chatModelInput = document.querySelector("#ollama-model");

let massageProgress = 0;
let oilRemaining = 100;
let previousPoint = null;
let activeStroke = null;
let activeStrokePoints = 0;
let totalRubbed = 0;
let audioContext = null;
let ambientSource = null;
let ambientGain = null;
let chatHistory = [];
let isSending = false;
const chatSettingsKey = "stillroom-ollama-settings";
let ollamaSettings = { model: "gemma3:latest" };

try {
  const savedSettings = JSON.parse(localStorage.getItem(chatSettingsKey) || "null");
  if (savedSettings?.model) ollamaSettings.model = savedSettings.model;
} catch {
  localStorage.removeItem(chatSettingsKey);
}
chatModelInput.value = ollamaSettings.model;

function updateMeters() {
  const roundedProgress = Math.round(massageProgress);
  const roundedOil = Math.round(oilRemaining);
  progressFill.style.width = `${roundedProgress}%`;
  progressValue.textContent = `${roundedProgress}%`;
  progressBar.setAttribute("aria-valuenow", String(roundedProgress));
  oilValue.textContent = `${roundedOil}%`;
  oilLevel.style.setProperty("--oil-level", `${roundedOil}%`);

  if (roundedProgress === 100) {
    progressNote.textContent = "All warmed up. Keep going as long as you like.";
  } else if (roundedProgress >= 70) {
    progressNote.textContent = "Almost there. Keep your own pace.";
  } else if (roundedProgress >= 25) {
    progressNote.textContent = "That warmth is settling in.";
  }
}

function toSvgPoint(event) {
  const point = bodySvg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(bodySvg.getScreenCTM().inverse());
}

function isOverBody(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  return target?.closest?.("[data-massage-zone]") !== null && target?.closest?.("[data-massage-zone]") !== undefined;
}

function beginMassage(event) {
  if (!isOverBody(event) || oilRemaining <= 0) return;
  event.preventDefault();
  bodySvg.setPointerCapture(event.pointerId);
  bodySvg.classList.add("is-rubbing");
  previousPoint = toSvgPoint(event);
  activeStroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
  activeStroke.setAttribute("d", `M ${previousPoint.x} ${previousPoint.y}`);
  strokeLayer.append(activeStroke);
  activeStrokePoints = 0;
}

function rubBody(event) {
  if (!previousPoint || !activeStroke || !isOverBody(event)) return;
  const point = toSvgPoint(event);
  const distance = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
  if (distance < 1.5) return;

  totalRubbed = Math.min(1000, totalRubbed + distance);
  massageProgress = Math.min(100, totalRubbed / 10);
  oilRemaining = massageProgress >= 100 ? 100 : Math.max(0, oilRemaining - distance / 14);

  if (activeStrokePoints >= 40) {
    activeStroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
    activeStroke.setAttribute("d", `M ${previousPoint.x} ${previousPoint.y}`);
    strokeLayer.append(activeStroke);
    activeStrokePoints = 0;
    if (strokeLayer.childElementCount > 160) strokeLayer.firstElementChild.remove();
  }
  activeStroke.setAttribute("d", `${activeStroke.getAttribute("d")} L ${point.x} ${point.y}`);
  activeStrokePoints += 1;
  previousPoint = point;
  updateMeters();
}

function endMassage() {
  previousPoint = null;
  activeStroke = null;
  activeStrokePoints = 0;
  bodySvg.classList.remove("is-rubbing");
}

bodySvg.addEventListener("pointerdown", beginMassage);
bodySvg.addEventListener("pointermove", rubBody);
bodySvg.addEventListener("pointerup", endMassage);
bodySvg.addEventListener("pointercancel", endMassage);
bodySvg.addEventListener("lostpointercapture", endMassage);

refillButton.addEventListener("click", () => {
  if (oilRemaining >= 100) {
    progressNote.textContent = "Your hands are already full of warmth.";
    return;
  }
  oilRemaining = Math.min(100, oilRemaining + 35);
  progressNote.textContent = "A fresh little pour. Keep going gently.";
  announcement.textContent = "Oil replenished.";
  updateMeters();
});

resetButton.addEventListener("click", () => {
  massageProgress = 0;
  oilRemaining = 100;
  totalRubbed = 0;
  strokeLayer.replaceChildren();
  progressNote.textContent = "A little pressure, a long glide.";
  announcement.textContent = "The massage session has been reset.";
  updateMeters();
});

soundButton.addEventListener("click", async () => {
  const isOn = soundButton.getAttribute("aria-pressed") === "true";
  if (isOn) {
    ambientGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.2);
    ambientSource.stop(audioContext.currentTime + 1);
    ambientSource = null;
    ambientGain = null;
    soundButton.setAttribute("aria-pressed", "false");
    soundButton.querySelector("span").textContent = "Sound off";
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    soundButton.querySelector("span").textContent = "Sound unavailable";
    return;
  }
  audioContext ??= new AudioContextClass();
  if (audioContext.state === "suspended") await audioContext.resume();
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
  const noise = buffer.getChannelData(0);
  for (let sample = 0; sample < noise.length; sample += 1) noise[sample] = Math.random() * 2 - 1;
  ambientSource = audioContext.createBufferSource();
  ambientSource.buffer = buffer;
  ambientSource.loop = true;
  const lowPass = audioContext.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = 260;
  ambientGain = audioContext.createGain();
  ambientGain.gain.value = 0.06;
  ambientSource.connect(lowPass).connect(ambientGain).connect(audioContext.destination);
  ambientSource.start();
  soundButton.setAttribute("aria-pressed", "true");
  soundButton.querySelector("span").textContent = "Sound on";
});

function setChatStatus(message, isError = false) {
  chatStatus.textContent = message;
  chatStatusDot.classList.toggle("is-error", isError);
}

function addChatMessage(content, role, pending = false) {
  const message = document.createElement("div");
  message.className = `chat-message ${role === "user" ? "user-message" : "assistant-message"}`;
  if (pending) message.classList.add("is-pending");
  message.textContent = content;
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

async function sendChatMessage(messageText) {
  const text = messageText.trim();
  if (!text || isSending) return;

  chatHistory.push({ role: "user", content: text });
  chatHistory = chatHistory.slice(-20);
  addChatMessage(text, "user");
  chatInput.value = "";
  chatInput.style.height = "auto";
  chatSettings.open = false;
  isSending = true;
  chatSend.disabled = true;
  setChatStatus("Ölja is thinking…");
  const pendingMessage = addChatMessage("One moment…", "assistant", true);

  try {
    const response = await fetch("/api/ollama/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaSettings.model,
        messages: [
          {
            role: "system",
            content: "You are Ölja, a fictional adult man from St. Petersburg, Russia, lying face down and receiving a gentle olive-oil massage from the user. You are the person being massaged, not the masseur. Stay in that role and speak in first person about what you feel: the warmth of the oil, the pressure of their hands, and your body relaxing. Respond as someone enjoying this quiet, non-sexual massage. Do not give massage instructions or describe the user as receiving a massage. Match the language they use, including Russian or English. You are portrayed by a local Ollama AI; if asked, be honest about that. Keep replies warm and concise, and avoid cultural stereotypes."
          },
          ...chatHistory
        ],
        stream: false
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Ollama returned ${response.status}.`);
    const answer = result.message?.content?.trim();
    if (!answer) throw new Error("Ollama replied without a message.");
    chatHistory.push({ role: "assistant", content: answer });
    chatHistory = chatHistory.slice(-20);
    pendingMessage.remove();
    addChatMessage(answer, "assistant");
    setChatStatus(`Local Ollama · ${ollamaSettings.model}`);
  } catch (error) {
    pendingMessage.remove();
    chatHistory.pop();
    const detail = error instanceof TypeError
      ? "Start the local chat bridge with python3 server.py, then check that Ollama is running."
      : error.message;
    addChatMessage(detail, "assistant");
    setChatStatus("Local connection unavailable", true);
  } finally {
    isSending = false;
    chatSend.disabled = false;
    chatInput.focus();
  }
}

chatLauncher.addEventListener("click", () => {
  chatPanel.hidden = !chatPanel.hidden;
  chatLauncher.setAttribute("aria-expanded", String(!chatPanel.hidden));
  if (!chatPanel.hidden) chatInput.focus();
});

chatClose.addEventListener("click", () => {
  chatPanel.hidden = true;
  chatLauncher.setAttribute("aria-expanded", "false");
  chatLauncher.focus();
});

chatSettingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  ollamaSettings.model = chatModelInput.value.trim();
  localStorage.setItem(chatSettingsKey, JSON.stringify(ollamaSettings));
  chatHistory = [];
  setChatStatus(`Local Ollama · ${ollamaSettings.model}`);
  chatSettings.open = false;
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendChatMessage(chatInput.value);
});

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 80)}px`;
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

updateMeters();