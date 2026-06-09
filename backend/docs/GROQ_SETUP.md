# Groq LLM Integration for Copilot

This document describes how to set up and use Groq API for the ABM Engine Copilot.

## Setup Instructions

### 1. Install the Groq Python Package

```bash
pip install groq
```

### 2. Get a Groq API Key

1. Visit [Groq Console](https://console.groq.com)
2. Sign up or log in
3. Create a new API key
4. Copy the API key

### 3. Set the Environment Variable

**For development (Windows PowerShell):**
```powershell
$env:GROQ_API_KEY="your-api-key-here"
```

**For development (Linux/macOS bash):**
```bash
export GROQ_API_KEY="your-api-key-here"
```

**For production, add to your `.env` file:**
```
GROQ_API_KEY=your-api-key-here
```

### 4. Restart Your Backend Server

```bash
# Stop the current server (Ctrl+C)
# Restart with:
python -m uvicorn backend.main:app --reload
```

## How It Works

1. **Frontend Copilot** → sends message to `/api/copilot/message`
2. **Backend** → calls Groq API with context (account count, sequence count, etc.)
3. **Groq LLM** → processes the request and returns response
4. **Frontend** → displays the response with trace steps

## Endpoints

### GET `/api/copilot/context`
Returns Copilot initialization data.

### POST `/api/copilot/message`
Send a user message and get an LLM response.

**Request:**
```json
{
  "message": "Find high-intent accounts in SaaS",
  "context": {}
}
```

**Response:**
```json
{
  "text": "I'll help you discover high-intent SaaS accounts...",
  "trace": [
    {"text": "Parsing intent: Find high-intent accounts in SaaS", "done": true},
    {"text": "Querying account graph", "done": true},
    {"text": "Generating response", "done": true}
  ]
}
```

## Models Available

Groq supports several fast models:
- `mixtral-8x7b-32768` (default) - Fast and capable
- `llama-2-70b-4096` - Larger model
- `gemma-7b-it` - Lightweight model

## Troubleshooting

**Error: "GROQ_API_KEY environment variable not set"**
- Make sure you've set the environment variable and restarted the server
- Check with: `echo $GROQ_API_KEY` (Linux/macOS) or `echo $env:GROQ_API_KEY` (PowerShell)

**Error: "groq package not installed"**
- Run: `pip install groq`

**Slow responses:**
- Groq is very fast, but network latency may apply
- Default timeout is 30 seconds
- Consider using a smaller model if needed

## Cost

Groq API is free for reasonable usage. Check their documentation for rate limits.
