let conversations = JSON.parse(localStorage.getItem('guruji_conversations') || '[]');
let currentConvId = null;
let isStreaming = false;

const PROMPT_VER = 5;

function loadClientConfig() {
  const cfg = JSON.parse(localStorage.getItem('guruji_config') || '{}');
  if (cfg.promptVer !== PROMPT_VER) {
    delete cfg.systemPrompt;
    cfg.promptVer = PROMPT_VER;
    localStorage.setItem('guruji_config', JSON.stringify(cfg));
  }
  return cfg;
}

/* ============ Persistent Memory ============ */

function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem('guruji_memory') || '{}');
  } catch (e) { return {}; }
}

function saveMemory(memo) {
  localStorage.setItem('guruji_memory', JSON.stringify(memo));
}

function updateMemory(userText, assistantText) {
  const memo = loadMemory();

  const nameMatch = (userText + ' ' + (memo.lastUser || '')).match(/\b(?:my name is|called|i am|i'?m)\s+([A-Z][a-zA-Z]{2,})/i);
  if (nameMatch && !memo.name) memo.name = nameMatch[1][0].toUpperCase() + nameMatch[1].slice(1).toLowerCase();

  const topicMatch = userText.match(/\b(?:teach me|learn|study|understand|explain)\s+(?:about\s+)?(.{2,50}?)(?:\?|\.|$)/i);
  if (topicMatch && topicMatch[1]) {
    const topic = topicMatch[1].trim();
    if (!memo.topics) memo.topics = [];
    if (!memo.topics.includes(topic)) {
      memo.topics.push(topic);
      if (memo.topics.length > 8) memo.topics.shift();
    }
    memo.lastTopic = topic;
  }

  const levelMatch = assistantText.match(/(?:your level|level)[:：]?\s*(\d{1,2})\s*(?:\/\s*10)?/i);
  if (levelMatch) memo.level = levelMatch[1] + '/10';

  memo.lastUser = userText;
  memo.updatedAt = new Date().toISOString();
  saveMemory(memo);
}

function compileMemory() {
  const memo = loadMemory();
  const adminNotes = loadClientConfig().memory || '';
  const lines = [];
  if (memo.name) lines.push(`• Name: ${memo.name}`);
  if (memo.level) lines.push(`• Current level: ${memo.level}`);
  if (memo.topics && memo.topics.length) lines.push(`• Topics learning: ${memo.topics.slice(-4).join(', ')}`);
  if (memo.lastTopic) lines.push(`• Currently learning: ${memo.lastTopic}`);
  if (adminNotes.trim()) lines.push(`• Teacher notes: ${adminNotes.trim()}`);
  return lines.join('\n');
}

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const welcomeEl = document.getElementById('welcome');
const conversationsEl = document.getElementById('conversations');

function saveConversations() {
  localStorage.setItem('guruji_conversations', JSON.stringify(conversations));
}

function renderConversations() {
  conversationsEl.innerHTML = conversations.map((c, i) => `
    <div class="conv-item ${c.id === currentConvId ? 'active' : ''}" onclick="loadConversation(${i})">
      ${c.title || 'New chat'}
    </div>
  `).join('');
}

function newChat() {
  const conv = {
    id: Date.now(),
    title: '',
    messages: []
  };
  conversations.unshift(conv);
  currentConvId = conv.id;
  saveConversations();
  renderConversations();
  messagesEl.innerHTML = '';
  messagesEl.appendChild(welcomeEl);
  welcomeEl.style.display = 'flex';
  inputEl.focus();
}

function loadConversation(index) {
  const conv = conversations[index];
  currentConvId = conv.id;
  saveConversations();
  renderConversations();
  welcomeEl.style.display = 'none';
  messagesEl.innerHTML = '';
  conv.messages.forEach(msg => appendMessage(msg.role, msg.content));
  scrollToBottom();
}

function getCurrentConv() {
  return conversations.find(c => c.id === currentConvId);
}

function askSuggestion(topic) {
  inputEl.value = `Teach me about ${topic}`;
  send();
}

function appendMessage(role, content) {
  welcomeEl.style.display = 'none';
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="message-content">
      <div class="avatar">${role === 'user' ? 'U' : 'g'}</div>
      <div class="message-body">${formatMarkdown(content)}</div>
    </div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function appendTyping() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'typing-msg';
  div.innerHTML = `
    <div class="message-content">
      <div class="avatar">g</div>
      <div class="message-body">
        <div class="typing"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function formatMarkdown(text) {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
}

inputEl.addEventListener('input', autoResize);

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

/* ============ Voice Mode ============ */

const voiceToggle = document.getElementById('voiceToggle');
const voiceStatus = document.getElementById('voiceStatus');
const voiceLang = document.getElementById('voiceLang');
const micBtn = document.getElementById('micBtn');

let voiceMode = false;
let voiceActive = false;
let micPushTalk = false;
let pendingSpeech = [];
let lastFinal = '';
let speechWatchdog = null;
let timeoutVoice = null;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;

function setVoiceStatus(text, live) {
  voiceStatus.textContent = text;
  voiceStatus.classList.toggle('live', !!live);
}

function stopSpeechWatchdog() {
  if (speechWatchdog) {
    clearInterval(speechWatchdog);
    speechWatchdog = null;
  }
}

function initRecognizer() {
  if (!SR) { setVoiceStatus('Voice not supported in this browser'); return; }
  recognizer = new SR();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = voiceLang.value;

  recognizer.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) finalText += res[0].transcript + ' ';
      else interimText += res[0].transcript;
    }

    const finalClean = finalText.trim();
    if (finalClean) {
      if (finalClean === lastFinal) return;
      lastFinal = finalClean;
      if (isStreaming) {
        pendingSpeech.push(finalClean);
        inputEl.value = '';
      } else {
        stopListening();
        inputEl.value = finalClean;
        send();
      }
      return;
    }

    if (interimText && !isStreaming) {
      inputEl.value = interimText.trim();
      autoResize();
    }
  };

  recognizer.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setVoiceStatus('Mic permission denied');
      voiceActive = false;
      toggleMicClass(false);
      micPushTalk = false;
    } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
      setVoiceStatus('Mic error: ' + event.error);
    }
  };

  recognizer.onend = () => {
    voiceActive = false;
    toggleMicClass(false);
    if (!voiceMode) micPushTalk = false;
    if (voiceMode && !isStreaming && !(window.speechSynthesis && speechSynthesis.speaking)) {
      startListening();
    } else if (voiceMode) {
      setVoiceStatus('Re-listening…');
    } else {
      setVoiceStatus('');
    }
  };
}

function startListening() {
  if (!recognizer) initRecognizer();
  if (!recognizer || voiceActive) return;
  try {
    recognizer.lang = voiceLang.value;
    recognizer.start();
    voiceActive = true;
    lastFinal = '';
    toggleMicClass(true);
    setVoiceStatus('Listening…', true);
  } catch (e) {}
}

function stopListening() {
  if (recognizer && voiceActive) {
    recognizer.stop();
    voiceActive = false;
    toggleMicClass(false);
    if (!voiceMode) setVoiceStatus('');
  }
}

function toggleMicClass(active) {
  micBtn.classList.toggle('listening', active);
  if (voiceMode && active) micBtn.classList.add('hidden');
  else if (!voiceMode) micBtn.classList.remove('hidden');
}

function toggleVoice() {
  voiceMode = voiceToggle.checked;
  localStorage.setItem('guruji_voice', voiceMode ? '1' : '0');
  stopSpeechWatchdog();
  if (voiceMode) {
    if (window.speechSynthesis) speechSynthesis.cancel();
    stopListening();
    clearTimeout(timeoutVoice);
    if (!SR) {
      setVoiceStatus('Voice not supported in this browser');
    } else {
      timeoutVoice = setTimeout(() => { startListening(); }, 200);
    }
  } else {
    pendingSpeech = [];
    clearTimeout(timeoutVoice);
    stopListening();
    if (window.speechSynthesis) speechSynthesis.cancel();
    setVoiceStatus('');
  }
}

function toggleMic() {
  if (voiceMode) return;
  micPushTalk = !micPushTalk;
  if (micPushTalk) {
    startListening();
    if (!voiceActive) micPushTalk = false;
  } else {
    stopListening();
  }
}

function updateVoiceLang() {
  if (recognizer) recognizer.lang = voiceLang.value;
  localStorage.setItem('guruji_voiceLang', voiceLang.value);
}

function cleanForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-•]\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/Step \d:/g, 'Step')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text) {
  const parts = [];
  let cur = '';
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const next = (cur ? cur + ' ' : '') + s;
    if (next.length > 220 && cur.trim()) {
      parts.push(cur.trim());
      cur = s;
    } else {
      cur = next;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

let speechQueue = [];
let speechIndex = 0;

function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  return voices.find(v => v.lang === lang)
    || voices.find(v => v.lang && v.lang.startsWith(lang.slice(0, 2)))
    || voices[0];
}

function speak(text) {
  if (!voiceMode) return;
  if (!window.speechSynthesis) {
    resumeListeningAfterSpeech();
    return;
  }
  const clean = cleanForSpeech(text);
  speechQueue = splitSentences(clean);
  speechIndex = 0;
  if (!speechQueue.length) {
    resumeListeningAfterSpeech();
    return;
  }
  speakNextChunk();
}

function speakNextChunk() {
  if (!voiceMode) {
    stopSpeechWatchdog();
    return;
  }
  if (speechIndex >= speechQueue.length) {
    stopSpeechWatchdog();
    resumeListeningAfterSpeech();
    return;
  }

  const chunk = speechQueue[speechIndex++];
  const utter = new SpeechSynthesisUtterance(chunk);
  utter.lang = voiceLang.value;
  utter.rate = 1.0;
  utter.pitch = 1.05;
  const voice = pickVoice(utter.lang);
  if (voice) utter.voice = voice;

  stopSpeechWatchdog();
  speechSynthesis.cancel();
  setVoiceStatus('Speaking…', true);

  utter.onend = () => { speakNextChunk(); };
  utter.onerror = () => { speakNextChunk(); };

  setTimeout(() => {
    if (!voiceMode) return;
    try {
      speechSynthesis.speak(utter);
      speechSynthesis.resume();
    } catch (e) {
      speakNextChunk();
    }
  }, 60);

  speechWatchdog = setInterval(() => {
    if (!speechSynthesis.speaking && !speechSynthesis.pending) {
      stopSpeechWatchdog();
      speakNextChunk();
    }
  }, 400);
}

function resumeListeningAfterSpeech() {
  if (pendingSpeech.length) {
    const text = pendingSpeech.shift();
    inputEl.value = text;
    send();
    return;
  }
  if (voiceMode && !isStreaming) {
    startListening();
  } else if (voiceMode) {
    setVoiceStatus('Re-listening…');
  }
}

function rescheduleVoice() {
  setTimeout(() => {
    resumeListeningAfterSpeech();
  }, 200);
}

function initVoice() {
  voiceLang.value = localStorage.getItem('guruji_voiceLang') || 'en-IN';
  if (localStorage.getItem('guruji_voice') === '1') {
    voiceToggle.checked = true;
    voiceMode = true;
  }
  if (!SR) setVoiceStatus('Voice not supported in this browser');
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;
  const originalInput = inputEl.value;

  if (!currentConvId) newChat();
  const conv = getCurrentConv();

  if (!conv.title) {
    conv.title = text.slice(0, 40) + (text.length > 40 ? '...' : '');
    renderConversations();
  }

  appendMessage('user', text);
  conv.messages.push({ role: 'user', content: text });
  saveConversations();

  inputEl.value = '';
  autoResize();
  isStreaming = true;
  sendBtn.disabled = true;

  const typingEl = appendTyping();
  const bodyEl = typingEl.querySelector('.message-body');

  try {
    const clientConfig = loadClientConfig();
    clientConfig.memory = compileMemory();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conv.messages, config: clientConfig })
    });

    if (!res.ok) {
      const err = await res.json();
      bodyEl.innerHTML = `<p style="color: #ef4444">${err.error || 'Something went wrong'}</p>`;
      if (!inputEl.value.trim()) inputEl.value = originalInput;
      typingEl.removeAttribute('id');
      isStreaming = false;
      sendBtn.disabled = false;
      if (voiceMode) rescheduleVoice();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              full += parsed.content;
              bodyEl.innerHTML = formatMarkdown(full);
              scrollToBottom();
            }
          } catch (e) {}
        }
      }
    }

    conv.messages.push({ role: 'assistant', content: full });
    saveConversations();
    updateMemory(text, full);
    speak(full);
  } catch (err) {
    bodyEl.innerHTML = `<p style="color: #ef4444">Network error: ${err.message}</p>`;
    if (voiceMode) rescheduleVoice();
  }

  typingEl.removeAttribute('id');
  isStreaming = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

renderConversations();
initVoice();
inputEl.focus();