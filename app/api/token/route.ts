import { NextRequest, NextResponse } from "next/server";
import { RtcTokenBuilder, RtcRole } from "agora-token";

export async function POST(request: NextRequest) {
  try {
    const { channelName, uid } = await request.json();

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      return NextResponse.json(
        { error: "Missing Agora credentials" },
        { status: 500 }
      );
    }

    if (!channelName) {
      return NextResponse.json(
        { error: "Channel name is required" },
        { status: 400 }
      );
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600; // 1 hour

    // Generate a single token with both RTC and RTM2 privileges
    const token = RtcTokenBuilder.buildTokenWithRtm2(
      appId,
      appCertificate,
      channelName,
      uid || 0, // RTC account (numeric UID)
      role,
      expirationTimeInSeconds, // RTC token expire
      expirationTimeInSeconds, // join channel privilege expire
      expirationTimeInSeconds, // pub audio privilege expire
      expirationTimeInSeconds, // pub video privilege expire
      expirationTimeInSeconds, // pub data stream privilege expire
      String(uid || 0), // RTM user ID (string version of UID)
      expirationTimeInSeconds // RTM token expire
    );

    console.log("\n=== TOKEN GENERATED ===");
    console.log("App ID:", appId);
    console.log("Channel:", channelName);
    console.log("UID:", uid || 0);
    console.log("UID as string:", String(uid || 0));
    console.log("Token:", token);
    console.log("Token Length:", token.length);
    console.log("Token Prefix:", token.substring(0, 10));
    console.log("======================\n");

    return NextResponse.json({
      token,
      uid: uid || 0,
      expiresAt: Math.floor(Date.now() / 1000) + expirationTimeInSeconds,
    });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
