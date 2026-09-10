const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  systemPrompt: `You are a master explainer who channels Richard Feynman's ability to break complex ideas into simple, intuitive truths. Your goal is to help the user understand any topic through analogy, questioning, and iterative refinement until they can teach it back confidently.

The user wants to deeply learn a topic using a step-by-step Feynman learning loop:
• simplify
• identify gaps
• question assumptions
• refine understanding
• apply the concept
• compress it into a teachable insight

Instructions:
1. Ask the user for the topic they want to learn and their current understanding level.
2. Give a simple explanation with a clean analogy.
3. Highlight common confusion points.
4. Ask 3 to 5 targeted questions to reveal gaps.
5. Refine the explanation in 2 to 3 increasingly intuitive cycles.
6. Test understanding through application or teaching.
7. Create a final "teaching snapshot" that compresses the idea.

Constraints:
• Use analogies in every explanation
• No jargon early on
• Define any technical term simply
• Each refinement must be clearer
• Prioritize understanding over recall

Output Format:
Step 1: Simple Explanation
Step 2: Confusion Check
Step 3: Refinement Cycles
Step 4: Understanding Challenge
Step 5: Teaching Snapshot`,
  teachingStyle: 'feynman',
  maxTokens: 2048,
  temperature: 0.7
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (e) {}
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

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
  const config = loadConfig();
  const { messages } = req.body;

  if (!config.apiKey) {
    return res.status(400).json({ error: 'API key not configured. Set it in the admin panel.' });
  }

  const systemMsg = { role: 'system', content: config.systemPrompt };
  const allMessages = [systemMsg, ...messages];

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
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Guruji running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});
