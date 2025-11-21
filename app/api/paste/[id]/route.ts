import { NextRequest, NextResponse } from "next/server";

/**
 * API Route: Fetch Paste Content from paste.fyi
 * 
 * This is a simple proxy to avoid CORS issues when fetching pastes.
 * No data is stored - we just forward the request to paste.fyi.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    console.log("Fetching paste with ID:", id);

    if (!id) {
      return NextResponse.json(
        { error: "Paste ID is required" },
        { status: 400 }
      );
    }

    // Fetch from paste.fyi (returns content directly)
    const pasteUrl = `https://paste.fyi/${id}`;
    console.log("Fetching from:", pasteUrl);
    
    const response = await fetch(pasteUrl);
    console.log("paste.fyi response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("paste.fyi error response:", errorText);
      
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Paste not found or expired" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch paste" },
        { status: response.status }
      );
    }

    const content = await response.text();
    console.log("Fetched content length:", content.length);

    if (!content || content.trim() === '') {
      return NextResponse.json(
        { error: "Empty paste content" },
        { status: 404 }
      );
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Paste fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch paste" },
      { status: 500 }
    );
  }
}

