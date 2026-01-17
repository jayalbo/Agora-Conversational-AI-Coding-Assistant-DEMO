"use client";

// Force dynamic rendering to prevent SSR issues with browser APIs
export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import type { AgoraConversationalClient as AgoraClientType, AgentStatus } from "@/lib/agora-client";
import JSZip from "jszip";
import {
  Mic,
  MicOff,
  LogOut,
  Settings,
  Share2,
  Download,
  Upload,
  Link as LinkIcon,
  Send,
  Moon,
  Sun,
  Eye,
  Code,
  X,
} from "lucide-react";
import SettingsModal, {
  type UserCredentials,
} from "./components/SettingsModal";
import CodeHighlight from "./components/CodeHighlight";

interface TranscriptMessage {
  id: string;
  type: "user" | "agent";
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

interface CodeBlock {
  id: string;
  html: string;
  timestamp: Date;
}

// Helper function to format HTML code for better readability
function formatHTML(html: string): string {
  let formatted = "";
  let indent = 0;
  const tab = "  "; // 2 spaces

  // Simple HTML formatter
  html.split(/(<[^>]+>)/g).forEach((token) => {
    if (!token.trim()) return;

    if (token.startsWith("</")) {
      // Closing tag - decrease indent before adding
      indent = Math.max(0, indent - 1);
      formatted += "\n" + tab.repeat(indent) + token;
    } else if (
      token.startsWith("<") &&
      !token.endsWith("/>") &&
      !token.startsWith("<!")
    ) {
      // Opening tag - add then increase indent
      formatted += "\n" + tab.repeat(indent) + token;
      // Don't increase indent for self-closing-like tags or inline tags
      if (!token.match(/<(br|hr|img|input|meta|link)/i)) {
        indent++;
      }
    } else if (token.startsWith("<")) {
      // Self-closing or doctype
      formatted += "\n" + tab.repeat(indent) + token;
    } else {
      // Text content
      const trimmed = token.trim();
      if (trimmed) {
        formatted += "\n" + tab.repeat(indent) + trimmed;
      }
    }
  });

  return formatted.trim();
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [codeBlocks, setCodeBlocks] = useState<CodeBlock[]>([]);
  const [currentCode, setCurrentCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [showSourceCode, setShowSourceCode] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [credentials, setCredentials] = useState<UserCredentials | null>(null);
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [showLoadImportModal, setShowLoadImportModal] = useState(false);
  const [loadImportTab, setLoadImportTab] = useState<"load" | "import">(
    "import"
  );
  const [loadUrl, setLoadUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>(
    []
  );
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>("");
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [chatMessage, setChatMessage] = useState<string>("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("silent");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [panelWidth, setPanelWidth] = useState(80); // Percentage for preview panel
  const [isResizing, setIsResizing] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  const agoraClientRef = useRef<AgoraClientType | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);

  // Load credentials from localStorage on mount
  useEffect(() => {
    // Load theme preference - apply immediately to prevent flash
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
      document.documentElement.className = initialTheme;
      setTheme(initialTheme);
      
      // Load saved panel width
      const savedWidth = localStorage.getItem("panelWidth");
      if (savedWidth) {
        setPanelWidth(parseFloat(savedWidth));
      }
    }

    const savedCredentials = localStorage.getItem("agoraCredentials");
    if (savedCredentials) {
      try {
        const parsed = JSON.parse(savedCredentials);
        // Migrate old credentials that don't have llmProvider or llmModel
        if (!parsed.llmProvider) {
          parsed.llmProvider = "openai";
        }
        if (!parsed.llmModel) {
          parsed.llmModel =
            parsed.llmProvider === "gemini"
              ? "gemini-3-flash-preview"
              : "gpt-4o-mini";
        }
        setCredentials(parsed);
        setCredentialsConfigured(true);
      } catch (err) {
        console.error("Failed to parse saved credentials:", err);
      }
    }

    // Only run in browser
    if (typeof window === "undefined") {
      return;
    }

    // Load saved microphone device preference
    const savedDeviceId = localStorage.getItem("selectedMicrophoneId");
    if (savedDeviceId) {
      setSelectedMicrophoneId(savedDeviceId);
    }

    // Enumerate microphone devices
    loadMicrophoneDevices();
  }, []);

  // Apply theme to document when it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.className = theme;
      localStorage.setItem("theme", theme);
    }
  }, [theme]);

  // Check if we're on a large screen
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };
    
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Toggle theme function
  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // Panel resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    
    let animationFrameId: number | null = null;
    let lastWidth = panelWidth;
    
    // Disable pointer events on preview panel content during resize to prevent interference
    const previewPanel = document.querySelector('.preview-panel') as HTMLElement;
    if (previewPanel) {
      previewPanel.style.pointerEvents = 'none';
    }
    
    const handleResizeMove = (e: MouseEvent) => {
      if (!panelContainerRef.current) return;
      
      // Use requestAnimationFrame to throttle updates and prevent breaking during fast drags
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      
      animationFrameId = requestAnimationFrame(() => {
        if (!panelContainerRef.current) return;
        
        const rect = panelContainerRef.current.getBoundingClientRect();
        const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
        
        // Constrain between 40% and 85% for preview panel (more conservative to prevent breaking)
        // Also ensure chat panel doesn't get too narrow (minimum 250px = ~20% on typical screens)
        const maxPreviewWidth = rect.width > 1250 ? 85 : 80; // Allow more room for chat on smaller screens
        const constrainedWidth = Math.max(40, Math.min(maxPreviewWidth, newWidth));
        
        // Only update if the change is significant to reduce unnecessary re-renders
        if (Math.abs(constrainedWidth - lastWidth) > 0.5) {
          lastWidth = constrainedWidth;
          setPanelWidth(constrainedWidth);
        }
      });
    };

    const handleResizeEnd = (e: MouseEvent) => {
      e.preventDefault();
      setIsResizing(false);
      // Re-enable pointer events on preview panel
      if (previewPanel) {
        previewPanel.style.pointerEvents = '';
      }
      // Save final width to localStorage
      localStorage.setItem("panelWidth", panelWidth.toString());
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Re-enable pointer events on preview panel in case cleanup happens during resize
      if (previewPanel) {
        previewPanel.style.pointerEvents = '';
      }
    };
  }, [isResizing, panelWidth]);

  // Load available microphone devices
  const loadMicrophoneDevices = async () => {
    // Only run in browser
    if (typeof window === "undefined" || !navigator.mediaDevices) {
      return;
    }

    try {
      // Dynamically import to avoid SSR issues
      const { AgoraConversationalClient } = await import("@/lib/agora-client");

      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const devices = await AgoraConversationalClient.getMicrophoneDevices();
      setMicrophoneDevices(devices);

      // If no device is selected and devices are available, select the first one
      const savedDeviceId = localStorage.getItem("selectedMicrophoneId");
      if (!savedDeviceId && devices.length > 0) {
        const firstDeviceId = devices[0].deviceId;
        setSelectedMicrophoneId(firstDeviceId);
        localStorage.setItem("selectedMicrophoneId", firstDeviceId);
      }
    } catch (error) {
      console.error("Failed to load microphone devices:", error);
    }
  };

  // Save credentials handler
  const handleSaveCredentials = (newCredentials: UserCredentials) => {
    setCredentials(newCredentials);
    setCredentialsConfigured(true);
    localStorage.setItem("agoraCredentials", JSON.stringify(newCredentials));
  };

  useEffect(() => {
    // Scroll the transcript container to bottom, not the whole page
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop =
        transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  useEffect(() => {
    // Track if iframe is focused
    let iframeFocused = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const target = e.target as HTMLElement;

        // Allow arrow keys in form elements
        const isInputElement =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.contentEditable === "true";

        // Only prevent scrolling when iframe is focused (for games) or not in form elements
        if (!isInputElement && (iframeFocused || target.closest("iframe"))) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    };

    // Listen for iframe focus events
    const handleFocus = (e: FocusEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "IFRAME") {
        iframeFocused = true;
      }
    };

    const handleBlur = (e: FocusEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "IFRAME") {
        iframeFocused = false;
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focus", handleFocus, true);
    document.addEventListener("blur", handleBlur, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focus", handleFocus, true);
      document.removeEventListener("blur", handleBlur, true);
    };
  }, []);

  /**
   * Parses AI agent responses to separate spoken text from code blocks.
   *
   * The AI wraps code in Chinese square brackets 【】 which:
   * 1. Are skipped by TTS (skip_patterns: [2] in agent config)
   * 2. Don't conflict with JSON/JavaScript syntax like [] or ()
   * 3. Are easily parsed with regex
   *
   * @param text - Full AI response including spoken text and code
   * @returns Object with spokenText (for transcript) and codes (for preview)
   */
  const parseAgentResponse = (text: string) => {
    // Match HTML/CSS/JS code blocks wrapped in Chinese square brackets 【】
    // This handles cases where LLM might include markdown fences or extra text
    const codeRegex = /【[\s\S]*?】/gi;

    const codes: string[] = [];
    let spokenText = text;

    // Extract all code blocks and remove them from spoken text
    const matches = Array.from(text.matchAll(codeRegex));
    for (const match of matches) {
      let content = match[0].slice(1, -1); // Remove the 【 and 】

      // Clean up markdown code fences if present (sometimes AI adds them)
      content = content.replace(/^```[\w]*\n?/g, "").replace(/```$/g, "");
      content = content.trim();

      // Validate it's actual HTML before adding to codes array
      // This prevents false positives from other bracket usage
      if (content.includes("<html") || content.includes("<!DOCTYPE")) {
        codes.push(content);
        spokenText = spokenText.replace(match[0], ""); // Remove the entire 【code】 from spoken text
      }
    }

    return {
      spokenText: spokenText.trim(), // Text WITHOUT code blocks (to display in transcript)
      codes, // Array of extracted code blocks (to render in preview)
    };
  };

  /**
   * Initializes a new conversational AI session.
   *
   * Flow:
   * 1. Generate unique channel name (isolates each session)
   * 2. Get RTC+RTM2 token from server (security: never expose App Certificate)
   * 3. Start Agora Conversational AI agent via REST API
   * 4. Initialize local Agora client (RTC for audio, RTM for transcripts)
   * 5. Auto-start microphone after connection established
   *
   * Note: We reset all UI state here (transcript, code) for a fresh start.
   * Previous session's code remains visible until this fires.
   */
  const handleConnect = async () => {
    // Check if credentials are configured
    if (!credentials || !credentialsConfigured) {
      setError("Please configure your credentials in Settings first.");
      setShowSettings(true);
      return;
    }

    setIsConnecting(true);
    setError("");

    // Reset all state when starting a new session
    // This gives users a clean slate while preserving previous session's code until now
    setTranscript([]);
    setCodeBlocks([]);
    setCurrentCode("");
    setShowSourceCode(false);

    try {
      const appId = credentials.agoraAppId;
      const botUid = credentials.agoraBotUid;

      // Generate random channel name to ensure session isolation
      // Format: "agora-ai-" + random alphanumeric string
      const channel = `agora-ai-${Math.random().toString(36).substring(2, 15)}`;
      const uid = Math.floor(Math.random() * 1000000);
      const botUidNum = parseInt(botUid, 10);

      // Generate token with user credentials
      const tokenResponse = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelName: channel,
          uid,
          appId: credentials.agoraAppId,
          appCertificate: credentials.agoraAppCertificate,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(errorData.error || "Failed to generate token");
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.token;

      // Dynamically import Agora client (client-side only)
      const AgoraModule = await import("@/lib/agora-client");

      // Initialize Agora client with single token (has both RTC and RTM privileges)
      const client = new AgoraModule.AgoraConversationalClient(
        appId,
        channel,
        token,
        uid,
        botUidNum
      );

      /**
       * Set up status callback to handle agent status updates.
       */
      client.setStatusCallback((status: AgentStatus) => {
        console.log("Agent status changed:", status);
        setAgentStatus(status);
      });

      /**
       * Set up transcription callback to handle incoming messages.
       *
       * This callback fires for BOTH interim and final messages:
       * - Interim: Streaming updates as AI generates response (isFinal: false)
       * - Final: Complete message ready for display (isFinal: true)
       *
       * We use interim messages to show loading indicators early,
       * but only display/render on final messages.
       */
      client.setTranscriptionCallback((message: any) => {
        console.log("🎤 Transcription callback received:", message);

        // Parse to separate spoken text from code blocks
        // This splits "Here's a button 【<html>...</html>】 you can click"
        // into spokenText: "Here's a button you can click"
        // and codes: ["<html>...</html>"]
        const { spokenText, codes } = parseAgentResponse(message.text);

        console.log("  - Spoken text:", spokenText);
        console.log("  - Code blocks found:", codes.length);
        console.log("  - isFinal:", message.isFinal);

        // Detect if this is the greeting message (don't show loading for it)
        const isGreeting =
          spokenText.toLowerCase().includes("hello") &&
          spokenText.toLowerCase().includes("coding assistant");

        // Detect if the response contains Chinese opening bracket (indicates code generation)
        // Check the original message.text since parseAgentResponse strips the brackets
        const hasChineseOpenBracket = message.text?.includes("【");

        // Smart loading indicator: Show "Generating code..." when we detect code
        // Turn on as soon as we see 【 in interim message
        // Turn off when final message arrives
        if (message.type === "agent" && !isGreeting && hasChineseOpenBracket) {
          if (!message.isFinal) {
            // Agent is streaming code - show loading spinner
            setIsGeneratingCode(true);
          } else if (message.isFinal) {
            // Code generation complete - hide loading spinner
            setIsGeneratingCode(false);
          }
        } else if (
          message.type === "agent" &&
          message.isFinal &&
          !hasChineseOpenBracket
        ) {
          // Non-code message finished - make sure loading is off
          setIsGeneratingCode(false);
        }

        // Show both interim and final messages in transcript
        // Update interim messages in real-time, then replace with final when it arrives
        if (spokenText) {
          // Filter out code notification messages (they start with "Current code context")
          const isCodeNotification =
            spokenText.includes("Current code context") ||
            spokenText.includes("I've imported new code") ||
            spokenText.includes("I've loaded new code");

          if (!isCodeNotification) {
            setTranscript((prev) => {
              // If this is an interim message, find and replace the last interim message of the same type
              // If this is a final message, find and replace the last interim message of the same type, or add it
              
              // Find the last interim message of the same type (search backwards)
              let lastInterimIndex = -1;
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].type === message.type && !prev[i].isFinal) {
                  lastInterimIndex = i;
                  break;
                }
              }
              
              if (!message.isFinal) {
                // Interim message - replace existing interim or add new one
                if (lastInterimIndex !== -1) {
                  // Replace the existing interim message
                  const updated = [...prev];
                  updated[lastInterimIndex] = {
                    id: updated[lastInterimIndex].id, // Keep the same ID
                    type: message.type,
                    text: spokenText,
                    timestamp: new Date(),
                    isFinal: false,
                  };
                  return updated;
                } else {
                  // No existing interim message, add new one
                  return [
                    ...prev,
                    {
                      id: `${Date.now()}-${Math.random()}`,
                      type: message.type,
                      text: spokenText,
                      timestamp: new Date(),
                      isFinal: false,
                    },
                  ];
                }
              } else {
                // Final message - replace the last interim of the same type, or add it
                if (lastInterimIndex !== -1) {
                  // Replace the interim message with the final one
                  const updated = [...prev];
                  updated[lastInterimIndex] = {
                    id: updated[lastInterimIndex].id, // Keep the same ID
                    type: message.type,
                    text: spokenText,
                    timestamp: new Date(),
                    isFinal: true,
                  };
                  return updated;
                } else {
                  // No interim message found, add the final one
                  return [
                    ...prev,
                    {
                      id: `${Date.now()}-${Math.random()}`,
                      type: message.type,
                      text: spokenText,
                      timestamp: new Date(),
                      isFinal: true,
                    },
                  ];
                }
              }
            });
          }
        }

        // Auto-render code blocks in preview pane (only on final message)
        // Each code block becomes a versioned entry in the codeBlocks array
        if (codes.length > 0 && message.isFinal) {
          codes.forEach((code, idx) => {
            console.log(
              `  - Code block ${idx + 1}:`,
              code.substring(0, 100) + "..."
            );
            const newCodeBlock = {
              id: `${Date.now()}-${Math.random()}-${idx}`,
              html: code,
              timestamp: new Date(),
            };
            setCodeBlocks((prev) => [...prev, newCodeBlock]);
            setCurrentCode(code); // Latest code becomes the active preview
          });
        }
      });

      // Simple flow: Create mic track -> Join -> Publish -> Start agent

      // Step 1: Create microphone track
      const deviceId = selectedMicrophoneId || undefined;
      await client.createMicrophoneTrack(deviceId);
      setIsMicActive(true);

      // Step 2: Join the channel
      await client.joinChannel();

      // Step 3: Initialize RTM for transcriptions
      await client.initializeRTM();

      // Step 4: Publish microphone track
      await client.publishMicrophone();

      agoraClientRef.current = client;
      setIsConnected(true);
      setError("");

      // Step 5: Now start the conversational AI agent
      console.log("Starting agent for channel:", channel);
      const agentResponse = await fetch("/api/start-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelName: channel,
          uid,
          appId: credentials.agoraAppId,
          appCertificate: credentials.agoraAppCertificate,
          customerId: credentials.agoraCustomerId,
          customerSecret: credentials.agoraCustomerSecret,
          botUid: credentials.agoraBotUid,
          llmProvider: credentials.llmProvider,
          llmUrl: credentials.llmUrl,
          llmApiKey: credentials.llmApiKey,
          llmModel: credentials.llmModel,
          ttsApiKey: credentials.ttsApiKey,
          ttsRegion: credentials.ttsRegion,
          mcps: credentials.mcps,
        }),
      });

      if (!agentResponse.ok) {
        const errorData = await agentResponse.json();
        console.error("Agent start failed:", errorData);
        throw new Error(
          errorData.error || "Failed to start conversational AI agent"
        );
      }

      const agentData = await agentResponse.json();
      console.log("Agent started successfully:", agentData);

      // Store the agent ID for later cleanup
      setAgentId(agentData.agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      console.error("Connection error:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Ends the current session and cleans up resources.
   *
   * Important: This preserves the preview and generated code so users can
   * examine results after ending the session. Code is only cleared when
   * starting a NEW session (see handleConnect).
   *
   * Cleanup order:
   * 1. Stop the AI agent on Agora's servers (via REST API)
   * 2. Disconnect local RTC client (stops audio streaming)
   * 3. Disconnect RTM client (stops transcription messages)
   * 4. Reset UI state (connection indicators, transcript)
   * 5. Preserve code state (preview, code blocks, source view)
   */
  const handleDisconnect = async () => {
    // First, leave the conversational AI agent if we have an agentId
    // This tells Agora's servers to stop the agent and release resources
    if (agentId && credentials) {
      try {
        console.log("Leaving conversational AI agent:", agentId);
        await fetch("/api/leave-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            appId: credentials.agoraAppId,
            customerId: credentials.agoraCustomerId,
            customerSecret: credentials.agoraCustomerSecret,
          }),
        });
        console.log("Successfully left conversational AI agent");
      } catch (error) {
        console.error("Failed to leave agent:", error);
        // Don't block the disconnect process if leave fails
        // Local cleanup should proceed regardless
      }
      setAgentId(null);
    }

    // Then disconnect the Agora client (RTC + RTM)
    // This stops microphone, leaves channel, unsubscribes from messages
    if (agoraClientRef.current) {
      await agoraClientRef.current.disconnect();
      agoraClientRef.current = null;
    }

    // Clear any lingering loading states
    setIsGeneratingCode(false);

    // Reset connection state only (keep preview and code intact)
    setIsConnected(false);
    setIsMicActive(false);
    setIsMuted(false);
    setIsGeneratingCode(false);
    setAgentStatus("silent");
    setError("");
    setTranscript([]); // Clear conversation history

    // DON'T clear codeBlocks, currentCode, or showSourceCode
    // Users should be able to view and export code after ending session
    // These will be reset when starting a NEW session (see handleConnect)
  };

  const handleToggleMute = async () => {
    if (!agoraClientRef.current) return;

    try {
      const newMutedState = !isMuted;
      await agoraClientRef.current.setMuted(newMutedState);
      setIsMuted(newMutedState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle mute");
      console.error("Toggle mute error:", err);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const handleShare = async () => {
    if (!currentCode) return;

    setIsSharing(true);
    setShareError(null);

    try {
      // Create paste via our backend proxy (avoids CORS)
      const response = await fetch("/api/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: currentCode }),
      });

      console.log("Share API response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Share API error:", errorData);
        throw new Error(errorData.error || "Failed to create share link");
      }

      const data = await response.json();
      console.log("Paste created successfully:", data.id);

      const shareableUrl = data.url;

      // Copy to clipboard
      await navigator.clipboard.writeText(shareableUrl);
      setShareUrl(shareableUrl);
    } catch (err) {
      console.error("Share error:", err);
      setShareError(
        err instanceof Error ? err.message : "Failed to create share link"
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 2000);
    }
  };

  // Helper function to notify the AI agent about code changes
  // Only called when agent is connected (button is disabled otherwise)
  const notifyAgentAboutCode = async (
    code: string,
    source: "imported" | "loaded"
  ) => {
    if (!isConnected || !credentials || !agentId) {
      console.log("Skipping agent notification - agent not ready");
      return;
    }

    try {
      // Create a message informing the agent about the code
      // Using a system message format that won't appear in transcript
      const message = `Current code context:\n\n${code}\n\nPlease be aware of this code when responding.`;

      await fetch("/api/agent/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          agentUid: credentials.agoraBotUid, // Bot's RTM UID (string)
          appId: credentials.agoraAppId,
          customerId: credentials.agoraCustomerId,
          customerSecret: credentials.agoraCustomerSecret,
        }),
      });

      console.log(`Agent notified about ${source} code`);
    } catch (err) {
      console.error("Failed to notify agent about code:", err);
      // Don't throw - this is a nice-to-have feature
    }
  };

  const handleLoadFromUrl = async () => {
    if (!loadUrl.trim()) {
      setLoadError("Please enter a URL");
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      // Extract paste ID from URL (supports paste.fyi URLs and our view URLs)
      let pasteId = "";
      const url = loadUrl.trim();

      // Check if it's a paste.fyi URL
      if (url.includes("paste.fyi/")) {
        pasteId =
          url.split("paste.fyi/")[1]?.split("/")[0]?.split("?")[0] || "";
      }
      // Check if it's our view URL
      else if (url.includes("/view/")) {
        pasteId = url.split("/view/")[1]?.split("/")[0]?.split("?")[0] || "";
      }
      // Assume it's just an ID
      else {
        pasteId = url.split("/").pop()?.split("?")[0] || url;
      }

      if (!pasteId) {
        throw new Error("Could not extract paste ID from URL");
      }

      // Fetch the paste content
      const response = await fetch(`/api/paste/${pasteId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load code from URL");
      }

      const data = await response.json();

      if (!data.content || data.content.trim() === "") {
        throw new Error("No code found in this URL");
      }

      // Set the loaded code
      setCurrentCode(data.content);

      // Add to code blocks history
      setCodeBlocks((prev) => [
        ...prev,
        {
          id: `loaded-${Date.now()}`,
          html: data.content,
          timestamp: new Date(),
        },
      ]);

      // Notify the AI agent about the loaded code
      await notifyAgentAboutCode(data.content, "loaded");

      // Close modal and reset
      setShowLoadImportModal(false);
      setLoadUrl("");
    } catch (err) {
      console.error("Load error:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportCode = async () => {
    if (!importText.trim()) {
      setImportError("Please enter or paste code");
      return;
    }

    try {
      const code = importText.trim();

      // Set the imported code
      setCurrentCode(code);

      // Add to code blocks history
      setCodeBlocks((prev) => [
        ...prev,
        {
          id: `imported-${Date.now()}`,
          html: code,
          timestamp: new Date(),
        },
      ]);

      // Notify the AI agent about the imported code
      await notifyAgentAboutCode(code, "imported");

      // Close modal and reset
      setShowLoadImportModal(false);
      setImportText("");
      setImportError(null);
    } catch (err) {
      console.error("Import error:", err);
      setImportError(
        err instanceof Error ? err.message : "Failed to import code"
      );
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setImportText(content);
      }
    };
    reader.onerror = () => {
      setImportError("Failed to read file");
    };
    reader.readAsText(file);
  };

  const handleMicToggle = async () => {
    if (!agoraClientRef.current) return;

    try {
      if (isMicActive) {
        await agoraClientRef.current.stopMicrophone();
        setIsMicActive(false);

        setTranscript((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: "user",
            text: "[Microphone stopped]",
            timestamp: new Date(),
            isFinal: true,
          },
        ]);
      } else {
        // Use selected device ID if available
        const deviceId = selectedMicrophoneId || undefined;
        await agoraClientRef.current.startMicrophone(deviceId);
        setIsMicActive(true);

        setTranscript((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: "user",
            text: "[Microphone started]",
            timestamp: new Date(),
            isFinal: true,
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone error");
      console.error("Microphone error:", err);
    }
  };

  const handleDeviceChange = async (deviceId: string) => {
    setSelectedMicrophoneId(deviceId);
    localStorage.setItem("selectedMicrophoneId", deviceId);

    // If microphone is currently active, restart with new device
    if (isMicActive && agoraClientRef.current) {
      try {
        await agoraClientRef.current.stopMicrophone();
        await agoraClientRef.current.startMicrophone(deviceId);
      } catch (err) {
        console.error("Failed to switch microphone device:", err);
        setError("Failed to switch microphone device");
      }
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !isConnected || !credentials || !agentId) {
      return;
    }

    const messageText = chatMessage.trim();
    setChatMessage("");
    setIsSendingMessage(true);

    try {
      // Send message to agent via RTM
      // Don't add to transcript here - let the transcription service handle it
      // This prevents duplicates since RTM will send it back as a transcription
      await fetch("/api/agent/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          agentUid: credentials.agoraBotUid,
          appId: credentials.agoraAppId,
          customerId: credentials.agoraCustomerId,
          customerSecret: credentials.agoraCustomerSecret,
        }),
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      setError("Failed to send message");
    } finally {
      setIsSendingMessage(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary transition-colors duration-300">
      {/* Clean minimal header */}
      <header className="border-b border-theme bg-theme-panel/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
          {/* Logo mark */}
          <div
            className="relative w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              background: 'linear-gradient(135deg, var(--gradient-codebyvoice-start) 0%, var(--gradient-codebyvoice-mid) 50%, var(--gradient-codebyvoice-end) 100%)',
            }}
          >
            <div className="absolute inset-0 rounded-xl opacity-50" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 50%)' }} />
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white relative z-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 18l6-6-6-6" />
              <path d="M8 6l-6 6 6 6" />
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
              <path d="M12 8v-2" />
              <path d="M12 18v-2" />
            </svg>
          </div>
          {/* Text */}
          <div className="flex flex-col">
            <h1
              className="text-lg sm:text-xl font-bold tracking-tight bg-clip-text text-transparent font-sans whitespace-nowrap leading-tight"
              style={{
                backgroundImage: 'linear-gradient(90deg, var(--gradient-codebyvoice-start) 0%, var(--gradient-codebyvoice-mid) 50%, var(--gradient-codebyvoice-end) 100%)',
              }}
            >
              CodeByVoice
            </h1>
            <div className="hidden sm:flex items-center gap-1.5 -mt-0.5">
              <span className="text-theme-tertiary text-[10px]">powered by</span>
              <svg
                viewBox="0 0 399.34668 137.06667"
                className="h-2.5 text-theme-secondary"
                role="img"
                aria-label="Agora"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="m 1676.5,1027.77 c -168.56,0 -305.69,-137.129 -305.69,-305.68 0,-168.551 137.13,-305.672 305.69,-305.672 168.55,0 305.66,137.121 305.66,305.672 0,168.551 -137.11,305.68 -305.66,305.68 m 0,-474.231 c -92.95,0 -168.56,75.609 -168.56,168.551 0,92.937 75.61,168.551 168.56,168.551 92.93,0 168.55,-75.614 168.55,-168.551 0,-92.942 -75.62,-168.551 -168.55,-168.551"
                  fill="currentColor"
                  fillRule="nonzero"
                  transform="matrix(0.13333333,0,0,-0.13333333,0,137.06667)"
                ></path>
                <path
                  d="m 2185.11,949.031 -3.85,-3.722 -4.07,-3.938 -2.68,4.988 -2.54,4.723 c -22.03,40.938 -62.59,69.108 -108.49,75.338 l -11.34,1.54 V 416.219 l 11.43,1.66 c 62.57,9.09 125.7,57.109 125.7,143.91 v 160.27 c 0,85.332 66.43,158.98 151.23,167.671 l 8.98,0.918 v 137.222 l -10.97,-1.07 c -53.18,-5.22 -106.22,-32.109 -153.4,-77.769"
                  fill="currentColor"
                  fillRule="nonzero"
                  transform="matrix(0.13333333,0,0,-0.13333333,0,137.06667)"
                ></path>
                <path
                  d="m 501.902,967.207 -2.422,-3.363 -2.57,-3.547 -3.5,2.648 -3.301,2.512 C 436.578,1006.09 372.801,1027.57 305.68,1027.57 137.129,1027.57 0,890.438 0,721.887 0,553.336 137.129,416.203 305.68,416.203 c 67.121,0 130.89,21.481 184.41,62.121 l 3.32,2.512 3.492,2.648 2.567,-3.55 2.433,-3.36 c 23.231,-32.097 58.989,-53.597 98.098,-59 l 11.359,-1.558 V 1027.77 L 600,1026.21 c -39.109,-5.39 -74.867,-26.905 -98.098,-59.003 M 305.68,553.336 c -92.942,0 -168.551,75.609 -168.551,168.551 0,92.937 75.609,168.551 168.551,168.551 92.941,0 168.55,-75.614 168.55,-168.551 0,-92.942 -75.609,-168.551 -168.55,-168.551"
                  fill="currentColor"
                  fillRule="nonzero"
                  transform="matrix(0.13333333,0,0,-0.13333333,0,137.06667)"
                ></path>
                <path
                  d="m 2983.74,1026.2 c -39.11,-5.4 -74.86,-26.899 -98.09,-58.997 l -2.43,-3.351 -2.57,-3.559 -3.49,2.66 -3.31,2.508 c -53.52,40.629 -117.3,62.109 -184.43,62.109 -168.55,0 -305.67,-137.129 -305.67,-305.679 0,-168.547 137.12,-305.68 305.67,-305.68 67.13,0 130.91,21.48 184.44,62.109 l 3.3,2.512 3.49,2.648 2.57,-3.546 2.43,-3.364 c 23.23,-32.097 58.98,-53.597 98.09,-59 l 11.36,-1.558 V 1027.76 Z M 2689.42,553.344 c -92.93,0 -168.55,75.609 -168.55,168.547 0,92.941 75.62,168.55 168.55,168.55 92.94,0 168.55,-75.609 168.55,-168.55 0,-92.938 -75.61,-168.547 -168.55,-168.547"
                  fill="currentColor"
                  fillRule="nonzero"
                  transform="matrix(0.13333333,0,0,-0.13333333,0,137.06667)"
                ></path>
                <path
                  d="m 1186.88,483.656 c 69.87,56.071 114.72,142.086 114.72,238.438 0,63.441 -19.44,122.422 -52.66,171.32 -4.43,6.52 -9.19,12.789 -14.09,18.941 37.55,23.829 59.28,64.008 65.09,103.985 l 1.66,11.43 H 994.605 v -0.04 C 826.664,1027.02 690.254,890.195 690.254,722.094 c 0,-96.36 44.859,-182.391 114.75,-238.461 -13.117,-10.528 -25.391,-22.059 -36.609,-34.57 l 93.23,-102.161 c 30.809,40.59 79.539,66.864 134.309,66.864 92.936,0 168.546,-75.614 168.546,-168.551 0,-60.27 -31.82,-113.223 -79.52,-143.02 L 1178.22,0 c 74.83,55.7734 123.38,144.926 123.38,245.215 0,96.348 -44.85,182.367 -114.72,238.441 M 995.813,890.637 h 0.242 c 92.875,-0.063 168.425,-75.645 168.425,-168.543 0,-92.942 -75.61,-168.551 -168.546,-168.551 -92.942,0 -168.551,75.609 -168.551,168.551 0,92.898 75.543,168.48 168.43,168.543"
                  fill="currentColor"
                  fillRule="nonzero"
                  transform="matrix(0.13333333,0,0,-0.13333333,0,137.06667)"
                ></path>
              </svg>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!credentialsConfigured && (
            <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-200 px-2 py-1 rounded text-xs flex items-center gap-1">
              <span>⚠️</span>
              <span className="hidden sm:inline">Configure credentials</span>
            </div>
          )}
          
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-primary"
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
          
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-theme-hover transition-colors text-sm text-theme-secondary hover:text-theme-primary"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting || !credentialsConfigured}
              className="px-4 py-1.5 rounded bg-theme-accent hover:bg-theme-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isConnecting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                  <span>Connecting...</span>
                </>
              ) : (
                "Start Session"
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
                    {/* Device Selector - Subtle dropdown */}
                    {isConnected && microphoneDevices.length > 1 && (
                      <select
                        value={selectedMicrophoneId}
                        onChange={(e) => handleDeviceChange(e.target.value)}
                        className="bg-theme-secondary border border-theme rounded-md px-2 py-1 text-xs text-theme-primary focus:outline-none focus:border-theme-accent transition-colors max-w-[120px] sm:max-w-[140px] opacity-70 hover:opacity-100"
                        title="Select microphone"
                      >
                        {microphoneDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label ||
                              `Mic ${device.deviceId.substring(0, 8)}`}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      onClick={handleToggleMute}
                      className={`relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-200 hover:scale-105 ${
                        isMuted
                          ? "bg-red-500/20 hover:bg-red-500/30 border-2 border-red-500/50"
                          : "bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500/50"
                      }`}
                      title={isMuted ? "Unmute microphone" : "Mute microphone"}
                    >
                      {isMuted ? (
                        <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" />
                      ) : (
                        <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-green-400" />
                      )}
                      {!isMuted && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full animate-pulse"></div>
                      )}
                    </button>

                    <button
                      onClick={handleDisconnect}
                      className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-theme-secondary hover:bg-red-500/20 border border-theme hover:border-red-500/50 rounded-full transition-all duration-200 hover:scale-105 text-xs sm:text-sm font-medium"
                      title="End session"
                    >
                      <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-secondary" />
                      <span className="text-theme-secondary">End</span>
                    </button>
                  </div>
                )}
              </div>
        </header>

        <div className="container mx-auto px-4 py-4">
        {/* Settings Modal */}
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveCredentials}
          initialCredentials={credentials || undefined}
        />

        {/* Share Success Modal */}
        {shareUrl && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-theme-panel border border-theme rounded-lg shadow-theme-lg max-w-md w-full p-5 relative">
              <button
                onClick={() => setShareUrl(null)}
                className="absolute top-4 right-4 text-theme-tertiary hover:text-theme-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-theme-secondary border border-theme rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">✅</span>
                </div>
                <h3 className="text-base font-semibold text-theme-primary mb-1.5">
                  Link Copied!
                </h3>
                <p className="text-xs text-theme-secondary">
                  Share this link with anyone to view your generated code
                </p>
              </div>

              <div className="mb-4 relative">
                <p className="text-xs text-theme-secondary mb-1.5 flex items-center gap-1">
                  <span>📋</span>
                  Click URL to copy:
                </p>
                <div className="relative">
                  <div
                    onClick={handleCopyShareUrl}
                    className="bg-theme-secondary border border-theme rounded p-3 break-all text-xs text-theme-primary font-mono cursor-pointer hover:bg-theme-hover transition-colors"
                    title="Click to copy to clipboard"
                  >
                    {shareUrl}
                  </div>
                  {shareUrlCopied && (
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-theme-accent text-white text-xs px-2.5 py-1 rounded shadow-theme-md whitespace-nowrap z-10">
                      ✓ Copied!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Load/Import Code Modal */}
        {showLoadImportModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-theme-panel border border-theme rounded-lg shadow-theme-lg max-w-2xl w-full p-5 relative max-h-[90vh] flex flex-col">
              <button
                onClick={() => {
                  setShowLoadImportModal(false);
                  setLoadUrl("");
                  setLoadError(null);
                  setImportText("");
                  setImportError(null);
                }}
                className="absolute top-4 right-4 text-theme-tertiary hover:text-theme-primary transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-4">
                <h3 className="text-base font-semibold text-theme-primary mb-4">
                  Import or Load Code
                </h3>

                {/* Tabs */}
                <div className="flex gap-2 mb-4 border-b border-theme">
                  <button
                    onClick={() => setLoadImportTab("import")}
                    className={`px-3 py-2 text-sm font-medium transition ${
                      loadImportTab === "import"
                        ? "text-theme-accent border-b-2 border-theme-accent"
                        : "text-theme-secondary hover:text-theme-primary"
                    }`}
                  >
                    Import
                  </button>
                  <button
                    onClick={() => setLoadImportTab("load")}
                    className={`px-3 py-2 text-sm font-medium transition ${
                      loadImportTab === "load"
                        ? "text-theme-accent border-b-2 border-theme-accent"
                        : "text-theme-secondary hover:text-theme-primary"
                    }`}
                  >
                    Load from URL
                  </button>
                </div>

                {/* Import Tab */}
                {loadImportTab === "import" && (
                  <div>
                    <p className="text-xs text-theme-secondary mb-4">
                      Paste your code below or upload a file
                    </p>

                    <div className="mb-3">
                      <label className="block text-xs text-theme-primary mb-1.5">
                        Upload File (HTML, TXT, etc.)
                      </label>
                      <input
                        type="file"
                        accept=".html,.htm,.txt,.js,.css"
                        onChange={handleFileImport}
                        className="w-full bg-theme-secondary border border-theme rounded px-3 py-2 text-theme-primary text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-theme-accent file:text-white hover:file:bg-theme-accent-hover"
                      />
                    </div>

                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Paste your code here..."
                      className="w-full bg-theme-secondary border border-theme rounded-lg px-4 py-3 text-theme-primary placeholder-theme-tertiary focus:outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent focus:ring-opacity-20 font-mono text-sm h-64 resize-none"
                    />

                    {importError && (
                      <p className="text-red-500 text-xs mt-2">{importError}</p>
                    )}

                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={handleImportCode}
                        disabled={!importText.trim()}
                        className="flex-1 bg-theme-accent hover:bg-theme-accent-hover border border-theme-accent px-3 py-1.5 rounded text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Import</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowLoadImportModal(false);
                          setImportText("");
                          setImportError(null);
                        }}
                        className="px-3 py-1.5 bg-theme-secondary hover:bg-theme-hover border border-theme rounded text-sm font-medium transition text-theme-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Load from URL Tab */}
                {loadImportTab === "load" && (
                  <div>
                    <p className="text-xs text-theme-secondary mb-4">
                      Enter a share URL (paste.fyi or your share link) to load
                      existing code
                    </p>

                    <input
                      type="text"
                      value={loadUrl}
                      onChange={(e) => setLoadUrl(e.target.value)}
                      placeholder="https://paste.fyi/XXXXX or https://yoursite.com/view/XXXXX"
                      className="w-full bg-theme-secondary border border-theme rounded-lg px-4 py-2 text-theme-primary placeholder-theme-tertiary focus:outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent focus:ring-opacity-20 mb-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleLoadFromUrl();
                        }
                      }}
                    />

                    {loadError && (
                      <p className="text-red-500 text-xs mb-2">{loadError}</p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleLoadFromUrl}
                        disabled={isLoading}
                        className="flex-1 bg-theme-accent hover:bg-theme-accent-hover border border-theme-accent px-3 py-1.5 rounded text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                      >
                        {isLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <LinkIcon className="w-4 h-4" />
                            <span>Load</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowLoadImportModal(false);
                          setLoadUrl("");
                          setLoadError(null);
                        }}
                        className="px-3 py-1.5 bg-theme-secondary hover:bg-theme-hover border border-theme rounded text-sm font-medium transition text-theme-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Share Error Toast */}
        {shareError && (
          <div className="fixed bottom-4 right-4 bg-red-500/20 border border-red-500 text-red-100 px-4 py-3 rounded-lg shadow-xl z-50 max-w-md">
            <div className="flex items-start gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-semibold">Failed to create share link</p>
                <p className="text-sm text-red-200">{shareError}</p>
              </div>
              <button
                onClick={() => setShareError(null)}
                className="ml-auto text-red-200 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-100 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div ref={panelContainerRef} className="panel-container flex flex-col lg:flex-row gap-4 lg:gap-0" style={{ minHeight: "calc(100vh - 120px)" }}>
          {/* Code View Panel - Larger */}
          <div
            className="preview-panel bg-theme-panel border border-theme rounded-l-lg lg:rounded-r-none rounded-lg lg:rounded-lg p-4 shadow-theme-md flex flex-col"
            style={{ 
              height: isLargeScreen ? "calc(100vh - 120px)" : "calc(100vh - 120px)",
              minHeight: "calc(100vh - 120px)",
              width: isLargeScreen ? `${panelWidth}%` : "100%",
              flexShrink: 0
            }}
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3 sm:gap-0 flex-shrink-0">
              <h2 className="text-base font-semibold text-theme-primary">
                {showSourceCode ? "Source Code" : "Preview"}
              </h2>
              <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                {codeBlocks.length > 1 && (
                  <div className="flex items-center gap-1 sm:gap-2">
                    <label className="text-xs sm:text-sm text-slate-300">
                      Version:
                    </label>
                    <select
                      value={codeBlocks.findIndex(
                        (b) => b.html === currentCode
                      )}
                      onChange={(e) => {
                        const idx = parseInt(e.target.value);
                        if (idx >= 0 && idx < codeBlocks.length) {
                          setCurrentCode(codeBlocks[idx].html);
                        }
                      }}
                      className="bg-theme-secondary text-theme-primary px-2 sm:px-3 py-1 rounded text-xs sm:text-sm border border-theme focus:outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent focus:ring-opacity-20"
                    >
                      {codeBlocks.map((block, idx) => (
                        <option key={block.id} value={idx}>
                          v{idx + 1} -{" "}
                          {new Date(block.timestamp).toLocaleTimeString()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {isConnected && (
                  <button
                    onClick={() => {
                      setShowLoadImportModal(true);
                      setLoadImportTab("import");
                    }}
                    className="bg-theme-secondary hover:bg-theme-hover border border-theme px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors flex items-center gap-1.5 text-theme-primary"
                    title="Import or load code"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Import</span>
                  </button>
                )}
                {currentCode && (
                  <>
                    <button
                      onClick={() => setShowSourceCode(!showSourceCode)}
                      className="bg-theme-secondary hover:bg-theme-hover border border-theme px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors flex items-center gap-1.5 text-theme-primary"
                      title={showSourceCode ? "Switch to preview" : "Switch to code"}
                    >
                      {showSourceCode ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Preview</span>
                        </>
                      ) : (
                        <>
                          <Code className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Code</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={async () => {
                        const zip = new JSZip();
                        const timestamp = Date.now();
                        const filename = `code-${timestamp}`;

                        // Add the HTML file to the zip
                        zip.file(`${filename}.html`, currentCode);

                        // Generate the zip file
                        const blob = await zip.generateAsync({ type: "blob" });

                        // Download the zip
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${filename}.zip`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="bg-theme-secondary hover:bg-theme-hover border border-theme px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors flex items-center gap-1.5 text-theme-primary"
                      title="Download code"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                    <button
                      onClick={handleShare}
                      disabled={isSharing}
                      className="bg-theme-secondary hover:bg-theme-hover border border-theme px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors flex items-center gap-1.5 text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Share code"
                    >
                      {isSharing ? (
                        <>
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-theme-primary border-t-transparent"></div>
                          <span className="hidden sm:inline">Sharing...</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Share</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div
              className="flex-1 min-h-0 rounded-lg shadow-inner relative"
              style={{
                overflow: "hidden",
                isolation: "isolate",
                minHeight: "600px",
              }}
            >
              {currentCode ? (
                <>
                  {showSourceCode ? (
                    <div className="w-full h-full relative">
                      <button
                        onClick={handleCopyCode}
                        className="absolute top-4 right-4 z-50 bg-theme-secondary hover:bg-theme-tertiary text-theme-primary border border-theme px-3 py-1.5 rounded text-xs font-semibold transition flex items-center gap-1.5 shadow-lg"
                      >
                        {copied ? (
                          <>
                            <span>✓</span>
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <span>📋</span>
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <CodeHighlight
                        code={currentCode}
                        language="html"
                        theme={theme === "light" ? "github-light" : "github-dark"}
                      />
                    </div>
                  ) : (
                    <iframe
                      srcDoc={currentCode}
                      title="Code Preview"
                      className="w-full h-full border-0 bg-white"
                      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                      style={{ display: "block", overflow: "auto" }}
                      onLoad={() => {
                        // Add focus to iframe when it loads so arrow keys work inside it
                        const iframe = document.querySelector("iframe");
                        if (iframe) {
                          iframe.focus();
                        }
                      }}
                    />
                  )}
                  {isGeneratingCode && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white mx-auto mb-4"></div>
                        <p className="text-white font-semibold">
                          Generating code...
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-theme-tertiary bg-theme-secondary/50 rounded-lg border border-theme border-dashed">
                  {isGeneratingCode ? (
                    <div className="text-center animate-fade-in">
                      <div className="relative w-16 h-16 mx-auto mb-4">
                        <div className="absolute inset-0 rounded-full border-4 border-theme-accent/20"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-theme-accent animate-spin"></div>
                      </div>
                      <p className="font-medium text-theme-secondary">Generating code...</p>
                      <p className="text-xs text-theme-tertiary mt-1">This may take a few seconds</p>
                    </div>
                  ) : (
                    <div className="text-center max-w-sm animate-fade-in">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-theme-accent-light flex items-center justify-center">
                        <Code className="w-8 h-8 text-theme-accent" />
                      </div>
                      <h3 className="font-semibold text-theme-primary mb-2">No code yet</h3>
                      <p className="text-sm text-theme-tertiary leading-relaxed">
                        Start a session and ask me to build something!
                        <br />
                        <span className="text-theme-secondary">Try: "Create a todo app" or "Build a calculator"</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Resize Handle - Only visible on large screens */}
          <div
            className="hidden lg:flex w-1 bg-theme-border hover:bg-theme-accent cursor-col-resize transition-colors relative group"
            onMouseDown={handleResizeStart}
            style={{ flexShrink: 0, zIndex: 10 }}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>

          {/* Chat Panel */}
          <div
            className="bg-theme-panel border border-theme rounded-r-lg lg:rounded-l-none rounded-lg lg:rounded-lg p-3 sm:p-4 shadow-theme-md flex flex-col"
            style={{ 
              height: "calc(100vh - 120px)", 
              maxHeight: "calc(100vh - 120px)",
              width: isLargeScreen ? `${100 - panelWidth}%` : "100%",
              minWidth: isLargeScreen ? "250px" : "auto",
              flexShrink: 0
            }}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h2 className="text-sm font-semibold text-theme-primary uppercase tracking-wide">
                Chat
              </h2>
              {isConnected && (
                <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  agentStatus === "listening"
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : agentStatus === "speaking"
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : agentStatus === "thinking"
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    : "bg-theme-secondary text-theme-tertiary"
                }`}>
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      agentStatus === "listening"
                        ? "bg-green-500 animate-pulse"
                        : agentStatus === "speaking"
                        ? "bg-blue-500 animate-pulse"
                        : agentStatus === "thinking"
                        ? "bg-purple-500 animate-pulse"
                        : "bg-slate-400"
                    }`}
                  />
                  <span>
                    {agentStatus === "listening" && "Listening"}
                    {agentStatus === "speaking" && "Speaking"}
                    {agentStatus === "thinking" && "Thinking"}
                    {(agentStatus === "idle" || agentStatus === "silent") && "Ready"}
                  </span>
                </div>
              )}
            </div>
            <div
              ref={transcriptContainerRef}
              className="space-y-2 flex-1 overflow-y-auto text-sm mb-3 min-h-0"
            >
              {transcript.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-theme-accent-light flex items-center justify-center mb-3">
                    <Mic className="w-5 h-5 text-theme-accent" />
                  </div>
                  <p className="text-sm text-theme-secondary font-medium mb-1">
                    {isConnected ? "Start talking" : "Ready to chat"}
                  </p>
                  <p className="text-xs text-theme-tertiary">
                    {isConnected
                      ? "I'm listening..."
                      : "Click 'Start Session' to begin"}
                  </p>
                </div>
              ) : (
                transcript.map((msg, index) => {
                  // Check if this is the last agent message and status is still speaking
                  const isLastAgentMessage =
                    msg.type === "agent" &&
                    (index === transcript.length - 1 ||
                     transcript.slice(index + 1).every(m => m.type !== "agent"));
                  const showSpinner = isLastAgentMessage && agentStatus === "speaking";
                  const isUser = msg.type === "user";

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] p-3 rounded-2xl ${
                          isUser
                            ? "bg-theme-accent text-white rounded-br-md"
                            : "bg-theme-tertiary/30 text-theme-primary rounded-bl-md"
                        }`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.text}
                          {showSpinner && (
                            <span className="inline-block ml-1.5">
                              <div className="animate-spin rounded-full h-3 w-3 border-2 border-current/30 border-t-current inline-block align-middle"></div>
                            </span>
                          )}
                        </p>
                        <span className={`text-[10px] mt-1 block ${isUser ? "text-white/60" : "text-theme-tertiary"}`}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* Chat Input */}
            {isConnected && (
              <div className="flex gap-2 pt-3 flex-shrink-0 min-w-0">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  disabled={isSendingMessage}
                  className="flex-1 min-w-0 bg-theme-tertiary/50 border-0 rounded-full px-4 py-2.5 text-sm text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-theme-accent/50 transition-all disabled:opacity-50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatMessage.trim() || isSendingMessage}
                  className="bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-40 disabled:cursor-not-allowed w-10 h-10 rounded-full text-white transition-all flex items-center justify-center flex-shrink-0 hover:scale-105 active:scale-95"
                  title="Send message"
                >
                  {isSendingMessage ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-6 py-4 flex items-center justify-center gap-4 text-theme-tertiary text-xs">
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-theme-tertiary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span>Voice</span>
            </span>
            <span className="text-theme-tertiary">→</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-theme-tertiary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span>AI</span>
            </span>
            <span className="text-theme-tertiary">→</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-theme-tertiary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
              <span>Code</span>
            </span>
          </span>
          <span className="text-theme-tertiary">•</span>
          <a
            href="https://convoai.world/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-theme-accent transition-colors"
          >
            convoai.world
          </a>
        </footer>
      </div>
    </div>
  );
}
