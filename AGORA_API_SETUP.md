# Agora Conversational AI API Setup

This document explains how the app integrates with Agora Conversational AI.

## API Integration Flow

### 1. Token Generation (`/api/token`)

- Generates RTC tokens for both the user and bot
- Uses App ID and App Certificate
- Tokens are valid for 1 hour

### 2. Agent Start (`/api/start-agent`)

- Triggers the Conversational AI agent to join the channel
- Uses RESTful API credentials (Customer ID & Secret)
- Sends the bot UID and token to Agora

### 3. Client Connection

- User joins the channel with their UID and token
- Bot joins with its UID and token
- Audio streams between user and AI agent

## Required API Credentials

### From Agora Console → Project Settings

- `NEXT_PUBLIC_AGORA_APP_ID`: Your project's App ID
- `AGORA_APP_CERTIFICATE`: Enable and copy the certificate

### From Agora Console → RESTful API

- `AGORA_CUSTOMER_ID`: Your customer/account ID
- `AGORA_CUSTOMER_SECRET`: Your API secret (download once)

### Bot Configuration

- `NEXT_PUBLIC_AGORA_BOT_UID`: Choose a numeric UID for your bot (e.g., 123456)

## API Endpoint

The start-agent endpoint uses the official Agora Conversational AI v2 API:

```
POST https://api.agora.io/api/conversational-ai-agent/v2/projects/{appid}/join
```

**Documentation:** [https://docs.agora.io/en/conversational-ai/rest-api/join](https://docs.agora.io/en/conversational-ai/rest-api/join)

## Authentication

All REST API calls use HTTP Basic Authentication:

```
Authorization: Basic {base64(customerId:customerSecret)}
```

## Request Body Format

The API uses the following structure (per [official docs](https://docs.agora.io/en/conversational-ai/rest-api/join)):

```json
{
  "name": "unique_agent_name",
  "properties": {
    "channel": "agora-ai-abc123xyz",
    "token": "generated_rtc_token",
    "agent_rtc_uid": "123456",
    "remote_rtc_uids": ["*"],
    "idle_timeout": 120,
    "advanced_features": {
      "enable_aivad": true
    },
    "asr": {
      "language": "en-US",
      "vendor": "ares",
      "params": {}
    },
    "tts": {
      "vendor": "microsoft",
      "params": {
        "key": "your_tts_key",
        "region": "eastus",
        "voice_name": "en-US-AndrewMultilingualNeural"
      },
      "skip_patterns": [3]
    },
    "llm": {
      "url": "https://api.openai.com/v1/chat/completions",
      "api_key": "your_llm_key",
      "system_messages": [
        {
          "role": "system",
          "content": "You are a helpful assistant."
        }
      ],
      "params": {
        "model": "gpt-4o-mini"
      }
    },
    "vad": {
      "mode": "interrupt"
    }
  }
}
```

### Key Features Used

- **`skip_patterns: [3]`**: Skips content in parentheses `()` - perfect for code blocks!
- **`remote_rtc_uids: ["*"]`**: Subscribes to all users in the channel
- **`enable_aivad: true`**: Enables intelligent interruption handling

## Troubleshooting

### 401 Unauthorized

- Check that Customer ID and Secret are correct
- Ensure credentials are properly Base64 encoded

### 404 Not Found

- Ensure you're using the v2 API endpoint: `/api/conversational-ai-agent/v2/projects/{appid}/join`
- Check that Conversational AI is enabled in your Agora project

### 403 Forbidden

- Ensure Conversational AI is enabled in your Agora Console
- Verify your account has the necessary permissions

### Bot doesn't join the channel

- Check that the bot UID matches what's configured
- Ensure the bot token is valid and not expired
- Verify the channel name is correct

## Testing

You can test the API endpoints independently:

### Test Token Generation

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/json" \
  -d '{"channelName":"test-channel","uid":12345}'
```

### Test Agent Start

```bash
curl -X POST http://localhost:3000/api/start-agent \
  -H "Content-Type: application/json" \
  -d '{"channelName":"test-channel","uid":12345}'
```

## Additional Resources

- [Agora Console](https://console.agora.io/)
- [Agora Conversational AI Documentation](https://docs.agora.io/en/conversational-ai/)
- [Agora RESTful API Authentication](https://docs.agora.io/en/conversational-ai/rest-api/restful-authentication)
