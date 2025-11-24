import { NextRequest, NextResponse } from "next/server";

/**
 * API Route: Send Message to Agent via RTM
 * 
 * This endpoint sends a message to the Agora Conversational AI agent
 * using RTM peer messages. This allows the agent to be aware of
 * code changes, imports, or other context updates.
 * 
 * Reference: https://github.com/jayalbo/hey_agora/blob/blog/src/app/api/agent/message/route.ts
 */
export async function POST(request: NextRequest) {
  try {
    const { message, agentUid, appId, customerId, customerSecret } = await request.json();

    if (!message || !agentUid || !appId || !customerId || !customerSecret) {
      return NextResponse.json(
        { error: "Missing required parameters: message, agentUid, appId, customerId, customerSecret" },
        { status: 400 }
      );
    }

    const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString(
      "base64"
    );

    // Send RTM peer message to the agent
    // Reference: https://docs.agora.io/en/real-time-messaging/restfulapi/
    const url = `https://api.agora.io/dev/v2/project/${appId}/rtm/users/Server/peer_messages`;
    const requestBody = {
      destination: agentUid, // The bot's RTM UID (string)
      payload: message,
      custom_type: "user.transcription", // Required for agent to process the message
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("RTM message error:", response.status, errorData);
      return NextResponse.json(
        { error: `Failed to send message to agent: ${errorData}` },
        { status: response.status }
      );
    }

    const responseData = await response.json();
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error sending message to agent:", error);
    return NextResponse.json(
      { error: "Failed to send message to agent" },
      { status: 500 }
    );
  }
}

