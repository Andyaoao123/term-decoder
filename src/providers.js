export const PROVIDERS = {
  anthropic: {
    name: "Claude (Anthropic)",
    placeholder: "sk-ant-...",
    docUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-3-5-haiku-20241022",
    models: [
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku（快）" },
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
      { id: "qwen-turbo", label: "Qwen Turbo（快）" },
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

export const ENDPOINTS = {
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

export const SYSTEM_PROMPT = `你是一个“术语解码器”，专门帮助用户理解陌生领域的专业术语和段落。
规则：
1. 永远先建直觉，后挂标签。
2. 用生活类比或动作描述，不要先给定义。
3. 固定结构输出：
- 它在做什么事：一句话，日常语言。
- 一个类比：贴近生活的比喻。
- 为什么存在：它解决了什么问题。
- 专业标签：最后再给术语定义。
4. 如果输入是一段话，而不是单个术语，再补一个“事件地图”：
- 谁 -> 对谁做了什么 -> 导致什么结果。

语言简洁，不说教，不绕。`;
