import { NextRequest, NextResponse } from "next/server";

interface MCPConfig {
  name: string;
  address: string;
  credentials?: string;
}

/**
 * Simple SSE proxy that:
 * 1. Proxies LLM requests
 * 2. Discovers MCP tools and adds them to the request
 * 3. Intercepts tool calls, executes them via MCP, and makes follow-up requests
 */
export async function POST(request: NextRequest) {
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

    if (body.stream === false) {
      return NextResponse.json(
        { detail: "Streaming required" },
        { status: 400 }
      );
    }

    // Discover MCP tools
    let mcpTools: any[] = [];
    const toolOrigin = new Map<string, MCPConfig>(); // toolName -> MCPConfig

    if (mcpConfigs.length > 0) {
      console.log(
        `🔍 Discovering tools from ${mcpConfigs.length} MCP server(s)...`
      );
      for (const mcp of mcpConfigs) {
        if (!mcp.address) continue;
        try {
          const response = await fetch(mcp.address, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
              ...(mcp.credentials && {
                Authorization: `Bearer ${mcp.credentials}`,
              }),
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/list",
              params: {},
            }),
          });

          if (!response.ok) {
            console.error(`❌ MCP ${mcp.name} returned ${response.status}`);
            continue;
          }

          const contentType = response.headers.get("content-type") || "";
          const text = await response.text();
          let rawTools: any[] | null = null;

          // Prefer plain JSON / NDJSON
          if (contentType.includes("application/json")) {
            try {
              const data = JSON.parse(text);
              rawTools = data.result?.tools ?? [];
            } catch (e) {
              console.error(
                `❌ Failed to parse JSON tools from ${mcp.name}`,
                e
              );
            }
          }

          // Fallback: NDJSON or SSE-style "data: {...}"
          if (!rawTools || !Array.isArray(rawTools)) {
            const lines = text.split("\n");
            for (const lineRaw of lines) {
              const line = lineRaw.trim();
              if (!line) continue;

              const payload = line.startsWith("data:")
                ? line.substring(5).trim()
                : line;

              try {
                const data = JSON.parse(payload);
                if (data.result?.tools) {
                  rawTools = data.result.tools;
                  break;
                }
              } catch {
                // ignore bad JSON and keep scanning
              }
            }
          }

          if (rawTools && Array.isArray(rawTools) && rawTools.length > 0) {
            const tools = rawTools.map((t: any) => {
              const inputSchema = t.inputSchema ||
                t.input_schema || {
                  type: "object",
                  properties: {},
                };

              // Track which MCP this tool belongs to
              toolOrigin.set(t.name, mcp);

              return {
                type: "function",
                function: {
                  name: t.name,
                  description: t.description || "",
                  parameters: inputSchema,
                },
              };
            });

            mcpTools.push(...tools);
            console.log(`✅ Discovered ${tools.length} tools from ${mcp.name}`);
          } else {
            console.warn(`⚠️ No tools discovered from ${mcp.name}`);
          }
        } catch (e) {
          console.error(`❌ Failed to discover tools from ${mcp.name}:`, e);
        }
      }
      console.log(`📦 Total MCP tools: ${mcpTools.length}`);
      if (mcpTools.length > 0) {
        const toolNames = mcpTools.map((t) => t.function?.name || "unknown");
        console.log(
          `🔧 Available tools: ${toolNames.slice(0, 10).join(", ")}${
            toolNames.length > 10
              ? ` ... and ${toolNames.length - 10} more`
              : ""
          }`
        );
      }
    }

    // Prepare LLM request
    const allTools = [...(body.tools || []), ...mcpTools];
    const hasTools = allTools.length > 0;
    const isOpenAI = llmUrl.includes("api.openai.com");
    const isGemini = llmUrl.includes("generativelanguage.googleapis.com");

    if (hasTools) {
      console.log(
        `🛠️ Sending ${allTools.length} tools to LLM (${
          allTools.length - (body.tools?.length || 0)
        } from MCP)`
      );
    }

    const llmRequestUrl =
      isGemini && !llmUrl.includes("key=") && !llmUrl.includes("{api_key}")
        ? `${llmUrl}${llmUrl.includes("?") ? "&" : "?"}key=${llmApiKey}`
        : llmUrl;

    console.log(`🔗 Final LLM URL: ${llmRequestUrl.substring(0, 150)}...`);

    // Convert tools to Gemini format if needed
    let requestBody: any = { ...body };

    // Gemini doesn't use stream in body - it's in the URL (alt=sse)
    if (!isGemini) {
      requestBody.stream = true;
    }

    if (hasTools) {
      if (isGemini) {
        // Gemini uses functionDeclarations format
        // Clean up parameters schema to remove unsupported fields
        const functionDeclarations = allTools
          .filter((tool) => tool.type === "function")
          .map((tool) => {
            const params = tool.function?.parameters || {
              type: "object",
              properties: {},
            };

            // Clean up the schema - remove additionalProperties, $schema, etc.
            const cleanParams = (schema: any): any => {
              if (!schema || typeof schema !== "object") return schema;

              const cleaned: any = {};
              if (schema.type) cleaned.type = schema.type;
              if (schema.description) cleaned.description = schema.description;

              if (schema.properties) {
                cleaned.properties = {};
                for (const [key, value] of Object.entries(schema.properties)) {
                  cleaned.properties[key] = cleanParams(value);
                }
              }

              if (schema.required && Array.isArray(schema.required)) {
                cleaned.required = schema.required;
              }

              if (schema.items) {
                cleaned.items = cleanParams(schema.items);
              }

              if (schema.enum) {
                cleaned.enum = schema.enum;
              }

              return cleaned;
            };

            return {
              name: tool.function?.name || "",
              description: tool.function?.description || "",
              parameters: cleanParams(params),
            };
          });

        requestBody.tools =
          functionDeclarations.length > 0
            ? [{ functionDeclarations }]
            : undefined;
        requestBody.toolConfig =
          functionDeclarations.length > 0
            ? { functionCallingConfig: { mode: "AUTO" } }
            : undefined;
      } else {
        // OpenAI format
        requestBody.tools = allTools;
        requestBody.tool_choice = body.tool_choice || "auto";
      }
    }

    const llmRequestOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isOpenAI && { Authorization: `Bearer ${llmApiKey}` }),
      },
      body: JSON.stringify(requestBody),
    };

    // Stream response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const enqueue = (data: string) => {
          try {
            controller.enqueue(encoder.encode(data));
          } catch (e) {
            // Stream closed
          }
        };

        try {
          console.log(
            `🌐 Making LLM request to: ${llmRequestUrl.substring(0, 100)}...`
          );
          console.log(
            `📤 Request body:`,
            JSON.stringify(requestBody).substring(0, 500)
          );

          const response = await fetch(llmRequestUrl, llmRequestOptions);
          console.log(`📥 Response status: ${response.status}`);

          if (!response.ok) {
            const error = await response.text();
            console.error(`❌ LLM request failed:`, error);
            enqueue(`data: ${JSON.stringify({ error })}\n\n`);
            controller.close();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            console.error(`❌ No response body reader`);
            controller.close();
            return;
          }

          console.log(`✅ Starting to read stream (Gemini: ${isGemini})`);

          const decoder = new TextDecoder();
          const toolCallBuffers = new Map<number, any>();
          let assistantContent = "";
          let hasToolCalls = false;
          // Initialize stream metadata early for consistent IDs (required by Agora)
          let streamId = `chatcmpl-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`;
          let streamCreated = Math.floor(Date.now() / 1000);
          let streamModel = isGemini ? "gemini-3-flash-preview" : "gpt-4o-mini";
          let lastGeminiText = ""; // Track last text for delta calculation

          // Read initial stream
          let chunkCount = 0;
          let lastFinishReason: string | null = null;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log(`✅ Stream ended after ${chunkCount} chunks`);

              // Send final chunk with finish_reason if we haven't already
              if (isGemini && lastFinishReason !== "stop") {
                const finalChunk = {
                  id: streamId,
                  object: "chat.completion.chunk",
                  created: streamCreated,
                  model: streamModel,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: "stop",
                    },
                  ],
                };

                console.log(`📤 Sending final chunk with finish_reason: stop`);
                enqueue(`data: ${JSON.stringify(finalChunk)}\n\n`);
              }

              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            chunkCount++;

            // Log raw chunk for debugging (first few only)
            if (chunkCount <= 3) {
              console.log(
                `📦 Raw chunk ${chunkCount}:`,
                chunk.substring(0, 200)
              );
            }

            for (const line of chunk.split("\n")) {
              if (!line.trim() || line.trim() === "[DONE]") continue;

              const dataStr = line.startsWith("data: ")
                ? line.substring(6)
                : line;

              // Try to parse - Gemini might send JSON without "data: " prefix
              let parsed: any = null;
              try {
                parsed = JSON.parse(dataStr);
              } catch (e) {
                // If it doesn't start with "data: ", try parsing the whole line
                if (!line.startsWith("data: ")) {
                  try {
                    parsed = JSON.parse(line.trim());
                  } catch (e2) {
                    // Not JSON, skip
                    continue;
                  }
                } else {
                  continue;
                }
              }

              // Log first few parsed chunks
              if (chunkCount <= 3) {
                console.log(
                  `📋 Parsed chunk:`,
                  JSON.stringify(parsed).substring(0, 300)
                );
              }

              try {
                // Capture stream metadata from chunks (but use defaults if not present)
                if (parsed.id && !streamId.includes("chatcmpl"))
                  streamId = parsed.id;
                if (parsed.created) streamCreated = parsed.created;
                if (parsed.model) streamModel = parsed.model;

                // Handle content (both OpenAI and Gemini formats)
                let geminiDeltaText: string | null = null;

                if (parsed.choices?.[0]?.delta?.content) {
                  assistantContent += parsed.choices[0].delta.content;
                  console.log(
                    `📝 OpenAI content delta:`,
                    parsed.choices[0].delta.content.substring(0, 50)
                  );
                }
                // Gemini format uses candidates[0].content.parts
                // Based on logs, Gemini sends incremental text chunks (each contains only new text, not full accumulated)
                // So we can treat each chunk's text as a delta directly
                if (parsed.candidates?.[0]?.content?.parts) {
                  for (const part of parsed.candidates[0].content.parts || []) {
                    if (part.text !== undefined) {
                      // Treat each text part as a delta (new text to append)
                      // Note: part.text can be empty string, which is valid
                      geminiDeltaText = part.text;
                      if (geminiDeltaText) {
                        assistantContent += geminiDeltaText;
                        lastGeminiText += geminiDeltaText; // Accumulate for tracking
                        console.log(
                          `📝 Gemini content delta:`,
                          geminiDeltaText.substring(0, 50)
                        );
                      }
                      break; // Only take first text part
                    }
                  }
                }

                // Check for finish reason even if no text (for final chunk)
                if (parsed.candidates?.[0]?.finishReason && !geminiDeltaText) {
                  // This is a final chunk with no content, we'll handle it in forwarding section
                  lastFinishReason =
                    parsed.candidates[0].finishReason === "STOP"
                      ? "stop"
                      : parsed.candidates[0].finishReason === "MAX_TOKENS"
                      ? "length"
                      : parsed.candidates[0].finishReason === "SAFETY"
                      ? "content_filter"
                      : null;
                }

                // Handle tool calls (OpenAI format)
                if (
                  parsed.choices?.[0]?.delta?.tool_calls &&
                  mcpConfigs.length > 0
                ) {
                  hasToolCalls = true;
                  for (const tc of parsed.choices[0].delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCallBuffers.has(idx)) {
                      toolCallBuffers.set(idx, {
                        id: tc.id || "",
                        type: tc.type || "function",
                        function: {
                          name: tc.function?.name || "",
                          arguments: tc.function?.arguments || "",
                        },
                      });
                    } else {
                      const buf = toolCallBuffers.get(idx)!;
                      if (tc.id) buf.id = tc.id;
                      if (tc.function?.name)
                        buf.function.name = tc.function.name;
                      if (tc.function?.arguments)
                        buf.function.arguments += tc.function.arguments;
                    }
                  }
                }

                // Handle function calls (Gemini format)
                if (
                  parsed.candidates?.[0]?.content?.parts &&
                  mcpConfigs.length > 0
                ) {
                  for (const part of parsed.candidates[0].content.parts || []) {
                    if (part.functionCall) {
                      hasToolCalls = true;
                      const fc = part.functionCall;
                      const idx = 0; // Gemini doesn't use index like OpenAI
                      if (!toolCallBuffers.has(idx)) {
                        toolCallBuffers.set(idx, {
                          id: `${idx}-${Date.now()}`, // Generate ID for Gemini
                          type: "function",
                          function: {
                            name: fc.name || "",
                            arguments: JSON.stringify(fc.args || {}),
                          },
                        });
                      } else {
                        // Gemini sends complete function calls, so we might need to merge args
                        const buf = toolCallBuffers.get(idx)!;
                        if (fc.name) buf.function.name = fc.name;
                        if (fc.args) {
                          try {
                            const existingArgs = JSON.parse(
                              buf.function.arguments || "{}"
                            );
                            buf.function.arguments = JSON.stringify({
                              ...existingArgs,
                              ...fc.args,
                            });
                          } catch {
                            buf.function.arguments = JSON.stringify(
                              fc.args || {}
                            );
                          }
                        }
                      }
                    }
                  }
                }

                // If finish_reason is tool_calls (OpenAI) or contains function calls (Gemini), handle internally
                if (parsed.choices?.[0]?.finish_reason === "tool_calls") {
                  hasToolCalls = true;
                }
                // Gemini finish reason might be different, check for function calls in stop reason
                if (
                  parsed.candidates?.[0]?.finishReason === "FUNCTION_CALL" ||
                  toolCallBuffers.size > 0
                ) {
                  hasToolCalls = true;
                }

                // If tool calls exist, don't forward ANY chunks - we'll stream only the final response
                // This makes the wrapper transparent: Agora sees one request -> one response stream
                if (hasToolCalls || toolCallBuffers.size > 0) {
                  continue;
                }

                // Forward content chunks - convert Gemini format to OpenAI format for Agora
                if (isGemini) {
                  // Check if this is the final chunk
                  const finishReason =
                    parsed.candidates?.[0]?.finishReason === "STOP"
                      ? "stop"
                      : parsed.candidates?.[0]?.finishReason === "MAX_TOKENS"
                      ? "length"
                      : parsed.candidates?.[0]?.finishReason === "SAFETY"
                      ? "content_filter"
                      : null;

                  if (finishReason) {
                    lastFinishReason = finishReason;
                  }

                  // Send content delta if we have text
                  // IMPORTANT: Break Gemini's full text into small chunks like OpenAI does
                  // Agora expects incremental deltas, not one big chunk
                  if (geminiDeltaText) {
                    // Split the delta text into smaller chunks (words or small phrases)
                    // This simulates OpenAI's streaming behavior
                    const words = geminiDeltaText.split(/(\s+)/);
                    let wordBuffer = "";

                    for (const word of words) {
                      wordBuffer += word;
                      // Send chunks of ~3-5 words to match OpenAI's behavior
                      if (wordBuffer.length > 15 || word.match(/[.!?]\s*$/)) {
                        const convertedChunk = {
                          id: streamId,
                          object: "chat.completion.chunk",
                          created: streamCreated,
                          model: streamModel,
                          choices: [
                            {
                              index: 0,
                              delta: { content: wordBuffer },
                              finish_reason: null,
                            },
                          ],
                        };

                        enqueue(`data: ${JSON.stringify(convertedChunk)}\n\n`);
                        wordBuffer = "";
                      }
                    }

                    // Send any remaining buffer
                    if (wordBuffer) {
                      const convertedChunk = {
                        id: streamId,
                        object: "chat.completion.chunk",
                        created: streamCreated,
                        model: streamModel,
                        choices: [
                          {
                            index: 0,
                            delta: { content: wordBuffer },
                            finish_reason: null,
                          },
                        ],
                      };

                      enqueue(`data: ${JSON.stringify(convertedChunk)}\n\n`);
                    }

                    console.log(
                      `📤 Sent Gemini text as incremental chunks (${words.length} words)`
                    );
                  }

                  // If this chunk has a finish reason, send a separate final chunk
                  if (finishReason) {
                    const finalChunk = {
                      id: streamId,
                      object: "chat.completion.chunk",
                      created: streamCreated,
                      model: streamModel,
                      choices: [
                        {
                          index: 0,
                          delta: {},
                          finish_reason: finishReason,
                        },
                      ],
                    };
                    console.log(
                      `📤 Sending final chunk with finish_reason: ${finishReason}`
                    );
                    enqueue(`data: ${JSON.stringify(finalChunk)}\n\n`);
                  }
                } else if (!isGemini) {
                  // OpenAI format - forward as-is
                  enqueue(`${line}\n\n`);
                }
              } catch (e) {
                // Only forward parse errors if no tool calls
                if (!hasToolCalls && toolCallBuffers.size === 0) {
                  enqueue(`${line}\n\n`);
                }
              }
            }
          }

          // Execute tool calls if any
          // After execution, stream the follow-up response as the single answer to Agora
          if (hasToolCalls && toolCallBuffers.size > 0) {
            console.log(`🛠️ Executing ${toolCallBuffers.size} tool call(s)...`);
            const toolResults: any[] = [];
            for (const toolCall of Array.from(toolCallBuffers.values())) {
              try {
                if (mcpConfigs.length === 0) {
                  console.warn(
                    "⚠️ Tool calls detected but no MCP configs available"
                  );
                  break;
                }

                const toolName = toolCall.function.name;
                const mcp = toolOrigin.get(toolName) || mcpConfigs[0]; // fallback to first MCP

                if (!mcp) {
                  console.error(
                    `❌ No MCP config found for tool ${toolName}, skipping`
                  );
                  toolResults.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: toolName,
                    content: JSON.stringify({
                      error: `No MCP found for tool ${toolName}`,
                    }),
                  });
                  continue;
                }

                console.log(
                  `🔧 Executing tool: ${toolName} on MCP server: ${mcp.name}`
                );
                const args = JSON.parse(toolCall.function.arguments || "{}");
                const mcpResponse = await fetch(mcp.address, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json, text/event-stream",
                    ...(mcp.credentials && {
                      Authorization: `Bearer ${mcp.credentials}`,
                    }),
                  },
                  body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: Date.now(),
                    method: "tools/call",
                    params: { name: toolName, arguments: args },
                  }),
                });

                const mcpText = await mcpResponse.text();
                let result: any = null;
                const mcpCt = mcpResponse.headers.get("content-type") || "";

                // Prefer plain JSON
                if (mcpCt.includes("application/json")) {
                  try {
                    const data = JSON.parse(mcpText);
                    if (data.result) {
                      result = data.result;
                    } else if (data.error) {
                      result = { error: data.error };
                    }
                  } catch (e) {
                    console.error(
                      `❌ Failed to parse JSON result for tool ${toolName}`,
                      e
                    );
                  }
                }

                // Fallback: NDJSON / SSE style
                if (!result) {
                  const lines = mcpText.split("\n");
                  for (const lineRaw of lines) {
                    const line = lineRaw.trim();
                    if (!line) continue;

                    const payload = line.startsWith("data:")
                      ? line.substring(5).trim()
                      : line;

                    try {
                      const data = JSON.parse(payload);
                      if (data.result) {
                        result = data.result;
                        break;
                      }
                      if (data.error) {
                        result = { error: data.error };
                        break;
                      }
                    } catch {
                      // ignore invalid JSON fragment
                    }
                  }
                }

                if (!result) {
                  result = { error: "No result from MCP tool" };
                } else {
                  console.log(
                    `✅ Tool ${toolName} result received from ${mcp.name}`
                  );
                }

                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: "tool",
                  name: toolName,
                  content: JSON.stringify(result),
                });
              } catch (e) {
                console.error(`Tool execution error:`, e);
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: "tool",
                  name: toolCall.function.name,
                  content: JSON.stringify({ error: String(e) }),
                });
              }
            }

            // Follow-up request
            console.log(
              `📤 Sending follow-up request with ${toolResults.length} tool result(s)`
            );

            const basePayload = JSON.parse(llmRequestOptions.body as string);

            let followUpMessages: any[];
            if (isGemini) {
              // Gemini format uses parts array
              const historyMessages = body.contents || body.messages || [];
              const functionCalls = Array.from(toolCallBuffers.values()).map(
                (tc) => ({
                  functionCall: {
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments || "{}"),
                  },
                })
              );

              // Add assistant message with function calls
              const assistantParts: any[] = [];
              if (assistantContent) {
                assistantParts.push({ text: assistantContent });
              }
              assistantParts.push(...functionCalls);

              // Add function responses as parts
              const functionResponses = toolResults.map((tr) => ({
                functionResponse: {
                  name: tr.name,
                  response: tr.content,
                },
              }));

              followUpMessages = [
                ...historyMessages,
                {
                  role: "model",
                  parts: assistantParts,
                },
                {
                  role: "user",
                  parts: functionResponses,
                },
              ];
            } else {
              // OpenAI format
              followUpMessages = [
                ...body.messages,
                {
                  role: "assistant",
                  content: assistantContent || null,
                  tool_calls: Array.from(toolCallBuffers.values()).map(
                    (tc) => ({
                      id: tc.id,
                      type: tc.type,
                      function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                      },
                    })
                  ),
                },
                ...toolResults,
              ];
            }

            const followUpPayload = {
              ...basePayload,
              ...(isGemini
                ? { contents: followUpMessages }
                : { messages: followUpMessages }),
              stream: true, // Keep streaming for consistency
            };

            const followUpResponse = await fetch(llmRequestUrl, {
              ...llmRequestOptions,
              body: JSON.stringify(followUpPayload),
            });

            console.log(
              `📥 Follow-up response status: ${followUpResponse.status}`
            );

            if (followUpResponse.ok) {
              // Stream the follow-up response just like the original
              const followUpReader = followUpResponse.body?.getReader();
              if (followUpReader) {
                const followUpDecoder = new TextDecoder();
                while (true) {
                  const { done, value } = await followUpReader.read();
                  if (done) break;

                  const chunk = followUpDecoder.decode(value, {
                    stream: true,
                  });
                  for (const line of chunk.split("\n")) {
                    if (!line.trim() || line.trim() === "[DONE]") continue;

                    const dataStr = line.startsWith("data: ")
                      ? line.substring(6)
                      : line;
                    try {
                      const parsed = JSON.parse(dataStr);

                      // Use consistent IDs for continuation
                      if (parsed.id && !streamId) streamId = parsed.id;
                      if (parsed.created && !streamCreated)
                        streamCreated = parsed.created;
                      if (parsed.model && !streamModel)
                        streamModel = parsed.model;

                      const id =
                        streamId || parsed.id || `chatcmpl-${Date.now()}`;
                      const created =
                        streamCreated ||
                        parsed.created ||
                        Math.floor(Date.now() / 1000);
                      const model = streamModel || parsed.model || body.model;

                      // Convert Gemini format to OpenAI format for Agora
                      let responseToSend: any;
                      if (isGemini && parsed.candidates?.[0]) {
                        // Convert Gemini response to OpenAI format
                        const geminiContent = parsed.candidates[0].content;
                        const textParts =
                          geminiContent?.parts
                            ?.filter((p: any) => p.text)
                            .map((p: any) => p.text)
                            .join("") || "";

                        responseToSend = {
                          id,
                          object: "chat.completion.chunk",
                          created,
                          model,
                          choices: [
                            {
                              index: 0,
                              delta: { content: textParts },
                              finish_reason:
                                parsed.candidates[0].finishReason === "STOP"
                                  ? "stop"
                                  : null,
                            },
                          ],
                        };
                      } else {
                        // OpenAI format
                        responseToSend = {
                          ...parsed,
                          id,
                          created,
                          model,
                        };
                      }

                      enqueue(`data: ${JSON.stringify(responseToSend)}\n\n`);
                    } catch (e) {
                      enqueue(`${line}\n\n`);
                    }
                  }
                }
                console.log(`✅ Streamed follow-up response`);
              } else {
                console.warn(`⚠️ Follow-up response has no body`);
              }
            } else {
              const errorText = await followUpResponse.text();
              console.error(
                `❌ Follow-up request failed: ${followUpResponse.status}`,
                errorText.substring(0, 200)
              );
              enqueue(
                `data: ${JSON.stringify({
                  error: `Follow-up failed: ${errorText.substring(0, 200)}`,
                })}\n\n`
              );
            }
          }

          enqueue("data: [DONE]\n\n");
          controller.close();
        } catch (error: any) {
          enqueue(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          enqueue("data: [DONE]\n\n");
          controller.close();
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
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
}
