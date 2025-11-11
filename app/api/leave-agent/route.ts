import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      agentId,
      // User-provided credentials (for live demo)
      appId: userAppId,
      customerId: userCustomerId,
      customerSecret: userCustomerSecret,
    } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: "Agent ID is required" },
        { status: 400 }
      );
    }

    // Use credentials from request body (for live demo) or fall back to env vars (for development)
    const appId = userAppId || process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const customerId = userCustomerId || process.env.AGORA_CUSTOMER_ID;
    const customerSecret = userCustomerSecret || process.env.AGORA_CUSTOMER_SECRET;

    if (!appId || !customerId || !customerSecret) {
      return NextResponse.json(
        { error: "Missing Agora credentials. Please configure your credentials in Settings." },
        { status: 400 }
      );
    }

    console.log("🛑 LEAVING AGENT");
    console.log(
      `Endpoint: https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`
    );

    // Call Agora API to leave the agent
    const response = await fetch(
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${customerId}:${customerSecret}`
          ).toString("base64")}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ AGENT LEAVE FAILED");
      console.error("Status:", response.status);
      console.error("Error:", errorText);
      return NextResponse.json(
        { error: "Failed to leave agent", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log("✅ AGENT LEFT SUCCESSFULLY ✅");
    console.log("Response:", result);
    console.log("================================");

    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ LEAVE AGENT ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
