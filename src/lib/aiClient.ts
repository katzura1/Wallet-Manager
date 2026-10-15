const AI_ENDPOINT = "https://semeru.gaionix.com/api/gateway/anthropic/v1/messages";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

interface CallAIOptions {
  apiKey: string;
  model: string;
  system?: string;
  content: string | ContentBlock[];
  maxTokens?: number;
}

export async function callAI({ apiKey, model, system, content, maxTokens = 2048 }: CallAIOptions): Promise<string> {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    let message = `AI request gagal (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error?.message) message += ` ${body.error.message}`;
    } catch {
      // body bukan JSON, pakai pesan default
    }
    throw new Error(message);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("")
    .trim();

  if (!text) {
    throw new Error("AI tidak mengembalikan teks. Coba lagi.");
  }

  return text;
}
