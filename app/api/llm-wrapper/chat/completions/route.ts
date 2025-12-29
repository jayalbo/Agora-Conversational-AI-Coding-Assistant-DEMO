import { NextRequest, NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMCPClient } from "@ai-sdk/mcp";

interface MCPConfig {
  name: string;
  address: string;
  credentials?: string;
}

/**
 * LLM wrapper using Vercel AI SDK that:
 * 1. Discovers MCP tools using AI SDK's built-in MCP support
 * 2. Handles tool calls automatically via AI SDK
 * 3. Streams responses in OpenAI-compatible format for Agora
 */
export async function POST(request: NextRequest) {
  let mcpClients: any[] = [];

  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);

    // Get configs from query params
    const encodedLlmUrl = searchParams.get("llmUrl");
    const encodedLlmApiKey = searchParams.get("llmApiKey");
    const encodedMcps = searchParams.get("mcps");

    if (!encodedLlmUrl || !encodedLlmApiKey) {
      return NextResponse.json(
        { detail: "llmUrl and llmApiKey required" },
        { status: 400 }
      );
    }

    let llmUrl = Buffer.from(encodedLlmUrl, "base64").toString("utf-8");
    const llmApiKey = Buffer.from(encodedLlmApiKey, "base64").toString("utf-8");

    // Replace {api_key} placeholder if present (for Gemini)
    if (llmUrl.includes("{api_key}")) {
      llmUrl = llmUrl.replace("{api_key}", llmApiKey);
    }
    const mcpConfigs: MCPConfig[] = encodedMcps
      ? JSON.parse(Buffer.from(encodedMcps, "base64").toString("utf-8"))
      : [];

    // Discover MCP tools using AI SDK's built-in MCP client
    const allMCPTools: Record<string, any> = {};

    if (mcpConfigs.length > 0) {
      console.log(
        `🔍 Discovering tools from ${mcpConfigs.length} MCP server(s)...`
      );

      for (const mcp of mcpConfigs) {
        if (!mcp.address) continue;
        try {
          // Create MCP client using HTTP transport (recommended for production)
          const mcpClient = await createMCPClient({
            transport: {
              type: "http",
              url: mcp.address,
              headers: mcp.credentials
                ? { Authorization: `Bearer ${mcp.credentials}` }
                : undefined,
            },
          });

          mcpClients.push(mcpClient);

          // Get tools from MCP server - AI SDK handles the conversion automatically
          const tools = await mcpClient.tools();

          // Merge tools into the collection
          Object.assign(allMCPTools, tools);

          const toolCount = Object.keys(tools).length;
          if (toolCount > 0) {
            console.log(`✅ Discovered ${toolCount} tools from ${mcp.name}`);
          } else {
            console.warn(`⚠️ No tools discovered from ${mcp.name}`);
          }
        } catch (e) {
          console.error(`❌ Failed to discover tools from ${mcp.name}:`, e);
        }
      }

      const totalToolCount = Object.keys(allMCPTools).length;
      console.log(`📦 Total MCP tools: ${totalToolCount}`);
      if (totalToolCount > 0) {
        const toolNames = Object.keys(allMCPTools);
        console.log(
          `🔧 Available tools: ${toolNames.slice(0, 10).join(", ")}${
            toolNames.length > 10
              ? ` ... and ${toolNames.length - 10} more`
              : ""
          }`
        );
      }
    }

    // Determine provider
    const isOpenAI = llmUrl.includes("api.openai.com");
    const isGemini = llmUrl.includes("generativelanguage.googleapis.com");

    // Extract system message if present
    let systemMessage: string | undefined;
    const conversationMessages: any[] = [];

    for (const msg of body.messages || body.contents || []) {
      if (msg.role === "system") {
        systemMessage = msg.content;
        continue;
      }
      if (msg.role === "assistant") {
        conversationMessages.push({
          role: "assistant" as const,
          content: msg.content || "",
          toolCalls: msg.tool_calls?.map((tc: any) => ({
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments || "{}"),
          })),
        });
        continue;
      }
      if (msg.role === "tool") {
        conversationMessages.push({
          role: "tool" as const,
          toolCallId: msg.tool_call_id,
          toolName: msg.name,
          content: msg.content,
        });
        continue;
      }
      // Handle Gemini format (user role with parts)
      if (msg.parts && Array.isArray(msg.parts)) {
        const text = msg.parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text)
          .join("");
        conversationMessages.push({ role: "user" as const, content: text });
        continue;
      }
      // User message
      conversationMessages.push({
        role: "user" as const,
        content: msg.content || msg.text || "",
      });
    }

    // Configure provider and model
    let model: any;
    let modelName: string;

    if (isGemini) {
      // Extract model from URL or use default
      const modelMatch = llmUrl.match(/models\/([^:]+)/);
      modelName = modelMatch ? modelMatch[1] : "gemini-3-flash-preview";
      const googleProvider = createGoogleGenerativeAI({ apiKey: llmApiKey });
      model = googleProvider(modelName);
    } else {
      // OpenAI - create provider and then get model
      modelName = body.model || "gpt-4o-mini";
      const openaiProvider = createOpenAI({ apiKey: llmApiKey });
      model = openaiProvider(modelName);
    }

    // Merge MCP tools with any tools from the request body
    const requestTools = body.tools || {};
    const allTools =
      Object.keys(allMCPTools).length > 0 ||
      Object.keys(requestTools).length > 0
        ? { ...requestTools, ...allMCPTools }
        : undefined;

    if (allTools) {
      const toolCount = Object.keys(allTools).length;
      const mcpCount = Object.keys(allMCPTools).length;
      console.log(
        `🛠️ Sending ${toolCount} tool(s) to LLM (${
          mcpCount > 0 ? `${mcpCount} from MCP` : ""
        })`
      );
    }

    // Stream response using AI SDK
    const streamOptions: any = {
      model: model,
      system: systemMessage,
      messages: conversationMessages,
    };

    if (allTools) {
      streamOptions.tools = allTools;
      // stopWhen controls when to stop generation. Default is stepCountIs(1) which stops after 1 step.
      // We need multiple steps: 1) tool call, 2) follow-up response with tool results
      // Set to 5 to allow multiple tool call rounds with follow-up responses
      streamOptions.stopWhen = stepCountIs(5);
    }

    const startTime = Date.now();
    const result = streamText({
      ...streamOptions,
      onFinish: async () => {
        // Close all MCP clients when done
        for (const client of mcpClients) {
          try {
            await client.close();
          } catch (e) {
            console.error("Error closing MCP client:", e);
          }
        }
      },
    });

    // Convert AI SDK stream to OpenAI-compatible SSE format for Agora
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let streamId = `chatcmpl-${Date.now()}`;
          let streamCreated = Math.floor(Date.now() / 1000);
          let hasSentContent = false;
          let toolCallsDetected = false;

          // Use fullStream to capture all events including tool calls
          let roundNumber = 0;
          for await (const chunk of result.fullStream) {
            // Log chunk type for debugging
            if (chunk.type === "tool-call") {
              toolCallsDetected = true;
              roundNumber++;
              console.log(
                `🔧 [Round ${roundNumber}] Tool call detected: ${chunk.toolName} with input:`,
                JSON.stringify(chunk.input).substring(0, 100)
              );
            } else if (chunk.type === "tool-result") {
              console.log(
                `✅ [Round ${roundNumber}] Tool result received for: ${chunk.toolName}`
              );
            } else if (chunk.type === "text-delta") {
              // text-delta chunks contain incremental text deltas (not accumulated)
              // So chunk.text is already the delta we need to send
              const delta = chunk.text;

              if (delta) {
                hasSentContent = true;
                const data = {
                  id: streamId,
                  object: "chat.completion.chunk",
                  created: streamCreated,
                  model: modelName,
                  choices: [
                    {
                      index: 0,
                      delta: { content: delta },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                );
              }
            } else if (chunk.type === "finish") {
              console.log(
                `✅ [Round ${roundNumber}] Finish event. Reason: ${chunk.finishReason}, Content sent: ${hasSentContent}`
              );

              // Only send final chunk if finishReason is "stop" (final completion)
              // If it's "tool-calls", the stream should continue with another round
              if (chunk.finishReason === "stop") {
                console.log(`🏁 Final completion received`);
                const finalData = {
                  id: streamId,
                  object: "chat.completion.chunk",
                  created: streamCreated,
                  model: modelName,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: "stop",
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`)
                );
              } else if (chunk.finishReason === "tool-calls") {
                console.log(
                  `⏳ Tool round completed, waiting for follow-up response (maxToolRoundtrips should handle this)...`
                );
                // Don't send final chunk - the stream should continue
                // The loop should continue if maxToolRoundtrips > 1
              }
            }
            // Ignore other chunk types (start, start-step, text-start, text-end, finish-step, tool-input-*, etc.)
          }

          console.log(
            `🔚 Stream iteration completed. Total rounds: ${roundNumber}, Content sent: ${hasSentContent}`
          );

          // Fallback: if we never sent content, ensure we send final chunk
          if (!hasSentContent) {
            console.log(
              `⚠️ No content sent, sending final chunk. Tool calls: ${toolCallsDetected}`
            );
            const finalData = {
              id: streamId,
              object: "chat.completion.chunk",
              created: streamCreated,
              model: modelName,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`)
            );
          }

          const duration = Date.now() - startTime;
          console.log(`⏱️ Total request duration: ${duration}ms`);
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("LLM wrapper error:", error);

    // Ensure MCP clients are closed on error
    for (const client of mcpClients) {
      try {
        await client.close();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }

    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
}
