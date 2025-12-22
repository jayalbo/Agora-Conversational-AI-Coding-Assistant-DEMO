"use client";

import { useState, useEffect } from "react";
import { X, Save, Settings, Eye, EyeOff } from "lucide-react";

export type LLMProvider = "openai" | "gemini";

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
      };
      setCredentials(migratedCredentials);
    }
  }, [initialCredentials]);

  const toggleSecretVisibility = (field: string) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-200">
            <p className="font-semibold mb-2">🔒 Your credentials stay private</p>
            <p>
              All credentials are stored locally in your browser and sent directly
              to the respective APIs. They are never stored on our servers.
            </p>
          </div>

          {/* Agora Credentials */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-purple-300 flex items-center gap-2">
              <span>📡</span> Agora Credentials
            </h3>
            <p className="text-sm text-slate-400">
              Get these from{" "}
              <a
                href="https://console.agora.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
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
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-green-300 flex items-center gap-2">
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
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors"
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
                className="text-blue-400 hover:underline"
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
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-200">
                <p>
                  <strong>Note:</strong> For Gemini, the API key will be automatically added to the URL.
                  URL format: <code className="bg-slate-800 px-1 rounded text-xs">https://generativelanguage.googleapis.com/v1beta/models/{credentials.llmModel}:streamGenerateContent?alt=sse&key=YOUR_API_KEY</code>
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
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-orange-300 flex items-center gap-2">
              <span>🔊</span> TTS Configuration
            </h3>
            <p className="text-sm text-slate-400">
              Get API key from{" "}
              <a
                href="https://portal.azure.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
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
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 bg-slate-800 border-t border-slate-700 p-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg font-semibold transition-all flex items-center gap-2"
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
      <label className="block text-sm font-medium text-slate-300 mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-2 bg-slate-900 border ${
          error ? "border-red-500" : "border-slate-700"
        } rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors`}
      />
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
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
      <label className="block text-sm font-medium text-slate-300 mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-4 py-2 pr-12 bg-slate-900 border ${
            error ? "border-red-500" : "border-slate-700"
          } rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors z-0"
        >
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

