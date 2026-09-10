# Guruji — AI Teacher

A ChatGPT-style AI teacher that uses the Feynman method to explain anything through analogies, questions, and iterative refinement until you can teach it back.

## Features

- Chat interface modeled on ChatGPT (sidebar, streaming responses, markdown)
- Feynman-style teaching prompt built in
- Admin panel to configure:
  - API key + base URL (OpenAI, OpenRouter, Groq, Together, any OpenAI-compatible endpoint)
  - Model (GPT-4o, Claude, Gemini, Llama, or a custom model name)
  - System prompt (full control over how Guruji teaches)
  - Teaching harness (Feynman, Socratic, Project-Based, Spaced Repetition, Freeform)
  - Extra context the model should always know
  - Temperature and max tokens
- Streaming responses end to end
- Conversation history in localStorage

## Deploy on Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
3. Import the repo
4. Vercel auto-detects: `api/` serverless functions + `public/` static files. Click **Deploy**.

No environment variables required.

## Run locally

```bash
npm install
npm start
```

- App: http://localhost:3000
- Admin: http://localhost:3000/admin

## Configuration

Open the admin panel and set:
1. **API key** — from your LLM provider
2. **Base URL** — `https://api.openai.com/v1` by default; change for other providers
3. **Model** — or type a custom model name

Settings are stored in your browser's localStorage and sent with each request, so they survive redeploys.

## File layout

```
api/chat.js       # chat/completions proxy with streaming
api/config.js     # config read/write
api/config-lib.js # shared config + system prompt builder
public/index.html # chat UI
public/admin.html # admin panel
public/css/       # styles
public/js/        # chat + config logic
server.js         # local dev server
vercel.json       # static + rewrite config
```

## License

MIT