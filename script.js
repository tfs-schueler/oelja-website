const addButton = document.querySelector(".add-button");
const bagCount = document.querySelector(".bag-count");
const bagButton = document.querySelector(".bag-button");
const bagMessage = document.querySelector(".bag-message");
const chatPanel = document.querySelector(".chat-panel");
const chatLauncher = document.querySelector(".chat-launcher");
const chatClose = document.querySelector(".chat-close");
const chatForm = document.querySelector(".chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector(".chat-messages");
const chatSend = document.querySelector(".chat-send");
const chatStatus = document.querySelector(".chat-status");
const chatStatusDot = document.querySelector(".chat-status-dot");
const settingsForm = document.querySelector(".chat-settings-form");
const providerInput = document.querySelector("#ai-provider");
const urlInput = document.querySelector("#ai-url");
const modelInput = document.querySelector("#ai-model");
const chatSettings = document.querySelector(".chat-settings");
const chatSuggestions = document.querySelector(".chat-suggestions");

let itemCount = 0;
let isSending = false;
let chatHistory = [];
const savedSettings = JSON.parse(localStorage.getItem("olja-ai-settings") || "null");
const aiSettings = {
  provider: savedSettings?.provider === "openai" ? "openai" : "ollama",
  url: savedSettings?.url || "http://localhost:11434",
  model: savedSettings?.model || "llama3.2"
};

providerInput.value = aiSettings.provider;
urlInput.value = aiSettings.url;
modelInput.value = aiSettings.model;

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

function updateProviderDefaults() {
  if (providerInput.value === "ollama") {
    if (!urlInput.value || urlInput.value.includes(":1234")) urlInput.value = "http://localhost:11434";
    if (!modelInput.value || modelInput.value === "local-model") modelInput.value = "llama3.2";
  } else {
    if (!urlInput.value || urlInput.value.includes(":11434")) urlInput.value = "http://localhost:1234/v1";
    if (!modelInput.value || modelInput.value === "llama3.2") modelInput.value = "local-model";
  }
}

async function requestLocalAnswer(messages) {
  const baseUrl = aiSettings.url.replace(/\/+$/, "");
  const isOllama = aiSettings.provider === "ollama";
  const endpoint = isOllama ? `${baseUrl}/api/chat` : `${baseUrl}/chat/completions`;
  const requestMessages = [
    {
      role: "system",
      content: "You are Ölja's friendly olive oil guide. Be warm, concise, and helpful. Only make product claims supported by these facts: öliges Ölja ÖlivenÖl is extra virgin, cold extracted, single harvest, sold in 500 ml bottles for €24, with fresh-cut grass and green tomato notes and a peppery finish. If asked for facts not listed here, say you don't have that information rather than inventing details."
    },
    ...messages
  ];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(isOllama
      ? { model: aiSettings.model, messages: requestMessages, stream: false }
      : { model: aiSettings.model, messages: requestMessages, stream: false })
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error || detail?.message || `Local server returned ${response.status}.`);
  }

  const result = await response.json();
  const answer = isOllama ? result.message?.content : result.choices?.[0]?.message?.content;
  if (!answer) throw new Error("The server replied, but no answer was returned. Check the model name.");
  return answer.trim();
}

async function sendChatMessage(messageText) {
  const text = messageText.trim();
  if (!text || isSending) return;

  chatHistory.push({ role: "user", content: text });
  addChatMessage(text, "user");
  chatInput.value = "";
  chatInput.style.height = "auto";
  chatSuggestions.hidden = true;
  chatSettings.open = false;
  isSending = true;
  chatSend.disabled = true;
  setChatStatus("Connecting to local AI...");
  const pendingMessage = addChatMessage("One little moment...", "assistant", true);

  try {
    const answer = await requestLocalAnswer(chatHistory);
    chatHistory.push({ role: "assistant", content: answer });
    pendingMessage.remove();
    addChatMessage(answer, "assistant");
    setChatStatus(`Local AI · ${aiSettings.model}`);
  } catch (error) {
    pendingMessage.remove();
    const modelMissing = /model .+ not found/i.test(error.message);
    const reason = modelMissing
      ? `I couldn't find "${aiSettings.model}" on your Ollama server. Install it with: ollama pull ${aiSettings.model}. Or open Local AI settings and choose an installed model.`
      : error instanceof TypeError
        ? "I couldn't reach that server. Check that it's running and allows this site's origin in its CORS settings."
        : error.message;
    if (modelMissing) chatSettings.open = true;
    addChatMessage(reason, "assistant");
    setChatStatus(modelMissing ? "Model not installed" : "Local server unavailable", true);
  } finally {
    isSending = false;
    chatSend.disabled = false;
    chatInput.focus();
  }
}

addButton.addEventListener("click", () => {
  itemCount += 1;
  bagCount.textContent = itemCount;
  bagButton.setAttribute("aria-label", `Shopping bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`);
  bagMessage.textContent = `${itemCount} ${itemCount === 1 ? "bottle" : "bottles"} of the good stuff in your bag.`;
});

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

providerInput.addEventListener("change", updateProviderDefaults);

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  aiSettings.provider = providerInput.value;
  aiSettings.url = urlInput.value.trim();
  aiSettings.model = modelInput.value.trim();
  localStorage.setItem("olja-ai-settings", JSON.stringify(aiSettings));
  chatHistory = [];
  setChatStatus(`Local AI · ${aiSettings.provider === "ollama" ? "Ollama" : "OpenAI-compatible"}`);
  addChatMessage("Settings saved. Ask away!", "assistant");
  chatSettings.open = false;
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendChatMessage(chatInput.value);
});

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 90)}px`;
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatSuggestions.addEventListener("click", (event) => {
  const suggestion = event.target.closest("[data-prompt]");
  if (suggestion) sendChatMessage(suggestion.dataset.prompt);
});