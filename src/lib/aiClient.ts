const AI_ENDPOINT = "https://api.deepseek.com/chat/completions";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface CallAIOptions {
  apiKey: string;
  model: string;
  system?: string;
  content: string | ContentBlock[];
  maxTokens?: number;
}

function stripCodeFence(text: string): string {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

export async function callAI({ apiKey, model, system, content, maxTokens = 2048 }: CallAIOptions): Promise<string> {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: false,
      // Task ini parsing terstruktur; thinking default DeepSeek "enabled" hanya menambah latency + token.
      thinking: { type: "disabled" },
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content },
      ],
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
  const text = stripCodeFence(String(data?.choices?.[0]?.message?.content ?? "").trim());

  if (!text) {
    throw new Error("AI tidak mengembalikan teks. Coba lagi.");
  }

  return text;
}
