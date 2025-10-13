# Real-Time Transcription Setup

This document explains how real-time transcriptions are implemented using Agora RTM.

## How It Works

Based on the [official Agora documentation](https://docs.agora.io/en/conversational-ai/develop/subtitles), transcriptions are delivered through RTM (Real-Time Messaging) channel messages.

### Implementation Steps

1. **RTM Client Initialization**

   - Created RTM client alongside RTC client
   - Uses the same App ID, UID, and token
   - Subscribes to the channel for messages

2. **Enable RTM in Agent Configuration**

   ```json
   {
     "advanced_features": {
       "enable_rtm": true
     },
     "parameters": {
       "data_channel": "rtm"
     }
   }
   ```

3. **Listen for Transcription Messages**

   - RTM sends transcription data via channel messages
   - Messages are parsed to extract user and agent text
   - Transcriptions update in real-time as the AI speaks

4. **Auto-Render Code Blocks**
   - Agent responses are parsed for code in parentheses `()`
   - Code is automatically extracted and rendered in iframe
   - No manual button click needed!

## Message Format

RTM messages contain transcription data like:

```json
{
  "type": "transcription",
  "uid": "123456",
  "text": "Here's a button (<!DOCTYPE html>...)",
  "is_final": true
}
```

## Code Flow

1. **User speaks** → ASR transcribes
2. **LLM processes** → Generates response with code in `()`
3. **TTS skips** → Code not spoken (skip_patterns: [3])
4. **RTM delivers** → Full transcript sent to client
5. **Parser extracts** → Code blocks extracted from `()`
6. **Iframe renders** → Code shown in preview pane

## Key Features

- ✅ Real-time transcriptions via RTM
- ✅ Auto-extraction of code blocks
- ✅ Auto-rendering in iframe
- ✅ No placeholder buttons
- ✅ Seamless user experience

## Files Modified

- `lib/agora-client.ts`: Added RTM client and transcription handling
- `app/page.tsx`: Integrated transcription callback and auto-rendering
- `app/api/start-agent/route.ts`: Enabled RTM in agent configuration

## Testing

1. Connect to Agora (mic auto-activates)
2. Say: "Create a colorful button"
3. Watch transcript update in real-time
4. See code render automatically in preview pane

The AI's response will include code in parentheses, which is:

- Skipped by TTS (not spoken)
- Sent via RTM (to your app)
- Parsed and rendered (automatically)
