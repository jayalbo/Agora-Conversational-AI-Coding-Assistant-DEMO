import { NextRequest, NextResponse } from "next/server";
import { RtcTokenBuilder, RtcRole } from "agora-token";

/**
 * API Route: Start Conversational AI Agent
 *
 * This endpoint initializes an Agora Conversational AI agent that:
 * 1. Joins the specified RTC channel
 * 2. Listens to user's voice (ASR: Speech-to-text)
 * 3. Processes requests through LLM (GPT-4o)
 * 4. Responds with natural voice (TTS: Text-to-speech via Azure)
 * 5. Sends transcriptions via RTM for the UI
 *
 * The agent configuration includes:
 * - System prompt instructing AI to wrap code in Chinese brackets 【】
 * - TTS skip_patterns to avoid reading code aloud
 * - Voice activity detection for natural interruptions
 * - RTM enabled for real-time transcription streaming
 */
export async function POST(request: NextRequest) {
  try {
    const {
      channelName,
      uid,
      // User-provided credentials (for live demo)
      appId: userAppId,
      appCertificate: userAppCertificate,
      customerId: userCustomerId,
      customerSecret: userCustomerSecret,
      botUid: userBotUid,
      llmProvider: userLlmProvider,
      llmUrl: userLlmUrl,
      llmApiKey: userLlmApiKey,
      llmModel: userLlmModel,
      ttsApiKey: userTtsApiKey,
      ttsRegion: userTtsRegion,
      mcps,
    } = await request.json();

    // Use credentials from request body (for live demo) or fall back to env vars (for development)
    const appId = userAppId || process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const appCertificate =
      userAppCertificate || process.env.AGORA_APP_CERTIFICATE;
    const customerId = userCustomerId || process.env.AGORA_CUSTOMER_ID;
    const customerSecret =
      userCustomerSecret || process.env.AGORA_CUSTOMER_SECRET;
    const botUid = userBotUid || process.env.NEXT_PUBLIC_AGORA_BOT_UID;
    const llmUrl = userLlmUrl || process.env.LLM_URL;
    const llmApiKey = userLlmApiKey || process.env.LLM_API_KEY;
    const ttsApiKey = userTtsApiKey || process.env.TTS_API_KEY;
    const ttsRegion = userTtsRegion || process.env.TTS_REGION || "westus";

    if (
      !appId ||
      !appCertificate ||
      !customerId ||
      !customerSecret ||
      !botUid
    ) {
      return NextResponse.json(
        {
          error:
            "Missing Agora credentials. Please configure your credentials in Settings.",
        },
        { status: 400 }
      );
    }

    if (!llmUrl || !llmApiKey || !ttsApiKey) {
      return NextResponse.json(
        {
          error:
            "Missing LLM or TTS credentials. Please configure your credentials in Settings.",
        },
        { status: 400 }
      );
    }

    if (!channelName) {
      return NextResponse.json(
        { error: "Channel name is required" },
        { status: 400 }
      );
    }

    // Generate RTC and RTM2 token for the bot
    // The bot needs BOTH:
    // - RTC privileges to send audio (TTS voice output)
    // - RTM2 privileges to send transcription messages
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600; // 1 hour

    const botToken = RtcTokenBuilder.buildTokenWithRtm2(
      appId,
      appCertificate,
      channelName,
      parseInt(botUid, 10), // RTC account (numeric UID for audio)
      role,
      expirationTimeInSeconds, // RTC token expire
      expirationTimeInSeconds, // join channel privilege expire
      expirationTimeInSeconds, // pub audio privilege expire
      expirationTimeInSeconds, // pub video privilege expire
      expirationTimeInSeconds, // pub data stream privilege expire
      botUid, // RTM user ID (string version of UID for messaging)
      expirationTimeInSeconds // RTM token expire
    );

    console.log("\n=== BOT TOKEN GENERATED ===");
    console.log("App ID:", appId);
    console.log("Channel:", channelName);
    console.log("Bot UID:", botUid);
    console.log("Bot Token:", botToken);
    console.log("Bot Token Length:", botToken.length);
    console.log("===========================\n");

    // Note: Bot uses single token with both RTC and RTM2 privileges

    // Create Basic Auth header
    const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString(
      "base64"
    );

    // Unique agent name
    const agentName = `agent-${channelName}-${Date.now()}`;

    // Start the conversational AI agent using official API structure
    // Ref: https://docs.agora.io/en/conversational-ai/rest-api/join
    console.log("\n🚀 STARTING AGENT");
    console.log(
      "Endpoint:",
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`
    );
    console.log("Agent name:", agentName);

    const requestBody = {
      name: agentName,
      properties: {
        channel: channelName,
        token: botToken,
        agent_rtc_uid: botUid,
        remote_rtc_uids: ["*"], // Subscribe to all users
        idle_timeout: 120, // 2 minutes timeout
        advanced_features: {
          enable_aivad: true, // Enable intelligent interruption
          enable_rtm: true, // Enable RTM for transcriptions
          audio_scenario: "chorus",
        },
        parameters: {
          data_channel: "rtm", // Use RTM for data transmission
        },
        asr: {
          language: "en-US",
          vendor: "ares",
          params: {},
        },
        tts: {
          vendor: "microsoft",
          params: {
            key: ttsApiKey,
            region: ttsRegion,
            // voice_name: "en-US-AndrewMultilingualNeural", // Natural-sounding male voice
            // voice_name: "en-US-ShimmerTurboMultilingualNeural",
            voice_name: "en-US-AlloyTurboMultilingualNeural",
          },
          // CRITICAL: skip_patterns: [2] tells TTS to skip Chinese square brackets 【】
          // This prevents the AI from reading 500 lines of HTML code aloud.
          // Pattern codes: 0=none, 1=square brackets[], 2=Chinese brackets【】, 3=angle brackets<>
          skip_patterns: [2],
        },
        llm: (() => {
          const hasMcps = mcps && Array.isArray(mcps) && mcps.length > 0;

          // Base system prompt
          let systemPrompt =
            "You are an expert web development AI assistant specializing in creating websites, web apps, and browser-based games. Keep spoken responses SHORT and concise.\n\nIMPORTANT: Only generate code when the user asks you to create, build, or modify something. For conversational questions (like \"How are you?\", \"What can you do?\"), just respond naturally WITHOUT generating any code.\n\nWhen you DO generate HTML/CSS/JS code, you MUST wrap it in CHINESE SQUARE BRACKETS like this:\n【<!DOCTYPE html><html>...</html>】\n\nThe Chinese square brackets 【】 are REQUIRED - they tell the system to render the code visually instead of speaking it.\n\nRULES:\n1. Code must be wrapped in Chinese square brackets: 【<!DOCTYPE html><html>...</html>】\n2. Put ONLY the raw HTML code inside 【】 - NO markdown code fences like ```html, NO explanatory text\n3. Start with <!DOCTYPE html> or <html immediately after the opening 【\n4. Text outside 【】 will be spoken aloud - KEEP IT BRIEF\n5. Code runs in an iframe - ensure it's responsive and standalone\n6. Use modern, clean design with good UX practices\n7. For images, use https://picsum.photos/ - Examples: https://picsum.photos/200/300 or https://picsum.photos/400 for square or https://picsum.photos/id/237/200/300 for specific image\n8. NEVER include any comments in the code - NO inline comments (//), NO multiline comments (/* */), NO HTML comments (<!-- -->). Generate clean code without any comments.\n9. NEVER speak or mention URLs in your spoken responses unless they are inside Chinese brackets 【】as part of the code. If you need to reference a URL, put it only in code inside 【】brackets, never in spoken text.\n\nEXTERNAL SERVICES:\nYou can use CDN services when needed, but only if they add significant value:\n- jsDelivr (https://cdn.jsdelivr.net) - for libraries like jQuery, Bootstrap, etc.\n- Font Awesome (https://cdnjs.cloudflare.com/ajax/libs/font-awesome/) - for icons\n- Three.js (https://cdnjs.cloudflare.com/ajax/libs/three.js/) - for 3D graphics and games\n- Google Fonts (https://fonts.googleapis.com) - for typography\n- Chart.js, D3.js - for data visualization\n- Matter.js, Phaser - for physics and game engines\n- Other CDN services as appropriate\n\nIMPORTANT:\n- DO NOT use React, Next.js, Vue, Angular, or other frameworks that require build tools or server-side rendering. Code runs in a static iframe.\n- Only include external libraries if they're necessary for the requested feature. For simple websites/apps, prefer vanilla HTML/CSS/JS with inline styles and scripts.\n- All code must be client-side only and work in a static HTML file.\n\nSPEAKING STYLE: Be concise. Say only what's necessary. Avoid long explanations.\n\nCORRECT EXAMPLE:\nHere's a button 【<!DOCTYPE html><html><head><style>button{background:red;color:white;padding:20px;border:none;}</style></head><body><button onclick=\"alert('Hi!')\">Click Me</button></body></html>】 that shows an alert.\n\nWRONG EXAMPLE (with markdown fences):\n【```html\n<!DOCTYPE html>...\n```】\n\nALWAYS use raw HTML inside the brackets, never markdown fences. Without Chinese brackets 【】, the code will be spoken instead of rendered.";

          // Add information about available tools/MCPs if configured
          if (hasMcps) {
            const mcpNames = mcps
              .map((mcp: any) => mcp.name || "Unknown")
              .join(", ");
            systemPrompt += `\n\nEXTERNAL TOOLS AVAILABLE:\nYou have access to external tools and services through integrated MCP (Model Context Protocol) connections: ${mcpNames}.\n\nIMPORTANT TOOL USAGE GUIDELINES:\n- When users ask questions that could be answered by your available tools, USE THEM AUTOMATICALLY\n- Don't wait for explicit permission - if a tool can provide better, real-time information, use it\n- Review the available tool descriptions to understand what each tool can do\n- Use tools proactively to provide accurate, up-to-date information rather than relying on your training data\n- If you're unsure about something that your tools can help with, USE THE TOOLS to find out\n\nCRITICAL: ALWAYS FULFILL THE CORE REQUEST:\n- If a user asks you to CREATE, BUILD, or MAKE something (like a website, app, or code), you MUST ALWAYS fulfill that request\n- If your tools cannot find specific information (like a person's photo, specific data, etc.), STILL CREATE what was requested but:\n  * Briefly mention that you couldn't find the specific information (e.g., "I couldn't find a picture of [person], so I'm using a placeholder image")\n  * Use appropriate placeholders (e.g., placeholder images from https://picsum.photos/, placeholder text, default values)\n  * Complete the full request as asked - never leave it empty or incomplete\n- Example: If asked "create a website with a picture of John Doe", and tools can't find John Doe's picture:\n  * Say: "I couldn't find a picture of John Doe, so I'm using a placeholder image for now."\n  * Then: Generate the complete website code with a placeholder image\n- NEVER respond with only "I couldn't find that" - always provide the requested creation with placeholders\n\nBe proactive in using available tools to enhance your responses with real-time, accurate information.`;
          }

          // Build wrapper URL if MCPs are configured
          let wrapperUrl: string | null = null;
          if (hasMcps) {
            const host =
              request.headers.get("x-forwarded-host") ||
              request.headers.get("host") ||
              "localhost:3000";
            const protocol =
              request.headers.get("x-forwarded-proto") ||
              (request.url.startsWith("https") ? "https" : "http");
            const baseUrl = `${protocol}://${host}`;
            const encodedLlmUrl = Buffer.from(llmUrl).toString("base64");
            const encodedLlmApiKey = Buffer.from(llmApiKey).toString("base64");
            const encodedMcps = Buffer.from(JSON.stringify(mcps)).toString(
              "base64"
            );
            wrapperUrl = `${baseUrl}/api/llm-wrapper/chat/completions?llmUrl=${encodeURIComponent(
              encodedLlmUrl
            )}&llmApiKey=${encodeURIComponent(
              encodedLlmApiKey
            )}&mcps=${encodeURIComponent(encodedMcps)}`;
          }

          // When using wrapper, always use OpenAI format (wrapper returns OpenAI-compatible format)
          // Only use Gemini format when directly calling Gemini without wrapper
          if (userLlmProvider === "gemini" && !wrapperUrl) {
            // Direct Gemini call without wrapper - use Gemini format
            const actualGeminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${
              userLlmModel || "gemini-3-flash-preview"
            }:streamGenerateContent?alt=sse&key=${llmApiKey}`;

            return {
              url: actualGeminiUrl,
              system_messages: [
                {
                  parts: [
                    {
                      text: systemPrompt,
                    },
                  ],
                  role: "user",
                },
              ],
              max_history: 32,
              greeting_message:
                "Hi! I'm your Agora AI coding assistant. Ask me to create any web app and I'll build it for you!",
              failure_message:
                "I'm having trouble processing that. Could you please try again?",
              params: {
                model: userLlmModel || "gemini-3-flash-preview",
              },
              style: "gemini",
            };
          } else {
            // OpenAI format (default) or wrapper (which returns OpenAI-compatible format)
            const finalUrl = wrapperUrl || llmUrl;

            return {
              url: finalUrl,
              api_key: wrapperUrl ? "" : llmApiKey,
              system_messages: [
                {
                  role: "system",
                  content: systemPrompt,
                },
              ],
              max_history: 32,
              greeting_message:
                "Hi! I'm your Agora AI coding assistant. Ask me to create any web app and I'll build it for you!",
              failure_message:
                "I'm having trouble processing that. Could you please try again?",
              params: {
                model:
                  userLlmModel ||
                  (userLlmProvider === "gemini"
                    ? "gemini-3-flash-preview"
                    : "gpt-4o-mini"),
                max_completion_tokens: 16384,
              },
            };
          }
        })(),
        vad: {
          mode: "interrupt",
          interrupt_duration_ms: 160,
          silence_duration_ms: 640,
        },
      },
    };

    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000), // 15 second timeout
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("\n❌ AGORA API ERROR ❌");
      console.error("Status:", response.status);
      console.error("Response:", errorData);
      console.error(
        "Request body:",
        JSON.stringify(
          {
            name: agentName,
            properties: { channel: channelName, agent_rtc_uid: botUid },
          },
          null,
          2
        )
      );
      console.error("=======================\n");
      return NextResponse.json(
        { error: `Failed to start conversational AI agent: ${errorData}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("\n✅ AGENT STARTED SUCCESSFULLY ✅");
    console.log("Agent ID:", data.agent_id);
    console.log("Status:", data.status);
    console.log("================================\n");

    return NextResponse.json({
      success: true,
      agentName,
      channelName,
      botUid: botUid,
      agentId: data.agent_id,
      status: data.status,
      createTs: data.create_ts,
    });
  } catch (error) {
    console.error("Error starting agent:", error);
    return NextResponse.json(
      { error: "Failed to start conversational AI agent" },
      { status: 500 }
    );
  }
}
