import { config } from './config.js';

export class UpstreamError extends Error {}

function describeFailure(status, body) {
  let detail = body;
  try {
    const json = JSON.parse(body);
    detail = json.error?.message || json.message || body;
  } catch {}
  if (status === 401) return 'Z.ai rejected the API key. Check ZAI_API_KEY in .env (it should be the full key, including the part after the dot).';
  if (status === 429) return `Z.ai rate limit or plan quota reached. ${detail}`.trim();
  if (status === 400 && /cannot be disabled/i.test(detail)) return `"${config.zai.model}" can't run with thinking off on this endpoint. Set ZAI_REASONING_EFFORT=low in .env.`;
  if (status === 400 && /model/i.test(detail)) return `Z.ai did not accept the model "${config.zai.model}". ${detail}`;
  return `Z.ai error ${status}: ${String(detail).slice(0, 300)}`;
}

/**
 * Streams a chat completion from Z.ai's OpenAI-compatible endpoint.
 * Calls onDelta(text) for each content chunk and onThinking() while the model is reasoning.
 */
export async function streamChat({ messages, signal, onDelta, onThinking }) {
  const { apiKey, baseUrl, model, thinking, reasoningEffort, temperature, maxTokens } = config.zai;
  const reasoning = reasoningEffort
    ? { reasoning_effort: reasoningEffort }
    : { thinking: { type: thinking ? 'enabled' : 'disabled' } };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US,en',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      ...reasoning,
    }),
    signal,
  });

  if (!res.ok) throw new UpstreamError(describeFailure(res.status, await res.text()));

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;

      const data = line.slice(5).trim();
      if (data === '[DONE]') return;

      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new UpstreamError(json.error.message || 'Z.ai returned an error mid-stream');

      const delta = json.choices?.[0]?.delta;
      if (delta?.reasoning_content) onThinking?.();
      if (delta?.content) onDelta(delta.content);
    }
  }
}
