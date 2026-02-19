# Viralizator

A self-hosted SaaS app that monitors Instagram accounts, detects viral posts, translates them to Hebrew, generates branded carousels, and auto-publishes to destination Instagram accounts.

## Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TypeScript
- **Database**: SQLite via Drizzle ORM
- **Job Queue**: BullMQ + Redis (in-memory fallback for dev)
- **Real-time**: Server-Sent Events (SSE)

## External APIs

| Service | Purpose |
|---------|---------|
| Apify | Instagram post scraping |
| OpenAI GPT-4o | Hebrew translation + topic routing |
| Google Gemini (Nano Banana Pro) | Carousel image generation |
| Meta Graph API v22 | Publishing to Instagram |

## Setup

```bash
# Install dependencies
npm install

# Push database schema
npx drizzle-kit push

# Start backend (port 3000)
npx tsx server/index.ts

# Start frontend dev server (port 5173, proxies API to 3000)
npx vite --config client/vite.config.ts
```

## Configuration

Open the dashboard at `http://localhost:5173` → **Settings** and enter:

- `apify_token` — your Apify API token
- `openai_api_key` — your OpenAI API key
- `gemini_api_key` — your Google AI Studio API key
- `global_virality_threshold` — multiplier above baseline to flag viral (default: 3.0)
- `public_base_url` — publicly accessible URL of your server (required for Meta publishing)

## Pipeline

```
Add Source Channel → Execute Scrape → Viral Detection → Topic Routing
→ Hebrew Translation → Carousel Generation → Publish to Instagram
```

Each step runs as a background job. The dashboard shows real-time progress via SSE.
