import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { readActiveSelection } from "./browser.js";
import { callLLM } from "./llm.js";
import { PROVIDERS } from "./providers.js";
import {
  clearHistoryItems,
  loadSettings,
  loadWasherFeedback,
  saveHistoryItems,
  saveSetting,
  saveWasherFeedback,
} from "./storage.js";

const EMPTY_SETTINGS = {
  provider: "deepseek",
  model: PROVIDERS.deepseek.defaultModel,
  apiKeys: {},
  history: [],
};

const WASH_LEVELS = [
  { id: "coarse", label: "粗洗", retention: "保留约 60%" },
  { id: "fine", label: "精洗", retention: "保留约 30%" },
  { id: "extreme", label: "极洗", retention: "保留约 10%" },
];

const WASH_PROFILES = [
  {
    id: "balanced",
    label: "平衡模式",
    description: "默认口味，先去掉明显水分，再尽量保留跳跃点",
  },
  {
    id: "strict",
    label: "严格模式",
    description: "清洗更狠，铺垫、重复和弱断言会被更积极压缩",
  },
  {
    id: "gentle",
    label: "宽松模式",
    description: "只洗最明显的肉，最大化保留可能有用的连接点",
  },
];

const DEFAULT_WASHER_LEVELS = ["coarse", "fine"];

const TERM_SYSTEM_PROMPT = `
你是一个“术语破译机”。
目标：帮助用户先建立直觉，再补专业标签。

输出要求：
1. 语言简洁、口语化、不要说教。
2. 优先回答“它在做什么”，而不是先下定义。
3. 如果输入是术语，按这个结构输出：
- 它在做什么：一句话，日常语言
- 一个类比：贴近日常
- 为什么存在：它解决什么问题
- 专业标签：最后再给术语定义
4. 如果输入是一段话，额外补一个“事件地图”：
- 谁 -> 对谁做了什么 -> 导致什么结果
`;

function getInitialInput() {
  const params = new URLSearchParams(window.location.search);
  return params.get("text") || "";
}

function segmentText(text) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const segments = [];

  normalized.forEach((paragraph) => {
    const parts = paragraph
      .split(/(?<=[。！？!?；;])/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      return;
    }

    parts.forEach((part) => {
      const cleaned = part.replace(/\s+/g, " ").trim();
      if (cleaned) {
        segments.push(cleaned);
      }
    });
  });

  if (segments.length === 0 && text.trim()) {
    return [text.trim()];
  }

  return segments;
}

function escapeJsonString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildWasherPrompt({
  text,
  profile,
  selectedLevels,
  reverseTraining,
  feedbackSummary,
}) {
  const segments = segmentText(text);
  const indexedSegments = segments.map(
    (segment, index) => `${index + 1}. "${escapeJsonString(segment)}"`
  );

  const requestedLevels = WASH_LEVELS.filter((item) =>
    selectedLevels.includes(item.id)
  )
    .map((item) => `${item.label}（${item.retention}）`)
    .join("、");

  return `
你是“洗肉机”，任务不是替用户做判断，而是把判断过程展示给用户看。

请处理一段高密度文本，识别哪些部分是“骨头”，哪些部分更像“肉”。

工作原则：
1. 不要重写原文立场，不要擅自补论证。
2. 先基于通用语言规则判断：修饰性铺垫、重复表述、过渡句、举例延展、论证软肋。
3. 如果一句话有信息密度但表达拖沓，可以保留为骨头，同时指出拖沓点。
4. 你的判断要可见，所以必须逐句给出 importance 和 reasonLabel。
5. importance 只能是 0/1/2/3：
   - 0 = 明显肉
   - 1 = 可留可不留，适合粗洗保留
   - 2 = 核心 claim / 关键证据
   - 3 = 骨头中的骨头，一眼就该留下
6. 如果开启反向训练模式，请把你最犹豫、最需要用户确认的句子标成 suspect=true。
7. 洗肉风格：${profile.label}。说明：${profile.description}
8. 这次用户要求输出档位：${requestedLevels || "粗洗、精洗、极洗"}。
${
  feedbackSummary
    ? `9. 这个用户最近的反馈偏好是：${feedbackSummary}`
    : "9. 暂无用户历史反馈。"
}

关键术语提取要求：
- 术语应当是后续值得送去“术语破译机”的词组，不要提取无意义常用词。
- 输出 3-12 个即可。

请只返回合法 JSON，不要加 markdown 代码块，不要解释。
JSON 结构如下：
{
  "oneLineCore": "一句话核心",
  "levels": {
    "coarse": { "summary": "..." },
    "fine": { "summary": "..." },
    "extreme": { "summary": "..." }
  },
  "terms": ["术语1", "术语2"],
  "segments": [
    {
      "index": 1,
      "importance": 0,
      "reasonLabel": "修饰性铺垫",
      "reasonNote": "为什么这么判",
      "suspect": false
    }
  ]
}

待处理句子如下：
${indexedSegments.join("\n")}

反向训练模式：${reverseTraining ? "开启" : "关闭"}。
`;
}

function parseJsonResponse(rawText) {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  try {
    return JSON.parse(jsonCandidate);
  } catch {
    const start = jsonCandidate.indexOf("{");
    const end = jsonCandidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(jsonCandidate.slice(start, end + 1));
    }
    throw new Error("模型返回的结构无法解析");
  }
}

function summarizeFeedback(feedbackItems) {
  if (!feedbackItems.length) {
    return "";
  }

  const counts = feedbackItems.reduce((accumulator, item) => {
    const key = `${item.reasonLabel}:${item.decision}`;
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key, count]) => {
      const [reasonLabel, decision] = key.split(":");
      return `${reasonLabel}${decision === "keep" ? "更常被保留" : "更常被判为肉"}（${count}次）`;
    })
    .join("；");
}

function normalizeWasherResult(text, parsed) {
  const sourceSegments = segmentText(text);
  const parsedSegments = Array.isArray(parsed?.segments) ? parsed.segments : [];
  const segmentMap = new Map(parsedSegments.map((item) => [item.index, item]));

  const segments = sourceSegments.map((segment, index) => {
    const item = segmentMap.get(index + 1) || {};
    return {
      index: index + 1,
      text: segment,
      importance: Number.isFinite(item.importance)
        ? Math.max(0, Math.min(3, item.importance))
        : 1,
      reasonLabel: item.reasonLabel || "信息保留",
      reasonNote: item.reasonNote || "",
      suspect: Boolean(item.suspect),
    };
  });

  return {
    oneLineCore: parsed?.oneLineCore || "",
    levels: {
      coarse: { summary: parsed?.levels?.coarse?.summary || "" },
      fine: { summary: parsed?.levels?.fine?.summary || "" },
      extreme: { summary: parsed?.levels?.extreme?.summary || "" },
    },
    terms: Array.isArray(parsed?.terms)
      ? parsed.terms.filter((item) => typeof item === "string" && item.trim())
      : [],
    segments,
  };
}

function shouldKeepForLevel(importance, levelId) {
  if (levelId === "coarse") {
    return importance >= 1;
  }

  if (levelId === "fine") {
    return importance >= 2;
  }

  return importance >= 3;
}

function buildLevelSummaryFromSegments(segments, levelId) {
  const summary = segments
    .filter((item) => shouldKeepForLevel(item.importance, levelId))
    .map((item) => item.text)
    .join(" ");

  return summary || "这一档没有稳定提炼出结果，可以先看带标记全文。";
}

function copyText(text) {
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return Promise.reject(new Error("当前环境不支持剪贴板"));
}

function buildHistoryPreview(item) {
  return item.input.slice(0, 60) + (item.input.length > 60 ? "..." : "");
}

function WasherOutput({
  result,
  selectedLevels,
  reverseTraining,
  onFeedback,
  feedbackState,
  copyTerms,
}) {
  const orderedLevels = WASH_LEVELS.filter((item) =>
    selectedLevels.includes(item.id)
  );

  return (
    <div className="washer-results">
      <section className="washer-core-card">
        <div className="section-kicker">一句话核心</div>
        <p className="washer-core-text">
          {result.oneLineCore || "模型还没稳定抽出一句话核心，先看下面的带标记全文。"}
        </p>
      </section>

      <section className="washer-level-grid">
        {orderedLevels.map((level) => (
          <article key={level.id} className="washer-level-card">
            <div className="washer-level-head">
              <div>
                <h3>{level.label}</h3>
                <span>{level.retention}</span>
              </div>
            </div>
            <p>
              {result.levels[level.id]?.summary ||
                buildLevelSummaryFromSegments(result.segments, level.id)}
            </p>
          </article>
        ))}
      </section>

      <section className="washer-annotated-card">
        <div className="washer-section-head">
          <div>
            <div className="section-kicker">带标记全文</div>
            <p className="section-note">
              灰显但不删除，让判断过程直接暴露在眼前。
            </p>
          </div>
        </div>

        <div className="annotated-flow">
          {result.segments.map((segment) => {
            const isDropped = segment.importance === 0;
            const isSuspect = reverseTraining && segment.suspect;
            const feedback = feedbackState[segment.index];

            return (
              <div
                key={segment.index}
                className={`annotated-segment ${isDropped ? "is-dropped" : ""} ${
                  isSuspect ? "is-suspect" : ""
                }`}
              >
                <p className="annotated-text">{segment.text}</p>
                <div className="segment-meta">
                  <span className="reason-chip">{segment.reasonLabel}</span>
                  {segment.reasonNote && (
                    <span className="reason-note">{segment.reasonNote}</span>
                  )}
                </div>
                {isSuspect && (
                  <div className="training-actions">
                    <button
                      className={`feedback-btn ${feedback === "keep" ? "active" : ""}`}
                      onClick={() => onFeedback(segment, "keep")}
                    >
                      这里其实该留
                    </button>
                    <button
                      className={`feedback-btn ${feedback === "drop" ? "active" : ""}`}
                      onClick={() => onFeedback(segment, "drop")}
                    >
                      这里确实是肉
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="washer-terms-card">
        <div className="washer-section-head">
          <div>
            <div className="section-kicker">术语清单</div>
            <p className="section-note">方便手动送进术语破译机，不做自动接管。</p>
          </div>
          <button className="btn-ghost" onClick={copyTerms}>
            一键复制
          </button>
        </div>
        <div className="terms-list">
          {result.terms.length > 0 ? (
            result.terms.map((term) => (
              <span key={term} className="term-pill">
                {term}
              </span>
            ))
          ) : (
            <span className="terms-empty">这次没有提取出稳定术语。</span>
          )}
        </div>
      </section>
    </div>
  );
}

export default function TermDecoderApp({ variant = "web" }) {
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState(getInitialInput);
  const [output, setOutput] = useState("");
  const [washerResult, setWasherResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("term");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(variant === "web");
  const [provider, setProvider] = useState(EMPTY_SETTINGS.provider);
  const [model, setModel] = useState(EMPTY_SETTINGS.model);
  const [apiKeys, setApiKeys] = useState(EMPTY_SETTINGS.apiKeys);
  const [history, setHistory] = useState(EMPTY_SETTINGS.history);
  const [washerFeedback, setWasherFeedback] = useState([]);
  const [washerLevels, setWasherLevels] = useState(DEFAULT_WASHER_LEVELS);
  const [washerProfile, setWasherProfile] = useState("balanced");
  const [reverseTraining, setReverseTraining] = useState(false);
  const [feedbackState, setFeedbackState] = useState({});

  const outputRef = useRef(null);
  const isExtension = variant === "extension";

  useEffect(() => {
    let mounted = true;

    async function init() {
      const [settings, storedFeedback] = await Promise.all([
        loadSettings(),
        loadWasherFeedback(),
      ]);
      if (!mounted) {
        return;
      }

      const nextProvider =
        settings.provider && PROVIDERS[settings.provider]
          ? settings.provider
          : EMPTY_SETTINGS.provider;
      const nextModel = settings.model || PROVIDERS[nextProvider].defaultModel;

      setProvider(nextProvider);
      setModel(nextModel);
      setApiKeys(settings.apiKeys || {});
      setHistory(Array.isArray(settings.history) ? settings.history : []);
      setWasherFeedback(Array.isArray(storedFeedback) ? storedFeedback : []);
      setReady(true);
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if ((output || washerResult) && outputRef.current) {
      outputRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [output, washerResult]);

  const currentProvider = useMemo(() => PROVIDERS[provider], [provider]);
  const currentKey = apiKeys[provider] || "";
  const feedbackSummary = useMemo(
    () => summarizeFeedback(washerFeedback.slice(0, 40)),
    [washerFeedback]
  );

  const saveProvider = async (nextProvider) => {
    setProvider(nextProvider);
    const nextModel = PROVIDERS[nextProvider].defaultModel;
    setModel(nextModel);
    await saveSetting("provider", nextProvider);
    await saveSetting("model", nextModel);
  };

  const saveModel = async (nextModel) => {
    setModel(nextModel);
    await saveSetting("model", nextModel);
  };

  const saveApiKey = async (providerId, key) => {
    const nextApiKeys = { ...apiKeys, [providerId]: key };
    setApiKeys(nextApiKeys);
    await saveSetting("apiKeys", nextApiKeys);
  };

  const toggleWasherLevel = (levelId) => {
    setWasherLevels((current) => {
      if (current.includes(levelId)) {
        if (current.length === 1) {
          return current;
        }

        return current.filter((item) => item !== levelId);
      }

      return [...current, levelId];
    });
  };

  const decode = async () => {
    if (!input.trim() || loading) {
      return;
    }

    if (!currentKey.trim()) {
      setShowSettings(true);
      setError(`请先配置 ${currentProvider.name} 的 API Key`);
      return;
    }

    setLoading(true);
    setOutput("");
    setWasherResult(null);
    setError("");
    setFeedbackState({});

    const trimmedInput = input.trim();

    try {
      if (mode === "washer") {
        const rawResult = await callLLM({
          provider,
          apiKey: currentKey.trim(),
          model,
          systemPrompt:
            "你是一个严格遵守 JSON 输出要求的文本骨架提取助手。你只能输出 JSON。",
          userMessage: buildWasherPrompt({
            text: trimmedInput,
            profile:
              WASH_PROFILES.find((item) => item.id === washerProfile) ||
              WASH_PROFILES[0],
            selectedLevels: washerLevels,
            reverseTraining,
            feedbackSummary,
          }),
          maxTokens: 2200,
        });

        const parsedResult = normalizeWasherResult(
          trimmedInput,
          parseJsonResponse(rawResult)
        );

        setWasherResult(parsedResult);

        const nextHistory = [
          {
            input: trimmedInput,
            output: parsedResult.oneLineCore || buildHistoryPreview({ input: trimmedInput }),
            mode,
            provider,
          },
          ...history.slice(0, 9),
        ];
        setHistory(nextHistory);
        await saveHistoryItems(nextHistory);
        return;
      }

      const userMessage =
        mode === "term"
          ? `请帮我破译这个术语：${trimmedInput}`
          : `请帮我看懂这段话：\n\n${trimmedInput}`;

      const result = await callLLM({
        provider,
        apiKey: currentKey.trim(),
        model,
        userMessage,
        systemPrompt: TERM_SYSTEM_PROMPT,
      });

      const nextOutput = result || "没有拿到结果，请稍后再试。";
      setOutput(nextOutput);

      const nextHistory = [
        { input: trimmedInput, output: nextOutput, mode, provider },
        ...history.slice(0, 9),
      ];
      setHistory(nextHistory);
      await saveHistoryItems(nextHistory);
    } catch (caughtError) {
      setError(`请求失败：${caughtError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fillFromSelection = async () => {
    const selectedText = await readActiveSelection();
    if (!selectedText.trim()) {
      setError("当前页面没有读取到选中文本。先在网页里选中内容，再点扩展试试。");
      return;
    }

    const nextInput = selectedText.trim();
    setInput(nextInput);
    setError("");
    setMode(nextInput.length > 80 ? "passage" : "term");
  };

  const handleKey = (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      decode();
    }
  };

  const loadHistoryItem = (item) => {
    setInput(item.input);
    setOutput(item.mode === "washer" ? "" : item.output);
    setWasherResult(null);
    setMode(item.mode);
    setError("");
  };

  const clearHistory = async () => {
    setHistory([]);
    await clearHistoryItems();
  };

  const formatOutput = (text) =>
    text.split("\n").map((line, index) => {
      if (!line.trim()) {
        return <div key={index} className="spacer" />;
      }

      return (
        <p key={index} className="output-line">
          {line}
        </p>
      );
    });

  const handleFeedback = async (segment, decision) => {
    const nextFeedbackState = {
      ...feedbackState,
      [segment.index]: decision,
    };
    setFeedbackState(nextFeedbackState);

    const nextFeedback = [
      {
        segment: segment.text,
        reasonLabel: segment.reasonLabel,
        decision,
        timestamp: Date.now(),
      },
      ...washerFeedback,
    ].slice(0, 120);

    setWasherFeedback(nextFeedback);
    await saveWasherFeedback(nextFeedback);
  };

  const copyTerms = async () => {
    if (!washerResult?.terms?.length) {
      setError("这次还没有可复制的术语清单。");
      return;
    }

    try {
      await copyText(washerResult.terms.join("\n"));
      setError("");
    } catch (caughtError) {
      setError(`复制失败：${caughtError.message}`);
    }
  };

  const wrapperClassName = isExtension ? "app app-extension" : "app";

  return (
    <div className={wrapperClassName}>
      <header className="header">
        <div className="header-label">TERM DECODER</div>
        <h1 className="header-title">
          先建直觉，<span className="accent">后挂标签</span>
        </h1>
        <p className="header-sub">
          {isExtension ? "选中文本后点开扩展，也能手动粘贴继续处理" : "贴进来，先看清骨头，再决定怎么深入"}
        </p>
      </header>

      <div className="card settings-card">
        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-provider-badge">{currentProvider.name}</span>
            <span className="settings-model-name">{model}</span>
            <span className={`settings-key-status ${currentKey ? "ok" : "missing"}`}>
              {currentKey ? "已配置" : "未配置"}
            </span>
          </div>
          <button
            className="btn-ghost"
            onClick={() => setShowSettings((value) => !value)}
          >
            {showSettings ? "收起" : "配置"}
          </button>
        </div>

        {showSettings && ready && (
          <div className="settings-panel">
            <div className="provider-tabs">
              {Object.entries(PROVIDERS).map(([providerId, item]) => (
                <button
                  key={providerId}
                  className={`provider-tab ${provider === providerId ? "active" : ""}`}
                  onClick={() => saveProvider(providerId)}
                >
                  {item.name}
                  {apiKeys[providerId] && <span className="tab-dot" />}
                </button>
              ))}
            </div>

            <div className="settings-field">
              <label className="field-label">模型</label>
              <select
                className="field-select"
                value={model}
                onChange={(event) => saveModel(event.target.value)}
              >
                {currentProvider.models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
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
                onChange={(event) => saveApiKey(provider, event.target.value)}
              />
              <p className="api-hint">
                Key 只保存在本地浏览器，不经过你的服务器。获取地址：{" "}
                <a href={currentProvider.docUrl} target="_blank" rel="noreferrer">
                  {currentProvider.docUrl.replace("https://", "").split("/")[0]}
                </a>
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="card main-card">
        <div className="mode-toggle">
          {[
            ["term", "术语破译"],
            ["passage", "整段看懂"],
            ["washer", "洗肉机"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`mode-btn ${mode === value ? "active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="input-area">
          {isExtension && mode !== "washer" && (
            <div className="quick-actions">
              <button className="btn-secondary" onClick={fillFromSelection}>
                读取当前选中文本
              </button>
            </div>
          )}

          {mode === "washer" && (
            <div className="washer-controls">
              <div className="washer-block">
                <div className="washer-block-head">
                  <span className="field-label">颗粒度</span>
                  <span className="micro-note">可多选并排对照，至少保留一档</span>
                </div>
                <div className="chip-row">
                  {WASH_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      className={`chip-btn ${
                        washerLevels.includes(level.id) ? "active" : ""
                      }`}
                      onClick={() => toggleWasherLevel(level.id)}
                    >
                      {level.label}
                      <span>{level.retention}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="washer-block">
                <div className="washer-block-head">
                  <span className="field-label">洗肉风格</span>
                </div>
                <div className="profile-grid">
                  {WASH_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      className={`profile-card ${
                        washerProfile === profile.id ? "active" : ""
                      }`}
                      onClick={() => setWasherProfile(profile.id)}
                    >
                      <strong>{profile.label}</strong>
                      <span>{profile.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="training-toggle">
                <input
                  type="checkbox"
                  checked={reverseTraining}
                  onChange={(event) => setReverseTraining(event.target.checked)}
                />
                <div>
                  <span>反向训练模式</span>
                  <p>默认关闭。开启后，高亮最可疑的“肉”，由你手动确认或否决。</p>
                </div>
              </label>
            </div>
          )}

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKey}
            placeholder={
              mode === "term"
                ? "输入一个术语，比如 mechanotransduction..."
                : mode === "passage"
                ? "输入一段看不懂的话..."
                : "手动粘贴一段高密度文本，看看哪些是骨头，哪些只是肉..."
            }
            className="textarea"
            rows={mode === "term" ? 3 : mode === "washer" ? 10 : 6}
          />
          <div className="input-footer">
            <span className="hint-text">
              {mode === "washer"
                ? "手动粘贴，不做自动接管。Ctrl/Cmd + Enter 开始清洗"
                : isExtension
                ? "支持手动输入，也支持读取当前网页选中文本"
                : "Ctrl/Cmd + Enter 快速处理"}
            </span>
            <button
              onClick={decode}
              disabled={!ready || !input.trim() || loading}
              className="btn-primary"
            >
              {loading ? "处理中..." : mode === "washer" ? "开始清洗" : "开始破译"}
            </button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {(output || washerResult || loading) && (
          <div ref={outputRef} className="output-box">
            {loading ? (
              <div className="loading-text">
                <span className="pulse">●</span>
                {mode === "washer" ? "正在把骨头和肉分开..." : "正在破译..."}
              </div>
            ) : mode === "washer" && washerResult ? (
              <WasherOutput
                result={washerResult}
                selectedLevels={washerLevels}
                reverseTraining={reverseTraining}
                onFeedback={handleFeedback}
                feedbackState={feedbackState}
                copyTerms={copyTerms}
              />
            ) : (
              <div className="output-content">{formatOutput(output)}</div>
            )}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="history-section">
          <div className="history-header">
            <span className="history-label">最近处理</span>
            <button className="btn-ghost small" onClick={clearHistory}>
              清空
            </button>
          </div>
          <div className="history-list">
            {history.map((item, index) => (
              <button
                key={`${item.input}-${index}`}
                className="history-item"
                onClick={() => loadHistoryItem(item)}
              >
                <span className="history-tag">
                  {item.mode === "term"
                    ? "术语"
                    : item.mode === "passage"
                    ? "段落"
                    : "洗肉"}
                </span>
                <span className="history-text">{buildHistoryPreview(item)}</span>
                {item.provider && (
                  <span className="history-provider">
                    {PROVIDERS[item.provider]?.name.split(" ")[0]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isExtension && (
        <footer className="footer">
          逻辑是共通的，只是把判断过程摊开给你看。{" "}
          <a
            href="https://github.com/Andyaoao123/term-decoder"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </footer>
      )}
    </div>
  );
}
