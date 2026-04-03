import { useState, useRef, useEffect } from "react";
import "./App.css";

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

export default function App() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("td_history") || "[]");
    } catch {
      return [];
    }
  });
  const [mode, setMode] = useState("term");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("td_api_key") || "");
  const [showApiInput, setShowApiInput] = useState(false);
  const [error, setError] = useState("");
  const outputRef = useRef(null);

  useEffect(() => {
    if (output && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [output]);

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem("td_api_key", key);
  };

  const decode = async () => {
    if (!input.trim() || loading) return;
    if (!apiKey.trim()) {
      setShowApiInput(true);
      setError("请先输入你的 Anthropic API Key");
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
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const result =
        data.content?.map((b) => b.text || "").join("") || "出错了，请重试";
      setOutput(result);

      const newHistory = [
        { input: input.trim(), output: result, mode },
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

  const formatOutput = (text) => {
    return text.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} className="spacer" />;
      return (
        <p key={i} className="output-line">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-label">术语破译机</div>
        <h1 className="header-title">
          先建直觉，<span className="accent">后挂标签</span>
        </h1>
        <p className="header-sub">粘进来，读懂它</p>
      </header>

      {/* API Key Setup */}
      <div className="card" style={{ maxWidth: 680, width: "100%", marginBottom: 16 }}>
        <div className="api-row">
          <span className="api-status">
            {apiKey ? "🔑 API Key 已设置" : "🔓 未设置 API Key"}
          </span>
          <button
            className="btn-ghost"
            onClick={() => setShowApiInput((v) => !v)}
          >
            {showApiInput ? "收起" : apiKey ? "修改" : "设置"}
          </button>
        </div>
        {showApiInput && (
          <div className="api-input-row">
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
              className="api-input"
            />
            <p className="api-hint">
              Key 仅保存在本地浏览器，不上传任何服务器。
              获取：<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>
            </p>
          </div>
        )}
      </div>

      {/* Main Card */}
      <div className="card main-card">
        {/* Mode Toggle */}
        <div className="mode-toggle">
          {[["term", "单个术语"], ["passage", "整段话"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setMode(val)}
              className={`mode-btn ${mode === val ? "active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              mode === "term"
                ? "粘入一个术语，比如 mechanotransduction..."
                : "粘入一段看不懂的话..."
            }
            className="textarea"
            rows={mode === "term" ? 3 : 6}
          />
          <div className="input-footer">
            <span className="hint-text">⌘ + Enter 快速解码</span>
            <button
              onClick={decode}
              disabled={!input.trim() || loading}
              className="btn-primary"
            >
              {loading ? "解码中..." : "解码 →"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <div className="error-box">{error}</div>}

        {/* Output */}
        {(output || loading) && (
          <div ref={outputRef} className="output-box">
            {loading ? (
              <div className="loading-text">
                <span className="pulse">◆</span> 正在翻译...
              </div>
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
            <button className="btn-ghost small" onClick={clearHistory}>
              清空
            </button>
          </div>
          <div className="history-list">
            {history.map((item, i) => (
              <button key={i} className="history-item" onClick={() => loadHistory(item)}>
                <span className="history-tag">{item.mode === "term" ? "词" : "段"}</span>
                <span className="history-text">
                  {item.input.slice(0, 60)}
                  {item.input.length > 60 ? "..." : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        逻辑是共通的，只是语言不同 ·{" "}
        <a href="https://github.com/Andyaoao123/term-decoder" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
