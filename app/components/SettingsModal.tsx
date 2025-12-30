"use client";

import { useState, useEffect } from "react";
import { X, Save, Settings, Eye, EyeOff } from "lucide-react";

export type LLMProvider = "openai" | "gemini";

export interface MCPConfig {
  name: string;
  address: string;
  credentials?: string; // JSON string or API key
}

export interface UserCredentials {
  agoraAppId: string;
  agoraAppCertificate: string;
  agoraCustomerId: string;
  agoraCustomerSecret: string;
  agoraBotUid: string;
  llmProvider: LLMProvider;
  llmUrl: string;
  llmApiKey: string;
  llmModel: string;
  ttsApiKey: string;
  ttsRegion: string;
  mcps?: MCPConfig[]; // Array of MCP configurations
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (credentials: UserCredentials) => void;
  initialCredentials?: UserCredentials;
}

const defaultCredentials: UserCredentials = {
  agoraAppId: "",
  agoraAppCertificate: "",
  agoraCustomerId: "",
  agoraCustomerSecret: "",
  agoraBotUid: "1001",
  llmProvider: "openai",
  llmUrl: "https://api.openai.com/v1/chat/completions",
  llmApiKey: "",
  llmModel: "gpt-4o-mini",
  ttsApiKey: "",
  ttsRegion: "westus",
  mcps: [],
};

// Provider-specific configurations
const LLM_PROVIDERS = {
  openai: {
    name: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    apiKeyPlaceholder: "sk-proj-...",
    apiKeyLink: "https://platform.openai.com/api-keys",
    apiKeyLinkText: "OpenAI Platform",
    defaultModel: "gpt-4o-mini",
  },
  gemini: {
    name: "Google Gemini",
    // Gemini URL format: API key goes in query parameter
    // The actual URL will be constructed in the API route with the API key
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse&key={api_key}",
    apiKeyPlaceholder: "AIza...",
    apiKeyLink: "https://ai.google.dev/",
    apiKeyLinkText: "Google AI Studio",
    defaultModel: "gemini-3-flash-preview",
  },
};

export default function SettingsModal({
  isOpen,
  onClose,
  onSave,
  initialCredentials,
}: SettingsModalProps) {
  const [credentials, setCredentials] = useState<UserCredentials>(
    initialCredentials || defaultCredentials
  );
  const [showSecrets, setShowSecrets] = useState<{ [key: string]: boolean }>({});
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (initialCredentials) {
      // Migrate old credentials that don't have llmProvider or llmModel
      const migratedCredentials = {
        ...initialCredentials,
        llmProvider: initialCredentials.llmProvider || "openai" as LLMProvider,
        llmModel: initialCredentials.llmModel || (initialCredentials.llmProvider === "gemini" ? "gemini-3-flash-preview" : "gpt-4o-mini"),
        mcps: initialCredentials.mcps || [],
      };
      setCredentials(migratedCredentials);
    }
  }, [initialCredentials]);

  const toggleSecretVisibility = (field: string) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const addMCP = () => {
    setCredentials((prev) => ({
      ...prev,
      mcps: [
        ...(prev.mcps || []),
        { name: "", address: "", credentials: "" },
      ],
    }));
  };

  const removeMCP = (index: number) => {
    setCredentials((prev) => ({
      ...prev,
      mcps: (prev.mcps || []).filter((_, i) => i !== index),
    }));
  };

  const updateMCP = (index: number, field: keyof MCPConfig, value: string) => {
    setCredentials((prev) => {
      const updatedMcps = [...(prev.mcps || [])];
      updatedMcps[index] = { ...updatedMcps[index], [field]: value };
      return { ...prev, mcps: updatedMcps };
    });
  };

  const validateCredentials = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!credentials.agoraAppId.trim()) {
      newErrors.agoraAppId = "Agora App ID is required";
    }
    if (!credentials.agoraAppCertificate.trim()) {
      newErrors.agoraAppCertificate = "Agora App Certificate is required";
    }
    if (!credentials.agoraCustomerId.trim()) {
      newErrors.agoraCustomerId = "Agora Customer ID is required";
    }
    if (!credentials.agoraCustomerSecret.trim()) {
      newErrors.agoraCustomerSecret = "Agora Customer Secret is required";
    }
    if (!credentials.agoraBotUid.trim()) {
      newErrors.agoraBotUid = "Bot UID is required";
    }
    if (!credentials.llmUrl.trim()) {
      newErrors.llmUrl = "LLM URL is required";
    }
    if (!credentials.llmApiKey.trim()) {
      newErrors.llmApiKey = "LLM API Key is required";
    }
    if (!credentials.ttsApiKey.trim()) {
      newErrors.ttsApiKey = "TTS API Key is required";
    }
    if (!credentials.ttsRegion.trim()) {
      newErrors.ttsRegion = "TTS Region is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateCredentials()) {
      onSave(credentials);
      onClose();
    }
  };

  const handleChange = (field: keyof UserCredentials, value: string) => {
    setCredentials((prev) => {
      const updated = { ...prev, [field]: value };
      
      // Auto-update LLM URL and model when provider changes
      if (field === "llmProvider" && (value === "openai" || value === "gemini")) {
        const provider = LLM_PROVIDERS[value as LLMProvider];
        updated.llmModel = provider.defaultModel;
        // For OpenAI, use the direct URL
        // For Gemini, URL will be constructed in the API route with API key
        updated.llmUrl = provider.url;
      }
      
      // For Gemini, update URL template when model changes (but API key will be added in route)
      if (field === "llmModel" && updated.llmProvider === "gemini") {
        // URL template - API key will be added in the API route
        updated.llmUrl = `https://generativelanguage.googleapis.com/v1beta/models/${value}:streamGenerateContent?alt=sse&key={api_key}`;
      }
      
      return updated;
    });
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-theme-panel border border-theme rounded-lg shadow-theme-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-theme-panel border-b border-theme p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-theme-accent" />
            <h2 className="text-lg font-semibold text-theme-primary">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-theme-tertiary hover:text-theme-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          <div className="bg-theme-secondary border border-theme rounded-lg p-3 text-sm text-theme-secondary">
            <p className="font-medium mb-1.5 text-theme-primary">🔒 Your credentials stay private</p>
            <p className="text-theme-secondary">
              All credentials are stored locally in your browser and sent directly
              to the respective APIs. They are never stored on our servers.
            </p>
          </div>

          {/* Agora Credentials */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-theme-primary flex items-center gap-2">
              <span>📡</span> Agora Credentials
            </h3>
            <p className="text-xs text-theme-secondary">
              Get these from{" "}
              <a
                href="https://console.agora.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-theme-accent hover:text-theme-accent-hover transition-colors"
              >
                Agora Console
              </a>
            </p>

            <InputField
              label="App ID"
              value={credentials.agoraAppId}
              onChange={(value) => handleChange("agoraAppId", value)}
              error={errors.agoraAppId}
              placeholder="abc123xyz456"
            />

            <SecretInputField
              label="App Certificate"
              value={credentials.agoraAppCertificate}
              onChange={(value) => handleChange("agoraAppCertificate", value)}
              error={errors.agoraAppCertificate}
              placeholder="1a2b3c4d5e6f7g8h9i0j"
              show={showSecrets.agoraAppCertificate}
              onToggle={() => toggleSecretVisibility("agoraAppCertificate")}
            />

            <InputField
              label="Customer ID (RESTful API)"
              value={credentials.agoraCustomerId}
              onChange={(value) => handleChange("agoraCustomerId", value)}
              error={errors.agoraCustomerId}
              placeholder="customer_abc123"
            />

            <SecretInputField
              label="Customer Secret (RESTful API)"
              value={credentials.agoraCustomerSecret}
              onChange={(value) => handleChange("agoraCustomerSecret", value)}
              error={errors.agoraCustomerSecret}
              placeholder="secret_xyz789"
              show={showSecrets.agoraCustomerSecret}
              onToggle={() => toggleSecretVisibility("agoraCustomerSecret")}
            />

            <InputField
              label="Bot UID"
              value={credentials.agoraBotUid}
              onChange={(value) => handleChange("agoraBotUid", value)}
              error={errors.agoraBotUid}
              placeholder="1001"
              type="number"
            />
          </div>

          {/* LLM Credentials */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-theme-primary flex items-center gap-2">
              <span>🤖</span> LLM Configuration
            </h3>
            
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                LLM Provider
              </label>
              <select
                value={credentials.llmProvider}
                onChange={(e) => handleChange("llmProvider", e.target.value)}
                className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded text-theme-primary focus:outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent focus:ring-opacity-20 transition-colors text-sm"
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>

            <p className="text-sm text-slate-400">
              Get API key from{" "}
              <a
                href={LLM_PROVIDERS[credentials.llmProvider].apiKeyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-theme-accent hover:text-theme-accent-hover transition-colors"
              >
                {LLM_PROVIDERS[credentials.llmProvider].apiKeyLinkText}
              </a>
            </p>

            {/* Model Selection */}
            <InputField
              label="Model"
              value={credentials.llmModel}
              onChange={(value) => handleChange("llmModel", value)}
              error={errors.llmModel}
              placeholder={
                credentials.llmProvider === "gemini"
                  ? "gemini-3-flash-preview"
                  : "gpt-4o-mini"
              }
            />

            {credentials.llmProvider === "openai" && (
              <InputField
                label="LLM URL"
                value={credentials.llmUrl}
                onChange={(value) => handleChange("llmUrl", value)}
                error={errors.llmUrl}
                placeholder={LLM_PROVIDERS[credentials.llmProvider].url}
              />
            )}

            {credentials.llmProvider === "gemini" && (
              <div className="bg-theme-secondary border border-theme rounded-lg p-3 text-xs text-theme-secondary">
                <p>
                  <strong className="text-theme-primary">Note:</strong> For Gemini, the API key will be automatically added to the URL.
                  URL format: <code className="bg-theme-tertiary px-1 rounded text-xs font-mono text-theme-primary">https://generativelanguage.googleapis.com/v1beta/models/{credentials.llmModel}:streamGenerateContent?alt=sse&key=YOUR_API_KEY</code>
                </p>
              </div>
            )}

            <SecretInputField
              label="API Key"
              value={credentials.llmApiKey}
              onChange={(value) => handleChange("llmApiKey", value)}
              error={errors.llmApiKey}
              placeholder={LLM_PROVIDERS[credentials.llmProvider].apiKeyPlaceholder}
              show={showSecrets.llmApiKey}
              onToggle={() => toggleSecretVisibility("llmApiKey")}
            />
          </div>

          {/* TTS Credentials */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-theme-primary flex items-center gap-2">
              <span>🔊</span> TTS Configuration
            </h3>
            <p className="text-xs text-theme-secondary">
              Get API key from{" "}
              <a
                href="https://portal.azure.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-theme-accent hover:text-theme-accent-hover transition-colors"
              >
                Azure Portal
              </a>{" "}
              (Cognitive Services → Speech)
            </p>

            <SecretInputField
              label="Azure TTS API Key"
              value={credentials.ttsApiKey}
              onChange={(value) => handleChange("ttsApiKey", value)}
              error={errors.ttsApiKey}
              placeholder="abc123def456ghi789"
              show={showSecrets.ttsApiKey}
              onToggle={() => toggleSecretVisibility("ttsApiKey")}
            />

            <InputField
              label="Azure Region"
              value={credentials.ttsRegion}
              onChange={(value) => handleChange("ttsRegion", value)}
              error={errors.ttsRegion}
              placeholder="westus"
            />
          </div>

          {/* MCP Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-theme-primary flex items-center gap-2">
                  <span>🔌</span> MCP (Model Context Protocol)
                </h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-theme-secondary text-theme-secondary border border-theme rounded">
                  Experimental
                </span>
              </div>
              <button
                type="button"
                onClick={addMCP}
                className="px-2.5 py-1 text-xs bg-theme-secondary hover:bg-theme-hover border border-theme rounded text-theme-primary transition-colors"
              >
                + Add MCP
              </button>
            </div>
            <p className="text-xs text-theme-secondary">
              Configure MCP servers to provide additional context and tools to the LLM.
              Use ngrok or similar for local MCP servers.
            </p>

            {(!credentials.mcps || credentials.mcps.length === 0) && (
              <p className="text-xs text-theme-tertiary italic">
                No MCPs configured. Add one to enable MCP integration.
              </p>
            )}

            {credentials.mcps && credentials.mcps.length > 0 && (
              <div className="space-y-3">
                {credentials.mcps.map((mcp, index) => (
                  <div
                    key={index}
                    className="p-3 bg-theme-secondary border border-theme rounded space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-theme-primary">
                        MCP #{index + 1}
                      </h4>
                      <button
                        type="button"
                        onClick={() => removeMCP(index)}
                        className="px-2 py-1 text-xs bg-theme-secondary hover:bg-theme-hover border border-theme text-theme-primary rounded transition-colors"
                      >
                        Remove
                      </button>
                    </div>

                    <InputField
                      label="Name"
                      value={mcp.name}
                      onChange={(value) => updateMCP(index, "name", value)}
                      placeholder="My MCP Server"
                    />

                    <InputField
                      label="Address (URL)"
                      value={mcp.address}
                      onChange={(value) => updateMCP(index, "address", value)}
                      placeholder="https://your-mcp-server.ngrok.io"
                    />

                    <SecretInputField
                      label="Credentials (Optional)"
                      value={mcp.credentials || ""}
                      onChange={(value) => updateMCP(index, "credentials", value)}
                      placeholder="API key or JSON credentials"
                      show={showSecrets[`mcp-${index}-credentials`] || false}
                      onToggle={() =>
                        toggleSecretVisibility(`mcp-${index}-credentials`)
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 bg-theme-panel border-t border-theme p-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-theme-accent hover:bg-theme-accent-hover border border-theme-accent rounded text-sm font-medium transition-colors flex items-center gap-2 text-white"
          >
            <Save className="w-4 h-4" />
            Save Credentials
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function InputField({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-theme-primary mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 bg-theme-secondary border ${
          error ? "border-red-500" : "border-theme"
        } rounded text-theme-primary placeholder-theme-tertiary focus:outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent focus:ring-opacity-20 transition-colors text-sm`}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function SecretInputField({
  label,
  value,
  onChange,
  error,
  placeholder,
  show,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-theme-primary mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 pr-10 bg-theme-secondary border ${
            error ? "border-red-500" : "border-theme"
          } rounded text-theme-primary placeholder-theme-tertiary focus:outline-none focus:border-theme-accent focus:ring-2 focus:ring-theme-accent focus:ring-opacity-20 transition-colors text-sm`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-tertiary hover:text-theme-primary transition-colors z-0"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

