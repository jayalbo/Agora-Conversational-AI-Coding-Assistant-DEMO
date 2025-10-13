# Environment Variables Setup

Create a `.env.local` file in the project root with the following variables:

```env
# Agora App Credentials
NEXT_PUBLIC_AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_app_certificate

# Agora RESTful API Credentials (for starting the AI agent)
AGORA_CUSTOMER_ID=your_customer_id
AGORA_CUSTOMER_SECRET=your_customer_secret

# Bot Configuration
NEXT_PUBLIC_AGORA_BOT_UID=your_bot_uid

# LLM Configuration (OpenAI or compatible)
LLM_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_openai_api_key

# TTS Configuration (Microsoft Azure)
TTS_API_KEY=your_azure_tts_api_key

# Optional: Use a static token instead of dynamic generation
# NEXT_PUBLIC_AGORA_TOKEN=your_rtc_token
```

## Required Variables

### App Configuration

- **NEXT_PUBLIC_AGORA_APP_ID**: Your Agora App ID from the console
- **AGORA_APP_CERTIFICATE**: Your App Certificate (keep this server-side only, for token generation)

### RESTful API Credentials

- **AGORA_CUSTOMER_ID**: Customer ID from Agora Console (for REST API authentication)
- **AGORA_CUSTOMER_SECRET**: Customer Secret from Agora Console (keep this server-side only)

### Bot Configuration

- **NEXT_PUBLIC_AGORA_BOT_UID**: Numeric UID for the conversational AI bot (e.g., 123456)

## Optional Variables

- **NEXT_PUBLIC_AGORA_TOKEN**: Pre-generated static token (if you want to skip dynamic generation)

## How to Get These Values

1. Go to [Agora Console](https://console.agora.io/)
2. Select your project
3. **App ID & Certificate**: Found in Project Settings
4. **Customer ID & Secret**: Found in RESTful API section → Add a secret
5. **Bot UID**: Choose any numeric UID for your bot (must be unique in the channel)
6. **LLM**: Get API key from [OpenAI](https://platform.openai.com/api-keys) or your LLM provider
7. **TTS**: Get API key from [Azure Cognitive Services](https://portal.azure.com)

## Notes

- Channel names are automatically generated with random IDs (e.g., `agora-ai-abc123xyz`)
- No need to set `NEXT_PUBLIC_AGORA_CHANNEL` - it's dynamic!
- Tokens are generated automatically when you connect (1-hour expiration)
