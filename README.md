# 术语破译机 · Term Decoder

> 先建直觉，后挂标签。

一个帮你用日常语言理解陌生领域专业术语的小工具。

**核心理念**：逻辑是各领域共通的，卡住你的不是理解力，是语言的陌生感。

---

## 功能

- **单个术语模式**：输入一个词，得到：做什么事 → 类比 → 为什么存在 → 最后才给专业定义
- **整段话模式**：额外输出「事件地图」（谁 → 对谁做了什么 → 导致什么结果）
- 历史记录本地保存（最多 10 条）
- API Key 本地存储，不经过任何服务器

---

## 快速开始

### 在线使用

部署到 GitHub Pages / Vercel / Netlify 后直接访问，需要自备 Anthropic API Key。

### 本地运行

```bash
git clone https://github.com/Andyaoao123/term-decoder.git
cd term-decoder
npm install
npm run dev
```

### 构建

```bash
npm run build
# dist/ 目录即可部署到任何静态托管
```

---

## 部署到 GitHub Pages

```bash
npm install --save-dev gh-pages
# package.json 中 scripts 加上：
# "deploy": "gh-pages -d dist"
npm run build && npm run deploy
```

或直接用 Vercel / Netlify 一键部署，连接 GitHub 仓库即可。

---

## API Key

工具使用 [Anthropic Claude API](https://www.anthropic.com)，需要自备 API Key：

1. 前往 [console.anthropic.com](https://console.anthropic.com/settings/keys) 创建 Key
2. 在工具界面输入，Key 仅存于本地 `localStorage`，不上传任何服务器

**费用参考**：使用 `claude-3-5-haiku` 模型，每次解码约消耗 $0.001 或更少。

---

## 隐私说明

- API Key 仅保存在用户本地浏览器（`localStorage`）
- 历史记录仅保存在用户本地浏览器
- 应用本身不收集、不传输任何数据
- 用户输入的内容会发送至 Anthropic API 进行处理，受 [Anthropic 隐私政策](https://www.anthropic.com/privacy) 约束

---

## Tech Stack

- React 18 + Vite
- Anthropic Claude API（claude-3-5-haiku-20241022）
- 纯 CSS，无 UI 框架依赖

---

## License

MIT
