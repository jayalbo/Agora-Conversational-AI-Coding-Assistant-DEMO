# Agora Conversational AI Features Used

This document explains the key features from the Agora Conversational AI API that make this demo work.

## TTS Skip Patterns - The Magic Behind Code Rendering

The most important feature for this demo is `skip_patterns` in the TTS configuration.

### What are skip_patterns?

From the [official documentation](https://docs.agora.io/en/conversational-ai/rest-api/join):

> Controls whether the TTS module skips bracketed content when reading LLM response text. This prevents the agent from vocalizing structural prompt information like tone indicators, action descriptions, and system prompts.

### Available Skip Patterns

- `1`: Skip content in Chinese parentheses `（）`
- `2`: Skip content in Chinese square brackets `【】`
- `3`: **Skip content in parentheses `( )` ← WE USE THIS!**
- `4`: Skip content in square brackets `[ ]`
- `5`: Skip content in curly braces `{ }`

### How We Use It

We configure `skip_patterns: [3]` which tells the AI:

- **Speak normally** for regular text
- **Skip TTS** for anything in parentheses `()`
- **Keep in memory** - the agent still remembers the full text

### Example Conversation

**User:** "Create a red button"

**AI Response:**

```
Here's a red button for you. (<!DOCTYPE html>
<html>
<body>
  <button style="background: red; color: white; padding: 20px;">
    Click Me
  </button>
</body>
</html>) This button is styled with inline CSS.
```

**What the user hears:**

> "Here's a red button for you. This button is styled with inline CSS."

**What the frontend receives:**

- Spoken text: "Here's a red button for you. This button is styled with inline CSS."
- Code block: The HTML inside the parentheses
- The code is extracted and rendered in the iframe!

## Other Key Features

### 1. Intelligent Interruption (AIVAD)

```json
"advanced_features": {
  "enable_aivad": true
}
```

Allows users to interrupt the AI naturally, just like in human conversation.

### 2. Voice Activity Detection (VAD)

```json
"vad": {
  "mode": "interrupt",
  "interrupt_duration_ms": 160,
  "silence_duration_ms": 640
}
```

Detects when the user starts/stops speaking with configurable sensitivity.

### 3. Subscribe to All Users

```json
"remote_rtc_uids": ["*"]
```

The agent subscribes to all users in the channel, making it easy for anyone to talk to it.

### 4. System Messages

```json
"system_messages": [
  {
    "role": "system",
    "content": "You are a helpful AI coding assistant. When generating HTML/CSS/JS code, wrap it in parentheses like (code here)..."
  }
]
```

Instructs the LLM to wrap code in parentheses so it can be extracted.

## Why This Works Perfectly

1. **LLM generates code** wrapped in parentheses based on system prompt
2. **TTS skips** the code (skip_patterns: [3]) so it's not spoken
3. **Frontend receives** the full transcript with code intact
4. **Parser extracts** code from parentheses using regex
5. **Iframe renders** the code in real-time

The user gets a smooth experience where the AI describes what it's creating while the code appears visually!

## Response Structure

When the agent is started, Agora returns:

```json
{
  "agent_id": "1NT29X10YHxxxxxWJOXLYHNYB",
  "create_ts": 1737111452,
  "status": "RUNNING"
}
```

Status values:

- `IDLE`: Agent is idle
- `STARTING`: Agent is being started
- `RUNNING`: Agent is active and in the channel
- `STOPPING`: Agent is shutting down
- `STOPPED`: Agent has exited
- `RECOVERING`: Agent is recovering from an error
- `FAILED`: Agent failed to execute

## Links

- [Official API Documentation](https://docs.agora.io/en/conversational-ai/rest-api/join)
- [TTS Skip Patterns Details](https://docs.agora.io/en/conversational-ai/rest-api/join#skip_patterns)
- [Agora Console](https://console.agora.io/)
