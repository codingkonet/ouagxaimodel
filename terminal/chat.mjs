#!/usr/bin/env node
// OUAGX terminal client — chat with any provider from the command line.
// Usage:
//   node chat.mjs                      interactive chat (default: OpenAI)
//   node chat.mjs --provider deepseek   start on another provider
//   node chat.mjs --once "hello"        single question, print answer, exit
//
// API keys (never committed), first match wins:
//   1. env vars: OUAGX_OPENAI_KEY, OUAGX_ANTHROPIC_KEY, OUAGX_GEMINI_KEY,
//      OUAGX_MISTRAL_KEY, OUAGX_DEEPSEEK_KEY, OUAGX_XAI_KEY,
//      OUAGX_OPENROUTER_KEY, OUAGX_COMPATIBLE_KEY
//   2. ~/.ouagx/keys.json  e.g. { "openai": "sk-...", "deepseek": "..." }

import { createInterface } from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', keyName: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', keyName: 'anthropic', model: 'claude-3-5-haiku-latest' },
  { id: 'gemini', label: 'Google Gemini', keyName: 'gemini', model: 'gemini-2.0-flash' },
  { id: 'mistral', label: 'Mistral', keyName: 'mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  { id: 'deepseek', label: 'DeepSeek', keyName: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'xai', label: 'xAI (Grok)', keyName: 'xai', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini' },
  { id: 'openrouter', label: 'OpenRouter', keyName: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', keyName: 'compatibleKey', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant' },
];

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

let fileKeys = {};
const keyFile = join(homedir(), '.ouagx', 'keys.json');
if (existsSync(keyFile)) {
  try { fileKeys = JSON.parse(readFileSync(keyFile, 'utf8')); }
  catch { console.error(`Warning: could not parse ${keyFile}`); }
}
const keyOf = (name) => process.env[`OUAGX_${name.toUpperCase()}_KEY`] || fileKeys[name];

async function chatOpenAI({ key, model, baseUrl, messages }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(empty response)';
}

async function chatAnthropic({ key, model, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 1024, messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content?.map((b) => b.text || '').join('') || '(empty response)';
}

async function chatGemini({ key, model, messages }) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents }) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '(empty response)';
}

async function ask(provider, model, messages) {
  const key = keyOf(provider.keyName);
  if (!key) throw new Error(`No key for ${provider.label}. Set OUAGX_${provider.keyName.toUpperCase()}_KEY or add "${provider.keyName}" to ~/.ouagx/keys.json`);
  if (provider.id === 'anthropic') return chatAnthropic({ key, model, messages });
  if (provider.id === 'gemini') return chatGemini({ key, model, messages });
  return chatOpenAI({ key, model, baseUrl: provider.baseUrl, messages });
}

let provider = PROVIDERS.find((p) => p.id === (flag('--provider') || 'openai')) || PROVIDERS[0];
let model = flag('--model') || provider.model;
const once = flag('--once');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`OUAGX terminal client\n\nProviders: ${PROVIDERS.map((p) => p.id).join(', ')}\n\nOptions:\n  --provider <id>   start on this provider (default: openai)\n  --model <name>    override the model\n  --once "<text>"   ask once and exit\n\nChat commands: /p <id> switch provider, /m <name> switch model, /q quit`);
  process.exit(0);
}

async function turn(thread) {
  const reply = await ask(provider, model, thread);
  thread.push({ role: 'assistant', content: reply });
  console.log(`\n[${provider.label}] ${reply}\n`);
}

if (once) {
  await turn([{ role: 'user', content: once }]).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  });
  process.exit();
}

const thread = [];
console.log(`OUAGX terminal — ${provider.label} (${model}). Type /q to quit, /p <id> provider, /m <name> model.`);
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' });
rl.prompt();
rl.on('line', async (line) => {
  const text = line.trim();
  if (!text) return rl.prompt();
  if (text === '/q') return rl.close();
  if (text.startsWith('/p ')) {
    const next = PROVIDERS.find((p) => p.id === text.slice(3).trim());
    if (!next) { console.log(`Unknown provider. Choose: ${PROVIDERS.map((p) => p.id).join(', ')}`); }
    else { provider = next; model = next.model; console.log(`Switched to ${provider.label} (${model})`); }
    return rl.prompt();
  }
  if (text.startsWith('/m ')) {
    model = text.slice(3).trim();
    console.log(`Model: ${model}`);
    return rl.prompt();
  }
  thread.push({ role: 'user', content: text });
  try { await turn(thread); }
  catch (e) { thread.pop(); console.error(`Error: ${e.message}\n`); }
  rl.prompt();
});
rl.on('close', () => console.log('Bye.'));
