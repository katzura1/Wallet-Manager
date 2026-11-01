import test from "node:test";
import assert from "node:assert/strict";
import { callAI } from "../src/lib/aiClient.ts";

test("sends DeepSeek chat completions payload and reads the OpenAI-style response", async (t) => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; init: RequestInit; body: Record<string, unknown> } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured = { url, init, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ choices: [{ message: { content: "```json\n{\"ok\":true}\n```" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const text = await callAI({ apiKey: "sk-test", model: "deepseek-flash", system: "sys", content: "hi" });

  assert.equal(text, '{"ok":true}');
  assert.equal(captured?.url, "https://api.deepseek.com/chat/completions");
  assert.equal((captured?.init.headers as Record<string, string>).Authorization, "Bearer sk-test");
  assert.deepEqual(captured?.body.messages, [
    { role: "system", content: "sys" },
    { role: "user", content: "hi" },
  ]);
  assert.equal(captured?.body.model, "deepseek-flash");
  assert.equal(captured?.body.stream, false);
  assert.deepEqual(captured?.body.thinking, { type: "disabled" });
});

test("passes receipt images as OpenAI-style image_url blocks", async (t) => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await callAI({
    apiKey: "sk-test",
    model: "deepseek-flash",
    content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }],
  });

  assert.deepEqual((body?.messages as Array<{ content: unknown }>)[0].content, [
    { type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } },
  ]);
});
