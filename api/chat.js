const { DEFAULT_CONFIG, loadConfig, buildSystemPrompt } = require('./config-lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const serverConfig = loadConfig();
  const { messages, config: clientConfig } = req.body || {};

  const config = { ...serverConfig, ...(clientConfig || {}) };

  const apiKey = config.apiKey;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key not configured. Set it in the admin panel.' });
  }

  const systemMsg = { role: 'system', content: buildSystemPrompt(config) };
  const allMessages = [systemMsg, ...(messages || [])];

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: allMessages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
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
};