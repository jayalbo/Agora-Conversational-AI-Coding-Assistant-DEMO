"use client";

import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import { html as beautifyHtml } from "js-beautify";

interface CodeHighlightProps {
  code: string;
  language?: string;
  theme?: string;
}

export default function CodeHighlight({
  code,
  language = "html",
  theme = "github-dark",
}: CodeHighlightProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const highlightCode = async () => {
      try {
        // Format the code first (prettify)
        let formattedCode = code;
        if (language === "html") {
          formattedCode = beautifyHtml(code, {
            indent_size: 2,
            wrap_line_length: 80,
            preserve_newlines: true,
            max_preserve_newlines: 2,
          });
        }

        // Then highlight with Shiki
        const html = await codeToHtml(formattedCode, {
          lang: language,
          theme: theme,
        });

        setHighlightedCode(html);
      } catch (error) {
        console.error("Failed to highlight code:", error);
        // Fallback to plain text with escaped HTML
        const escaped = code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
        setHighlightedCode(`<pre style="background: #0d1117; color: #c9d1d9; padding: 1rem; overflow: auto;"><code>${escaped}</code></pre>`);
      } finally {
        setIsLoading(false);
      }
    };

    highlightCode();
  }, [code, language, theme]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0d1117]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-slate-400 text-sm">Highlighting code...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full overflow-auto shiki-wrapper"
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
      style={{
        fontSize: "14px",
        lineHeight: "1.5",
        backgroundColor: "#0d1117",
      }}
    />
  );
}

