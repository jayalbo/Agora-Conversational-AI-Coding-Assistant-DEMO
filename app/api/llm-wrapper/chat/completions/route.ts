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
          // Create MCP client using HTTP transport
          let mcpClient: any = null;
          let tools: Record<string, any> = {};

          try {
            mcpClient = await createMCPClient({
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
            tools = await mcpClient.tools();
          } catch (initError: any) {
            // If initialization fails, try to fetch tools directly as fallback
            console.warn(
              `⚠️ MCP client initialization failed for ${mcp.name}, trying direct tools/list...`
            );

            try {
              const toolsListResponse = await fetch(mcp.address, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(mcp.credentials
                    ? { Authorization: `Bearer ${mcp.credentials}` }
                    : {}),
                },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: "tools-list-1",
                  method: "tools/list",
                  params: {},
                }),
              });

              if (toolsListResponse.ok) {
                const toolsListData = await toolsListResponse.json();
                if (toolsListData.result?.tools) {
                  // Convert MCP tools to AI SDK tool format
                  for (const tool of toolsListData.result.tools) {
                    tools[tool.name] = {
                      description: tool.description || "",
                      parameters: tool.inputSchema || {},
                    };
                  }
                  console.log(
                    `✅ Fallback: Discovered ${
                      Object.keys(tools).length
                    } tools from ${mcp.name} via direct call`
                  );
                }
              }
            } catch (fallbackError) {
              console.error(
                `❌ Fallback tools/list also failed for ${mcp.name}:`,
                fallbackError
              );
              throw initError; // Throw original error if fallback also fails
            }
          }

          // Merge tools into the collection
          Object.assign(allMCPTools, tools);

          const toolCount = Object.keys(tools).length;
          if (toolCount > 0) {
            console.log(`✅ Discovered ${toolCount} tools from ${mcp.name}`);
          } else {
            console.warn(`⚠️ No tools discovered from ${mcp.name}`);
          }
        } catch (e: any) {
          console.error(`❌ Failed to discover tools from ${mcp.name}:`, e);
          // Log more details about the error
          if (e?.message) {
            console.error(`   Error message: ${e.message}`);
          }
          if (e?.cause) {
            console.error(`   Error cause:`, e.cause);
          }
          if (e?.response) {
            console.error(`   Error response:`, e.response);
          }
          // Try to extract response body if available
          if (e?.response?.body) {
            try {
              const bodyText = await e.response.body.text();
              console.error(`   Response body:`, bodyText);
            } catch (bodyError) {
              console.error(`   Could not read response body:`, bodyError);
            }
          }
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
    // Gemini uses a different format, all other LLMs supported by Agora follow OpenAI format
    const isGemini = llmUrl.includes("generativelanguage.googleapis.com");
    const isOpenAI = !isGemini; // Default to OpenAI format for all non-Gemini LLMs

    console.log(
      `🌐 Provider: ${
        isGemini ? "Gemini" : "OpenAI-compatible"
      }, URL: ${llmUrl.substring(0, 80)}...`
    );

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
      // We need multiple steps: tool calls + follow-up responses with text
      // Set to 7 to allow up to 5 tool call rounds + 2 steps for final text generation
      // This ensures we always get a text response even after tool calls
      streamOptions.stopWhen = stepCountIs(7);
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
          let waitingMessageSent = false; // Track if we've already sent a waiting message

          // Friendly waiting messages - pick one randomly per request
          const waitingMessages = [
            "Just a moment...",
            "Working on that for you...",
            "One second...",
            "On it...",
            "Processing that...",
            "Taking care of that...",
          ];

          // Use fullStream to capture all events including tool calls
          let roundNumber = 0;
          let chunkCount = 0;
          for await (const chunk of result.fullStream) {
            chunkCount++;
            const chunkType = (chunk as any).type;

            // Log chunk type for debugging
            if (chunkType === "tool-call") {
              toolCallsDetected = true;
              roundNumber++;
              const toolCallChunk = chunk as any;
              console.log(
                `🔧 [Round ${roundNumber}] Tool call detected: ${toolCallChunk.toolName} with input:`,
                JSON.stringify(toolCallChunk.input).substring(0, 100)
              );

              // Send waiting message only once per request when first MCP tool is called
              if (!waitingMessageSent) {
                // Pick a random friendly waiting message
                const waitingMessage =
                  waitingMessages[
                    Math.floor(Math.random() * waitingMessages.length)
                  ];

                // Send waiting message as a text delta chunk
                const waitingData = {
                  id: streamId,
                  object: "chat.completion.chunk",
                  created: streamCreated,
                  model: modelName,
                  choices: [
                    {
                      index: 0,
                      delta: { content: waitingMessage },
                      finish_reason: null,
                    },
                  ],
                };
                const encodedWaitingChunk = `data: ${JSON.stringify(
                  waitingData
                )}\n\n`;
                console.log(`⏳ Sending waiting message: "${waitingMessage}"`);
                controller.enqueue(encoder.encode(encodedWaitingChunk));
                waitingMessageSent = true; // Mark as sent so we don't send it again
              }
            } else if (chunkType === "tool-result") {
              const toolResultChunk = chunk as any;
              console.log(
                `✅ [Round ${roundNumber}] Tool result received for: ${toolResultChunk.toolName}`
              );
              // Print the full tool result, especially useful for deploy-html
              const output = toolResultChunk.output;
              if (toolResultChunk.toolName === "deploy-html") {
                console.log(
                  "🔗 deploy-html tool output:",
                  JSON.stringify(output, null, 2)
                );
                // Extract URL from successful deployments
                if (
                  output &&
                  !output.isError &&
                  output.content &&
                  output.content[0]?.text
                ) {
                  const resultText = output.content[0].text;
                  console.log("🌐 deploy-html deployed URL:", resultText);
                } else if (output?.isError) {
                  console.log(
                    "❌ deploy-html error:",
                    output.content?.[0]?.text || "Unknown error"
                  );
                }
              }
            } else if (chunkType === "text-delta") {
              // text-delta chunks contain incremental text deltas (not accumulated)
              // So chunk.text is already the delta we need to send
              const textDeltaChunk = chunk as any;
              const delta = textDeltaChunk.text;

              if (delta) {
                hasSentContent = true;
                console.log(
                  `📝 [Round ${roundNumber}] Text delta (${
                    delta.length
                  } chars): "${delta.substring(0, 50)}${
                    delta.length > 50 ? "..." : ""
                  }"`
                );
                // For Gemini, if we get a large chunk (like 75 chars), split it into smaller pieces
                // to match OpenAI's incremental streaming format that Agora expects
                if (isGemini && delta.length > 20) {
                  console.log(
                    `✂️ Gemini large chunk (${delta.length} chars), splitting into ~10 char chunks`
                  );
                  // Split into chunks of ~10 characters each to simulate incremental streaming
                  const chunkSize = 10;
                  for (let i = 0; i < delta.length; i += chunkSize) {
                    const smallChunk = delta.slice(i, i + chunkSize);
                    const data = {
                      id: streamId,
                      object: "chat.completion.chunk",
                      created: streamCreated,
                      model: modelName,
                      choices: [
                        {
                          index: 0,
                          delta: { content: smallChunk },
                          finish_reason: null,
                        },
                      ],
                    };
                    const encodedChunk = `data: ${JSON.stringify(data)}\n\n`;
                    controller.enqueue(encoder.encode(encodedChunk));
                  }
                  console.log(
                    `📤 Sent ${Math.ceil(
                      delta.length / chunkSize
                    )} split chunks`
                  );
                } else {
                  // Send as-is for OpenAI or small Gemini chunks
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
                  const encodedChunk = `data: ${JSON.stringify(data)}\n\n`;
                  console.log(
                    `📤 Enqueuing SSE chunk (${encodedChunk.length} bytes) to stream`
                  );
                  controller.enqueue(encoder.encode(encodedChunk));
                }
              } else {
                console.log(
                  `⚠️ [Round ${roundNumber}] Empty text-delta chunk received`
                );
              }
            } else if (chunkType === "finish") {
              const finishChunk = chunk as any;
              console.log(
                `✅ [Round ${roundNumber}] Finish event. Reason: ${finishChunk.finishReason}, Content sent: ${hasSentContent}, Total chunks: ${chunkCount}`
              );

              // Only send final chunk if finishReason is "stop" (final completion)
              // If it's "tool-calls", the stream should continue with another round
              if (finishChunk.finishReason === "stop") {
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
              } else if (finishChunk.finishReason === "tool-calls") {
                console.log(
                  `⏳ Tool round completed, waiting for follow-up response (maxToolRoundtrips should handle this)...`
                );
                // Don't send final chunk - the stream should continue
                // The loop should continue if maxToolRoundtrips > 1
              }
            } else {
              // Log unknown chunk types for debugging (especially for Gemini)
              console.log(
                `📦 [Round ${roundNumber}] Chunk type: ${chunkType}, Provider: ${
                  isGemini ? "Gemini" : "OpenAI"
                }`
              );
            }
          }

          console.log(
            `🔚 Stream iteration completed. Total rounds: ${roundNumber}, Content sent: ${hasSentContent}, Total chunks processed: ${chunkCount}, Provider: ${
              isGemini ? "Gemini" : "OpenAI"
            }`
          );

          // Fallback: if we never sent content, send a helpful message
          // This can happen when tool calls hit the limit without finding results
          if (!hasSentContent) {
            console.log(
              `⚠️ No content sent, sending helpful fallback message. Tool calls: ${toolCallsDetected}, Rounds: ${roundNumber}`
            );

            // Construct a helpful fallback message
            const fallbackMessages = [
              "I wasn't able to find specific information about that, but I'm here to help with anything else you need!",
              "I checked a few sources but couldn't find that information. Feel free to ask me something else!",
              "I wasn't able to locate that information with the tools available. What else can I help you with?",
              "Unfortunately, I couldn't find the information you're looking for. Is there anything else I can help with?",
            ];
            const fallbackMessage =
              fallbackMessages[
                Math.floor(Math.random() * fallbackMessages.length)
              ];

            // Send the fallback message as text deltas (split for consistency)
            const chunkSize = 15;
            for (let i = 0; i < fallbackMessage.length; i += chunkSize) {
              const chunk = fallbackMessage.slice(i, i + chunkSize);
              const data = {
                id: streamId,
                object: "chat.completion.chunk",
                created: streamCreated,
                model: modelName,
                choices: [
                  {
                    index: 0,
                    delta: { content: chunk },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
              );
            }

            // Send final chunk
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
