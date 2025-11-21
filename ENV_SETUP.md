# Environment Variables Setup

> **⚠️ IMPORTANT: This is a PUBLIC DEMO**
> 
> You **MUST** set your own credentials. Do NOT use shared or demo credentials from any documentation or examples.

## Quick Setup

### Step 1: Copy the example file

```bash
cp .env.example .env.local
```

### Step 2: Fill in your credentials

Open `.env.local` and replace all placeholder values with your actual credentials. The file should look like this (with YOUR values):

```env
# Agora App Credentials
NEXT_PUBLIC_AGORA_APP_ID=your_actual_app_id_here
AGORA_APP_CERTIFICATE=your_actual_certificate_here

# Agora RESTful API Credentials
AGORA_CUSTOMER_ID=your_actual_customer_id_here
AGORA_CUSTOMER_SECRET=your_actual_customer_secret_here

# Bot Configuration
NEXT_PUBLIC_AGORA_BOT_UID=1001

# LLM Configuration (OpenAI or compatible)
LLM_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_actual_openai_key_here

# TTS Configuration (Microsoft Azure)
TTS_API_KEY=your_actual_azure_key_here
TTS_REGION=westus

# Optional: Use a static token instead of dynamic generation
# NEXT_PUBLIC_AGORA_TOKEN=your_rtc_token
```

**🔴 DO NOT leave any values empty!** Every variable above (except the commented optional ones) must have a valid value.

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

### 1. Agora Credentials

**Go to [Agora Console](https://console.agora.io/)**

#### A. App ID & App Certificate
1. Log in to Agora Console
2. Click on your project (or create a new one)
3. Go to **Project Settings** (or click the eye icon next to your project)
4. Copy the **App ID** → Use for `NEXT_PUBLIC_AGORA_APP_ID`
5. Enable and copy the **App Certificate** → Use for `AGORA_APP_CERTIFICATE`
   - ⚠️ Keep this secret! Never commit it to version control

#### B. Customer ID & Secret (RESTful API Credentials)
1. In Agora Console, go to **RESTful API** section
2. Click **"Add a secret"** or **"Generate secret"**
3. Copy the **Customer ID** (also called API Key) → Use for `AGORA_CUSTOMER_ID`
4. Copy the **Customer Secret** → Use for `AGORA_CUSTOMER_SECRET`
   - ⚠️ Keep this secret! This is required for starting the AI agent

#### C. Bot UID
- Choose any unique numeric identifier (e.g., `1001`, `999`, `12345`)
- This UID must be unique within each channel
- Use for `NEXT_PUBLIC_AGORA_BOT_UID`

### 2. OpenAI API Key

**Go to [OpenAI Platform](https://platform.openai.com/api-keys)**

1. Sign up or log in to OpenAI
2. Navigate to **API Keys** section
3. Click **"Create new secret key"**
4. Copy the key → Use for `LLM_API_KEY`
   - ⚠️ This key starts with `sk-proj-` or `sk-`
   - You need access to GPT-4o model (check your OpenAI plan)
5. Keep `LLM_URL=https://api.openai.com/v1/chat/completions` as-is

### 3. Azure Speech Services (TTS)

**Go to [Azure Portal](https://portal.azure.com)**

1. Sign up or log in to Azure
2. Create a new **Speech Services** resource:
   - Search for "Speech Services" in the Azure Portal
   - Click **"Create"**
   - Choose your subscription and resource group
   - Select a **region** (e.g., `westus`, `eastus`)
   - Choose a pricing tier (F0 free tier available)
3. Once created, go to **Keys and Endpoint**
4. Copy **Key 1** → Use for `TTS_API_KEY`
5. Note your **Location/Region** → Use for `TTS_REGION`
   - ⚠️ Region must match where you created the resource (e.g., `westus`, `eastus`, `westeurope`)

## Verification Steps

After setting up your `.env.local` file:

1. **Check the file exists**:
   ```bash
   ls -la .env.local
   ```
   - You should see the file in your project root

2. **Verify no empty values**:
   - Open `.env.local` and ensure every required variable has a value
   - There should be NO lines like `LLM_API_KEY=` (empty after equals sign)

3. **Test the application**:
   ```bash
   npm run dev
   ```
   - Open http://localhost:3000
   - Click "Start Session"
   - If you see "Missing Agora credentials" or similar errors, recheck your `.env.local`

## Security Best Practices

✅ **DO:**
- Keep `.env.local` in your `.gitignore` (already configured)
- Use separate credentials for development and production
- Rotate your API keys regularly
- Use environment variables for all secrets

❌ **DON'T:**
- Commit `.env.local` to version control
- Share your credentials in screenshots or documentation
- Use production credentials in public demos
- Hardcode credentials in your source code

## Troubleshooting

### Error: "Missing Agora credentials"

**Solution:**
- Verify `.env.local` exists in project root (not in subdirectories)
- Check that all required variables are set
- Restart the dev server: `npm run dev`

### Error: "Failed to generate token"

**Solution:**
- Check `AGORA_APP_CERTIFICATE` is correct
- Ensure `NEXT_PUBLIC_AGORA_APP_ID` matches your project

### Error: "Failed to start conversational AI agent"

**Solution:**
- Verify `AGORA_CUSTOMER_ID` and `AGORA_CUSTOMER_SECRET` are correct
- Check that Conversational AI is enabled for your Agora project
- Ensure `NEXT_PUBLIC_AGORA_BOT_UID` is a valid number

### Error: "Missing LLM or TTS credentials"

**Solution:**
- Verify `LLM_API_KEY` is set and valid (starts with `sk-`)
- Verify `TTS_API_KEY` is set and valid
- Check `TTS_REGION` matches your Azure resource region

### Still not working?

1. Print your environment variables (safely):
   ```javascript
   // Add to app/api/token/route.ts temporarily
   console.log('App ID exists:', !!process.env.NEXT_PUBLIC_AGORA_APP_ID);
   console.log('Certificate exists:', !!process.env.AGORA_APP_CERTIFICATE);
   ```

2. Check for typos in variable names
3. Ensure no extra spaces or quotes around values
4. Try copying `.env.example` again and re-filling values

## Notes

- Channel names are automatically generated with random IDs (e.g., `agora-ai-abc123xyz`)
- No need to set `NEXT_PUBLIC_AGORA_CHANNEL` - it's dynamic!
- Tokens are generated automatically when you connect (1-hour expiration)
- All credentials must be YOUR OWN - this is a public demo, not a managed service
