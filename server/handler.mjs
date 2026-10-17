// OUAGX API core — framework-free request handling shared by server.mjs
// (plain Node http server) and lambda.mjs (AWS Lambda / Amplify Function).
// All provider keys live here, server-side. Clients authenticate with the
// shared OUAGX_API_KEY via `Authorization: Bearer <key>`.
import { timingSafeEqual } from 'node:crypto';

export const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', keyName: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', kind: 'openai' },
  { id: 'anthropic', label: 'Anthropic', keyName: 'anthropic', baseUrl: '', model: 'claude-3-5-haiku-latest', kind: 'anthropic' },
  { id: 'gemini', label: 'Google Gemini', keyName: 'gemini', baseUrl: '', model: 'gemini-2.0-flash', kind: 'gemini' },
  { id: 'mistral', label: 'Mistral', keyName: 'mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', kind: 'openai' },
  { id: 'deepseek', label: 'DeepSeek', keyName: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', kind: 'openai' },
  { id: 'xai', label: 'xAI (Grok)', keyName: 'xai', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini', kind: 'openai' },
  { id: 'openrouter', label: 'OpenRouter', keyName: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', kind: 'openai' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', keyName: 'compatibleKey', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant', kind: 'openai' },
];

const ENV_BY_KEYNAME = {
  openai: 'OUAGX_OPENAI_KEY',
  anthropic: 'OUAGX_ANTHROPIC_KEY',
  gemini: 'OUAGX_GEMINI_KEY',
  mistral: 'OUAGX_MISTRAL_KEY',
  deepseek: 'OUAGX_DEEPSEEK_KEY',
  xai: 'OUAGX_XAI_KEY',
  openrouter: 'OUAGX_OPENROUTER_KEY',
  compatibleKey: 'OUAGX_COMPATIBLE_KEY',
};

export function providerById(id) {
  return PROVIDERS.find((p) => p.id === String(id || '').toLowerCase());
}

export function resolveProviderKey(provider, env) {
  const direct = env[ENV_BY_KEYNAME[provider.keyName]];
  if (direct) return direct;
  // Legacy spelling produced by terminal/chat.mjs for the custom key.
  if (provider.id === 'custom' && env.OUAGX_COMPATIBLEKEY_KEY) return env.OUAGX_COMPATIBLEKEY_KEY;
  return '';
}

export function checkAuth(headers, expected) {
  if (!expected) return false;
  const raw = headers.authorization ?? headers.Authorization ?? '';
  const match = /^Bearer (.+)$/.exec(String(raw).trim());
  if (!match) return false;
  const actual = Buffer.from(match[1]);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function readUpstreamError(res) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return res.statusText || 'upstream error';
  }
}

async function chatOpenAI({ key, model, baseUrl, messages }, fetchImpl) {
  let url;
  try {
    url = new URL('chat/completions', `${String(baseUrl).replace(/\/$/, '')}/`);
  } catch {
    fail(400, `Invalid base URL: ${baseUrl}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') fail(400, `Invalid base URL: ${baseUrl}`);
  const res = await fetchImpl(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await readUpstreamError(res)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(empty response)';
}

async function chatAnthropic({ key, model, messages }, fetchImpl) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 1024, messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await readUpstreamError(res)}`);
  const data = await res.json();
  return data.content?.map((b) => b.text || '').join('') || '(empty response)';
}

async function chatGemini({ key, model, messages }, fetchImpl) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await readUpstreamError(res)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '(empty response)';
}

function checkedMessages(input) {
  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    fail(400, 'Body needs "messages": a non-empty array of {role, content}.');
  }
  for (const message of messages) {
    if (!message || typeof message.content !== 'string' || typeof message.role !== 'string') {
      fail(400, 'Each message needs a string "role" and string "content".');
    }
  }
  return messages;
}

export async function chat(input, ctx) {
  const provider = providerById(input.provider);
  if (!provider) {
    fail(400, `Unknown provider: ${input.provider}. Choose: ${PROVIDERS.map((p) => p.id).join(', ')}`);
  }
  const key = resolveProviderKey(provider, ctx.env);
  if (!key) fail(500, `Server has no API key configured for ${provider.label}.`);
  const model = input.model || provider.model;
  const messages = checkedMessages(input);
  const fetchImpl = ctx.fetchImpl || fetch;
  try {
    let reply;
    if (provider.kind === 'anthropic') {
      reply = await chatAnthropic({ key, model, messages }, fetchImpl);
    } else if (provider.kind === 'gemini') {
      reply = await chatGemini({ key, model, messages }, fetchImpl);
    } else {
      const baseUrl = provider.id === 'custom' ? (input.baseUrl || provider.baseUrl) : provider.baseUrl;
      reply = await chatOpenAI({ key, model, baseUrl, messages }, fetchImpl);
    }
    return { reply, provider: provider.id, model };
  } catch (error) {
    if (error.status) throw error;
    fail(502, `${provider.label} error: ${error.message}`);
  }
}

export async function route(method, path, headers, bodyText, ctx) {
  const authorized = () => checkAuth(headers || {}, ctx.env.OUAGX_API_KEY || '');
  if (method === 'GET' && (path === '/health' || path === '/api/health')) {
    return { status: 200, json: { ok: true } };
  }
  if (method === 'GET' && path === '/api/providers') {
    if (!authorized()) return { status: 401, json: { error: 'Missing or invalid API key.' } };
    return {
      status: 200,
      json: { providers: PROVIDERS.map(({ id, label, model }) => ({ id, label, model })) },
    };
  }
  if (method === 'POST' && path === '/api/chat') {
    if (!authorized()) return { status: 401, json: { error: 'Missing or invalid API key.' } };
    let body;
    try {
      body = JSON.parse(bodyText || '');
    } catch {
      return { status: 400, json: { error: 'Request body must be JSON.' } };
    }
    try {
      return { status: 200, json: await chat(body || {}, ctx) };
    } catch (error) {
      return { status: error.status || 500, json: { error: error.message || 'Chat failed.' } };
    }
  }
  return { status: 404, json: { error: `Not found: ${method} ${path}` } };
}
