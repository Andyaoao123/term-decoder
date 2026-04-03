import { useState, useRef, useEffect } from "react";
import "./App.css";

const PROVIDERS = {
  anthropic: {
    name: "Claude (Anthropic)",
    placeholder: "sk-ant-...",
    docUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-3-5-haiku-20241022",
    models: [
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku（快速）" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet（强）" },
    ],
  },
  deepseek: {
    name: "DeepSeek",
    placeholder: "sk-...",
    docUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-chat",
    models: [
      { id: "deepseek-chat", label: "DeepSeek V3（推荐）" },
      { id: "deepseek-reasoner", label: "DeepSeek R1（推理）" },
    ],
  },
  qwen: {
    name: "通义千问 (Qwen)",
    placeholder: "sk-...",
    docUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    defaultModel: "qwen-turbo",
    models: [
      { id: "qwen-turbo", label: "Qwen Turbo（快速）" },
      { id: "qwen-plus", label: "Qwen Plus（均衡）" },
      { id: "qwen-max", label: "Qwen Max（强）" },
    ],
  },
  gemini: {
    name: "Gemini (Google)",
    placeholder: "AIza...",
    docUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-2.0-flash",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash（推荐）" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro（强）" },
    ],
  },
  openrouter: {
    name: "OpenRouter",
    placeholder: "sk-or-...",
    docUrl: "https://openrouter.ai/keys",
    defaultModel: "google/gemini-2.0-flash-001",
    models: [
      { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
      { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3" },
      { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
      { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout" },
    ],
  },
};

const ENDPOINTS = {
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

const SYSTEM_PROMPT = `你是一个"语言翻译官"，专门帮助用户理解陌生领域的专业术语和段落。

规则：
1. 永远先建直觉，后挂标签
2. 用生活类比或动作描述，不要先给定义
3. 结构固定输出：
   - 🎯 它在做什么事？（一句话，日常语言）
   - 🔗 一个类比（贴近生活的比喻）
   - 📦 为什么存在？（它解决了什么问题）
   - 🏷️ 专业标签（最后才给术语/定义）

如果输入是一段话（非单个词），还要加：
   - 🗺️ 事件地图（谁 → 对谁做了什么 → 导致什么结果）

语言简洁，不废话，不说教。`;

async function callLLM({ provider, apiKey, model, userMessage }) {
  const endpoint = ENDPOINTS[provider];

  if (provider === "anthropic") {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.content?.map((b) => b.text || "").join("") || "";
  }

  // OpenAI-compatible (DeepSeek / Qwen / Gemini / OpenRouter)
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://term-decoder.vercel.app";
    headers["X-Title"] = "Term Decoder";
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const e = await res.json();
    throw new Error(e?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export default function App() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("term");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const [provider, setProvider] = useState(
    () => localStorage.getItem("td_provider") || "deepseek"
  );
  const [model, setModel] = useState(
    () => localStorage.getItem("td_model") || PROVIDERS["deepseek"].defaultModel
  );
  const [apiKeys, setApiKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem("td_api_keys") || "{}"); }
    catch { return {}; }
  });
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("td_history") || "[]"); }
    catch { return []; }
  });

  const outputRef = useRef(null);

  useEffect(() => {
    if (output && outputRef.current)
      outputRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [output]);

  const saveProvider = (p) => {
    setProvider(p);
    localStorage.setItem("td_provider", p);
    const dm = PROVIDERS[p].defaultModel;
    setModel(dm);
    localStorage.setItem("td_model", dm);
  };

  const saveModel = (m) => {
    setModel(m);
    localStorage.setItem("td_model", m);
  };

  const saveApiKey = (p, key) => {
    const updated = { ...apiKeys, [p]: key };
    setApiKeys(updated);
    localStorage.setItem("td_api_keys", JSON.stringify(updated));
  };

  const currentKey = apiKeys[provider] || "";
  const currentProvider = PROVIDERS[provider];

  const decode = async () => {
    if (!input.trim() || loading) return;
    if (!currentKey.trim()) {
      setShowSettings(true);
      setError(`请先设置 ${currentProvider.name} 的 API Key`);
      return;
    }

    setLoading(true);
    setOutput("");
    setError("");

    const userMessage =
      mode === "term"
        ? `请解码这个术语：「${input.trim()}」`
        : `请帮我理解这段话：\n\n${input.trim()}`;

    try {
      const result = await callLLM({ provider, apiKey: currentKey.trim(), model, userMessage });
      setOutput(result || "出错了，请重试");
      const newHistory = [
        { input: input.trim(), output: result, mode, provider },
        ...history.slice(0, 9),
      ];
      setHistory(newHistory);
      localStorage.setItem("td_history", JSON.stringify(newHistory));
    } catch (e) {
      setError(`错误：${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) decode();
  };

  const loadHistory = (item) => {
    setInput(item.input);
    setOutput(item.output);
    setMode(item.mode);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("td_history");
  };

  const formatOutput = (text) =>
    text.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} className="spacer" />;
      return <p key={i} className="output-line">{line}</p>;
    });

  return (
    <div className="app">
      <header className="header">
        <div className="header-label">术语破译机</div>
        <h1 className="header-title">先建直觉，<span className="accent">后挂标签</span></h1>
        <p className="header-sub">粘进来，读懂它</p>
      </header>

      {/* Settings */}
      <div className="card settings-card">
        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-provider-badge">{currentProvider.name}</span>
            <span className="settings-model-name">{model}</span>
            <span className={`settings-key-status ${currentKey ? "ok" : "missing"}`}>
              {currentKey ? "🔑" : "🔓"}
            </span>
          </div>
          <button className="btn-ghost" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "收起" : "配置"}
          </button>
        </div>

        {showSettings && (
          <div className="settings-panel">
            <div className="provider-tabs">
              {Object.entries(PROVIDERS).map(([key, p]) => (
                <button
                  key={key}
                  className={`provider-tab ${provider === key ? "active" : ""}`}
                  onClick={() => saveProvider(key)}
                >
                  {p.name}
                  {apiKeys[key] && <span className="tab-dot" />}
                </button>
              ))}
            </div>

            <div className="settings-field">
              <label className="field-label">模型</label>
              <select className="field-select" value={model} onChange={(e) => saveModel(e.target.value)}>
                {currentProvider.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="settings-field">
              <label className="field-label">API Key</label>
              <input
                type="password"
                className="api-input"
                placeholder={currentProvider.placeholder}
                value={currentKey}
                onChange={(e) => saveApiKey(provider, e.target.value)}
              />
              <p className="api-hint">
                Key 仅存于本地浏览器，不经过任何服务器。获取：{" "}
                <a href={currentProvider.docUrl} target="_blank" rel="noreferrer">
                  {currentProvider.docUrl.replace("https://", "").split("/")[0]}
                </a>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main */}
      <div className="card main-card">
        <div className="mode-toggle">
          {[["term", "单个术语"], ["passage", "整段话"]].map(([val, label]) => (
            <button key={val} onClick={() => setMode(val)} className={`mode-btn ${mode === val ? "active" : ""}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={mode === "term" ? "粘入一个术语，比如 mechanotransduction..." : "粘入一段看不懂的话..."}
            className="textarea"
            rows={mode === "term" ? 3 : 6}
          />
          <div className="input-footer">
            <span className="hint-text">⌘ + Enter 快速解码</span>
            <button onClick={decode} disabled={!input.trim() || loading} className="btn-primary">
              {loading ? "解码中..." : "解码 →"}
            </button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {(output || loading) && (
          <div ref={outputRef} className="output-box">
            {loading ? (
              <div className="loading-text"><span className="pulse">◆</span> 正在翻译...</div>
            ) : (
              <div className="output-content">{formatOutput(output)}</div>
            )}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="history-section">
          <div className="history-header">
            <span className="history-label">最近解码</span>
            <button className="btn-ghost small" onClick={clearHistory}>清空</button>
          </div>
          <div className="history-list">
            {history.map((item, i) => (
              <button key={i} className="history-item" onClick={() => loadHistory(item)}>
                <span className="history-tag">{item.mode === "term" ? "词" : "段"}</span>
                <span className="history-text">
                  {item.input.slice(0, 60)}{item.input.length > 60 ? "..." : ""}
                </span>
                {item.provider && (
                  <span className="history-provider">{PROVIDERS[item.provider]?.name.split(" ")[0]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="footer">
        逻辑是共通的，只是语言不同 ·{" "}
        <a href="https://github.com/Andyaoao123/term-decoder" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
