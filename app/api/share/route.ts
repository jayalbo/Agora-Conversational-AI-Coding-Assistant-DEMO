import { NextRequest, NextResponse } from "next/server";

/**
 * API Route: Share Code via dpaste.org
 * 
 * This is a simple proxy to avoid CORS issues when creating pastes.
 * No user data is stored - we just forward to dpaste.org and return the ID.
 */
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: "Code is required" },
        { status: 400 }
      );
    }

    // Create paste on dpaste.org
    const formData = new URLSearchParams();
    formData.append('content', code);
    formData.append('syntax', 'html');
    formData.append('expiry_days', '365'); // 1 year

    const response = await fetch("https://dpaste.org/api/", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      console.error("dpaste error:", response.status);
      return NextResponse.json(
        { error: "Failed to create paste" },
        { status: response.status }
      );
    }

    // dpaste returns the URL directly as text: "https://dpaste.org/XXXXX"
    const pasteUrl = await response.text();
    
    // Clean up and extract ID
    const cleanUrl = pasteUrl.trim().replace(/['"]/g, '');
    const pasteId = cleanUrl.split('/').pop();

    console.log("Paste created:", pasteId);

    return NextResponse.json({ 
      id: pasteId,
      url: `${process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin}/view/${pasteId}`
    });
  } catch (error) {
    console.error("Share API error:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}

