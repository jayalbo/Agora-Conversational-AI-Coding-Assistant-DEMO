import { NextRequest, NextResponse } from "next/server";

/**
 * API Route: Share Code via paste.fyi
 * 
 * This is a simple proxy to avoid CORS issues when creating pastes.
 * Uses paste.fyi - a simple and reliable paste service.
 * No user data is stored - we just forward to paste.fyi and return the ID.
 * 
 * Format: POST to https://paste.fyi with form field "paste"
 * Returns: URL like https://paste.fyi/XXXXX
 */

// Route segment config
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: "Code is required" },
        { status: 400 }
      );
    }

    // Use paste.fyi - simple and reliable paste service
    // Format: POST to https://paste.fyi with form field "paste"
    const formData = new URLSearchParams();
    formData.append('paste', code);

    const response = await fetch("https://paste.fyi", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    let pasteId = '';
    let pasteUrl = '';

    if (!response.ok) {
      console.error("All paste services failed. Last error:", response.status, response.statusText);
      const errorText = await response.text().catch(() => '');
      console.error("Error response:", errorText);
      
      return NextResponse.json(
        { 
          error: "Unable to create share link. The paste service is currently unavailable.",
          details: `External service returned ${response.status}. dpaste.org is known to be down. You can still copy the code manually using the copy button.`,
          suggestion: "Please use the 'Copy Code' button to share your code manually."
        },
        { status: 503 }
      );
    }

    // paste.fyi returns the URL directly as plain text
    const responseText = (await response.text()).trim();
    
    // Extract the paste ID from the URL
    // Response format: https://paste.fyi/XXXXX
    if (responseText.startsWith('http://') || responseText.startsWith('https://')) {
      pasteUrl = responseText;
      pasteId = pasteUrl.split('/').pop()?.split('?')[0] || '';
    } else if (response.headers.get('location')) {
      pasteUrl = response.headers.get('location') || '';
      pasteId = pasteUrl.split('/').pop()?.split('?')[0] || '';
    } else {
      // If response is just an ID or path, construct the full URL
      const id = responseText.replace(/^\/+/, '').split('/')[0];
      pasteId = id;
      pasteUrl = `https://paste.fyi/${pasteId}`;
    }

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
