let conversations = JSON.parse(localStorage.getItem('guruji_conversations') || '[]');
let currentConvId = null;
let isStreaming = false;

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

async function send() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;

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
    const clientConfig = JSON.parse(localStorage.getItem('guruji_config') || '{}');
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conv.messages, config: clientConfig })
    });

    if (!res.ok) {
      const err = await res.json();
      bodyEl.innerHTML = `<p style="color: #ef4444">${err.error || 'Something went wrong'}</p>`;
      isStreaming = false;
      sendBtn.disabled = false;
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
  } catch (err) {
    bodyEl.innerHTML = `<p style="color: #ef4444">Network error: ${err.message}</p>`;
  }

  typingEl.removeAttribute('id');
  isStreaming = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

renderConversations();
inputEl.focus();