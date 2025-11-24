"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, Code, Download, Copy, Check } from "lucide-react";
import CodeHighlight from "@/app/components/CodeHighlight";

export default function ViewSharedCode() {
  const params = useParams();
  const gistId = params.gistId as string;
  
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchPaste = async () => {
      try {
        // Fetch via our backend proxy (avoids CORS)
        const response = await fetch(`/api/paste/${gistId}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 404) {
            throw new Error("Code not found. This link may be invalid or expired.");
          }
          throw new Error(errorData.error || "Failed to load shared code");
        }

        const data = await response.json();
        
        if (!data.content || data.content.trim() === '') {
          throw new Error("No code found in this share link");
        }

        setCode(data.content);
      } catch (err) {
        console.error("Failed to fetch paste:", err);
        setError(err instanceof Error ? err.message : "Failed to load code");
      } finally {
        setLoading(false);
      }
    };

    fetchPaste();
  }, [gistId]);

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shared-code-${gistId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-300">Loading shared code...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2">Oops!</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Go to Demo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Demo</span>
            </Link>
            <div className="h-6 w-px bg-slate-700"></div>
            <h1 className="text-lg font-semibold">Shared Code</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition text-sm font-semibold"
              title="Copy code to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span className="hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline">Copy Code</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowSource(!showSource)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition text-sm"
            >
              {showSource ? (
                <>
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">Preview</span>
                </>
              ) : (
                <>
                  <Code className="w-4 h-4" />
                  <span className="hidden sm:inline">Source</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition text-sm font-semibold"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
          </div>
        </div>
      </header>

      {/* Code Preview */}
      <div className="container mx-auto px-4 py-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-lg shadow-xl overflow-hidden relative" style={{ height: "calc(100vh - 140px)" }}>
          {showSource ? (
            <div className="w-full h-full relative">
              <button
                onClick={handleCopyCode}
                className="absolute top-4 right-4 z-50 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-xs font-semibold transition flex items-center gap-1.5 shadow-lg"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <CodeHighlight 
                code={code} 
                language="html"
                theme="github-dark"
              />
            </div>
          ) : (
            <iframe
              srcDoc={code}
              title="Code Preview"
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
            />
          )}
        </div>

        {/* Call to Action */}
        <div className="mt-6 text-center">
          <p className="text-slate-400 mb-3">
            Want to create your own AI-generated code?
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition text-black hover:brightness-110"
            style={{
              backgroundImage:
                "linear-gradient(270deg, #00c2ff, #a0faff 33%, #fcf9f8 66%, #c46ffb)",
            }}
          >
            Try the Demo
          </Link>
        </div>
      </div>
    </div>
  );
}

