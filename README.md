# 🎯 AI Coding Assistant - Conversational AI Demo

A powerful Next.js application featuring real-time voice interaction with an AI coding assistant powered by Agora Conversational AI. Talk to the AI and watch it generate HTML/CSS/JS code that renders live in your browser!

Built for **LA Tech Week** by [ConvoAI](https://convoai.world) × [Agora](https://www.agora.io)

> **🌐 PUBLIC LIVE DEMO**
> 
> This is designed as a **public live demo** where visitors enter their own API credentials through the UI. Credentials are stored only in the browser's localStorage and **never sent to or stored on your backend servers**. Each user brings their own Agora, OpenAI, and Azure credentials.

## ✨ Features

- 🎤 **Voice Interaction**: Natural voice conversations with AI using Agora RTC
- 💻 **Live Code Generation**: AI-generated code appears in real-time
- 🖼️ **Sandboxed Preview**: Code renders safely in an isolated iframe
- 🔄 **Source/Preview Toggle**: Switch between rendered preview and raw HTML source
- 📝 **Live Transcript**: See the full conversation history with timestamps
- 🔇 **Mic Control**: Mute/unmute microphone with visual feedback
- 📦 **Code Download**: Export generated code as a .zip file
- 🔗 **Share Code**: Create shareable links via dpaste.org (365-day expiry)
- 🎨 **Modern UI**: Beautiful gradient design with responsive layout
- 🚀 **Smart Loading**: Context-aware "Generating code..." indicator
- 🌐 **Auto Images**: Uses Picsum Photos for all image generation

## 🎬 How It Works

1. **Start Session**: Click the gradient "Start Session" button to connect
2. **Talk Naturally**: Your microphone activates automatically - just start talking
3. **Watch Magic Happen**: The AI responds with voice and generates code live
4. **See Results**: Code renders instantly in the preview pane
5. **Explore**: Toggle to source view, download as .zip, or keep chatting

### Code Format

The AI wraps code in **Chinese square brackets** `【】` to separate it from spoken text:

```
Here's a beautiful button 【<!DOCTYPE html><html>...</html>】 that you can interact with.
```

- Text outside `【】` is spoken by the AI's voice
- Code inside `【】` is rendered visually in the preview pane
- The TTS automatically skips the code blocks

## 🚀 Quick Start

### For Users (Visiting the Live Demo)

1. **Visit the deployed site**
2. **Click the "Settings" button** in the top-right corner
3. **Enter your own API credentials:**
   - Agora credentials (App ID, Certificate, Customer ID/Secret, Bot UID)
   - OpenAI API key (for LLM)
   - Azure TTS API key and region (for text-to-speech)
4. **Click "Save Credentials"** - they're stored locally in your browser
5. **Click "Start Session"** and start talking!

> 🔒 **Privacy**: Your credentials are stored only in your browser's localStorage and sent directly to the respective APIs (Agora, OpenAI, Azure). They are **never** sent to or stored on the demo's backend servers.

### For Developers (Deploying Your Own)

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Build and Deploy

```bash
npm run build
npm start
```

Or deploy to Vercel, Netlify, or any Next.js-compatible platform.

#### 3. (Optional) Set Default/Fallback Credentials

If you want to provide fallback credentials for development or testing, create a `.env.local` file:

```bash
cp .env.example .env.local
```

Then fill in the values. These will be used as fallbacks when users haven't configured their own credentials yet.

**Note:** For a public live demo, you typically **don't** need environment variables - users provide their own credentials through the UI!

### Where Users Get Their Credentials

When visitors use your live demo, they need to obtain their own credentials from:

**1. Agora Credentials** → [console.agora.io](https://console.agora.io/)
  - App ID & Certificate (from Project Settings)
  - Customer ID & Secret (from RESTful API section)
  - Bot UID (any unique number, e.g., 1001)

**2. OpenAI API Key** → [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  - Requires GPT-4o access

**3. Azure TTS** → [portal.azure.com](https://portal.azure.com)
  - Create Speech Services resource
  - Get API key and region

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS with custom gradients
- **Icons**: Lucide React (professional icon library)
- **Real-time Communication**: Agora RTC SDK 4.x
- **Real-time Messaging**: Agora RTM SDK 2.x
- **AI Integration**: Agora Conversational AI (GPT-4o + Azure TTS)
- **File Export**: JSZip for client-side .zip generation

### Project Structure

```
la_tech_week/
├── app/
│   ├── api/
│   │   ├── token/route.ts          # Dynamic RTC token generation
│   │   ├── start-agent/route.ts    # Start Conversational AI agent
│   │   ├── leave-agent/route.ts    # Clean up agent on disconnect
│   │   ├── share/route.ts          # Create shareable dpaste.org links
│   │   └── paste/[id]/route.ts     # Fetch shared code content
│   ├── components/
│   │   ├── SettingsModal.tsx       # User credentials input modal
│   │   └── CodeHighlight.tsx       # Shiki-powered code viewer
│   ├── view/[gistId]/page.tsx      # Shared code viewer page
│   ├── page.tsx                    # Main UI component
│   ├── layout.tsx                  # Root layout with metadata
│   └── globals.css                 # Global styles
├── lib/
│   └── agora-client.ts             # Agora RTC/RTM wrapper class
├── .env.local                      # Environment variables (create this)
└── package.json                    # Dependencies
```

### Key Components

#### `app/page.tsx`

Main UI component with:

- Voice interaction controls (mic, mute, disconnect)
- Live code preview with iframe sandbox
- Source code viewer with syntax highlighting
- Transcript panel with auto-scroll
- Smart loading indicators

#### `lib/agora-client.ts`

Agora client wrapper featuring:

- RTC audio streaming
- RTM messaging for transcription
- Microphone control (mute/unmute)
- Clean disconnect logic

#### API Routes

- **`/api/token`**: Generates RTC tokens server-side for security
- **`/api/start-agent`**: Initializes Conversational AI agent with custom prompt
- **`/api/leave-agent`**: Properly shuts down the AI agent

### Connection Flow

```
1. User clicks "Start Session"
   ↓
2. Generate random channel name (e.g., "agora-ai-abc123xyz")
   ↓
3. Request RTC token from /api/token
   ↓
4. Start Conversational AI agent via /api/start-agent
   ↓
5. Initialize Agora RTC client + join channel
   ↓
6. Subscribe to RTM transcription messages
   ↓
7. Auto-activate microphone
   ↓
8. User talks → AI responds with voice + code
```

### Disconnect Flow

```
1. User clicks "End" button
   ↓
2. Call /api/leave-agent to stop AI agent
   ↓
3. Disconnect Agora RTC/RTM client
   ↓
4. Reset all state (transcript, code, UI)
   ↓
5. Ready for new session
```

## 🎨 UI Features

### Header

- **ConvoAI Logo** + **Agora Logo** branding
- Responsive layout (mobile-friendly)
- Gradient "Start Session" button
- Connection status indicator

### Control Buttons

- **Mic Button**: Circular with 🎤/🔇 Lucide icons, green/red states, animated pulse
- **End Button**: Pill-shaped with exit icon, smooth hover effects

### Preview Panel

- **Toggle View**: Switch between rendered preview and source code
- **Download**: Export code as .zip file with single click
- **Smart Loading**: "Generating code..." only shows when relevant
- **Dark Empty State**: Professional look before code loads

### Transcript Panel

- **Auto-scroll**: New messages scroll smoothly into view
- **Internal Scrolling**: Won't affect the main page
- **Timestamp**: Each message shows when it was sent
- **Speaker Labels**: Clear "You" vs "AI" distinction

## 🔒 Security & Privacy

- **Client-side Only**: User credentials are stored in browser localStorage only
- **No Backend Storage**: Credentials are **never** sent to or stored on your servers
- **Direct API Calls**: The backend acts as a pass-through proxy, forwarding credentials directly to Agora/OpenAI/Azure APIs
- **Sandboxed Iframe**: Generated code runs isolated with `sandbox="allow-scripts"`
- **No DOM Access**: Generated code can't access parent page
- **Content Security**: XSS prevention through iframe isolation
- **User Control**: Users can clear their credentials anytime by clearing browser data

### How It Works

1. User enters credentials in Settings modal
2. Credentials saved to `localStorage` in browser
3. When starting a session, credentials are sent from browser → your API routes → respective APIs (Agora/OpenAI/Azure)
4. Your backend **never stores** these credentials - they're only used to forward API requests
5. All sessions are ephemeral and don't persist user data

## 🧪 Development Tips

### Testing Locally

```bash
# Install dependencies
npm install

# Run dev server with hot reload
npm run dev

# Build for production
npm run build

# Test production build
npm start
```

### Debugging

- **Browser Console**: Check for RTC/RTM connection logs
- **Server Logs**: Watch terminal for API route responses
- **Network Tab**: Monitor token generation and agent API calls

### Code Generation Tips

Ask the AI to:

- "Create a todo list app"
- "Build a calculator with gradient buttons"
- "Make a responsive card layout with images"
- "Design a landing page hero section"
- "Build a Tetris game"

The AI will use https://picsum.photos/ for all images automatically!

## 🐛 Troubleshooting

### "Please configure your credentials in Settings first"

✅ Click the "Settings" button in the top-right corner
✅ Fill in ALL required fields in the settings modal
✅ Make sure there are no empty values
✅ Click "Save Credentials"

### "Missing Agora credentials" or "Missing LLM/TTS credentials"

✅ Open Settings and verify all credentials are entered correctly
✅ Check that your Agora App ID and Certificate match your project
✅ Verify your OpenAI API key is valid and has GPT-4o access
✅ Ensure your Azure TTS region matches where you created the resource

### Microphone not working

✅ Allow microphone permissions in browser settings
✅ Check that no other app is using the microphone

### No audio from agent

✅ Verify `NEXT_PUBLIC_AGORA_BOT_UID` matches your agent configuration
✅ Check browser audio isn't muted

### Connection fails

✅ Verify App ID and Certificate are correct
✅ Check that tokens aren't expired (1 hour validity)
✅ Ensure API Key/Secret are valid for Conversational AI

### Code not rendering

✅ AI must wrap code in Chinese brackets: `【<!DOCTYPE html>...】`
✅ Check browser console for parsing errors
✅ Verify TTS skip_patterns is set to `[2]` in start-agent route

### Agent not disconnecting properly

✅ Check that `/api/leave-agent` route exists
✅ Verify `agentId` is being stored and passed correctly
✅ See server logs for API call status

## 📚 Documentation

- **`ENV_SETUP.md`**: Detailed environment variable setup
- **`AGORA_API_SETUP.md`**: Agora API configuration guide
- **`API_FEATURES.md`**: API features and capabilities
- **`TRANSCRIPTION_SETUP.md`**: Transcription implementation details

## 🎯 Key Features Explained

### Chinese Square Brackets `【】`

We use Chinese square brackets instead of regular parentheses/brackets because:

- ✅ TTS skip pattern `[2]` specifically handles these
- ✅ Won't conflict with JavaScript array syntax `[]`
- ✅ Won't conflict with function calls `()`
- ✅ More reliable than markdown code fences
- ✅ Clear visual separation in transcript

### Smart Loading Indicator

The "Generating code..." spinner only shows when:

- User says code-related keywords (create, build, make, generate, etc.)
- Not shown during greeting or casual conversation
- Auto-hides after 5 seconds if no code appears

### Zip Download

Instead of downloading raw `.html`, we:

- Create a `.zip` file client-side with JSZip
- Name it with timestamp: `generated-code-[timestamp].zip`
- Include the full HTML file inside
- Trigger browser download automatically

### Mute Control

The mic button:

- Uses Agora SDK's `setEnabled()` method
- Shows proper mic icons from Lucide React
- Green when active, red when muted
- Animated pulse dot when transmitting
- Doesn't disconnect, just stops audio

## 🚢 Deployment

### Quick Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/your-repo)

```bash
npm run build
vercel deploy
```

### Other Platforms

**Netlify / Cloudflare Pages / AWS Amplify:**

Build command: `npm run build`  
Output directory: `.next`

### Environment Variables (Optional)

For a public live demo, you typically **don't need** environment variables since users provide their own credentials through the UI.

However, if you want to provide fallback/default credentials for development or testing:

- Vercel: Project Settings → Environment Variables
- Netlify: Site Settings → Build & Deploy → Environment
- AWS/GCP: Use secrets manager

Then add the variables from `.env.example` (see ENV_SETUP.md for details).

### Post-Deployment

After deploying:

1. Visit your deployed URL
2. Click "Settings" to configure your own credentials
3. Test the demo by starting a session
4. Share the URL with others - they'll each need to configure their own credentials

## 📝 License

MIT License - feel free to use this for your own projects!

## 🤝 Contributing

Built with ❤️ for LA Tech Week

**Powered by:**

- [ConvoAI](https://convoai.world) - Conversational AI platform
- [Agora](https://www.agora.io) - Real-time engagement platform

---

**Questions?** Check the documentation files or open an issue!

**Demo:** Try it live and ask the AI to build anything you can imagine! 🚀
