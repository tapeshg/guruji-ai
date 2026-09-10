const express = require('express');
const path = require('path');
const { DEFAULT_CONFIG, loadConfig, saveConfig, buildSystemPrompt } = require('./api/config-lib');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  const safe = { ...config };
  if (safe.apiKey) safe.apiKey = safe.apiKey.slice(0, 8) + '...' + safe.apiKey.slice(-4);
  res.json(safe);
});

app.post('/api/config', (req, res) => {
  const current = loadConfig();
  const updated = { ...current, ...req.body };
  saveConfig(updated);
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  const serverConfig = loadConfig();
  const { messages, config: clientConfig } = req.body || {};
  const config = { ...serverConfig, ...(clientConfig || {}) };

  if (!config.apiKey) {
    return res.status(400).json({ error: 'API key not configured. Set it in the admin panel.' });
  }

  const systemMsg = { role: 'system', content: buildSystemPrompt(config) };
  const allMessages = [systemMsg, ...(messages || [])];

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: allMessages,
        max_tokens: parseInt(config.maxTokens, 10) || 2048,
        temperature: parseFloat(config.temperature) || 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
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
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
          } else {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }
    }

    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Guruji running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});