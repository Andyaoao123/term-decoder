import { ENDPOINTS, SYSTEM_PROMPT } from "./providers.js";

async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function callLLM({
  provider,
  apiKey,
  model,
  userMessage,
  systemPrompt = SYSTEM_PROMPT,
  maxTokens = 1600,
}) {
  const endpoint = ENDPOINTS[provider];

  if (!endpoint) {
    throw new Error(`不支持的 provider: ${provider}`);
  }

  if (provider === "anthropic") {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const data = await response.json();
    return data.content?.map((item) => item.text || "").join("") || "";
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://term-decoder.local";
    headers["X-Title"] = "Term Decoder Extension";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
