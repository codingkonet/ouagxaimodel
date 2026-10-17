export const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    keyName: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    help: 'Uses your key directly from the browser.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyName: 'anthropic',
    defaultModel: 'claude-3-5-haiku-latest',
    help: 'Browser calls need the key; some browsers block CORS — use a custom proxy if it fails.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyName: 'gemini',
    defaultModel: 'gemini-2.0-flash',
    help: 'Uses a Google AI Studio key.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    keyName: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    help: 'Get a key at console.mistral.ai.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    keyName: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    help: 'Get a key at platform.deepseek.com.',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    keyName: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-mini',
    help: 'Get a key at console.x.ai.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyName: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/auto',
    help: 'One key for hundreds of models.',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    keyName: 'compatibleKey',
    defaultModel: 'llama-3.1-8b-instant',
    help: 'Groq, Together, Ollama tunnels, or any /chat/completions endpoint.',
  },
];

export function loadKeys() {
  try {
    return JSON.parse(localStorage.getItem('ouagx.keys') || '{}');
  } catch {
    return {};
  }
}

export function saveKeys(keys) {
  localStorage.setItem('ouagx.keys', JSON.stringify(keys));
}

// ---- Message payload builders (pure; covered by providers.test.mjs) ----
// Console messages look like { role, content, files?, images? } where files
// is [{ name, text }] and images is [{ dataUrl, mediaType? }]. Builders turn
// them into each provider's wire shape. Plain { role, content } messages
// still work unchanged.

// Inline attached text files into the message text.
export function buildPayloadMessages(messages) {
  return (messages || []).map((m) => {
    let content = m.content || '';
    const files = Array.isArray(m.files) ? m.files : [];
    for (const file of files) {
      content += `${content ? '\n\n' : ''}[Attached file: ${file.name}]\n${file.text || ''}`;
    }
    const images = Array.isArray(m.images) ? m.images.filter((img) => img && img.dataUrl) : [];
    return { role: m.role, content, images };
  });
}

function splitDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(String(dataUrl || ''));
  if (!match) return { mediaType: 'image/png', data: '' };
  return { mediaType: match[1] || 'image/png', data: match[2] || '' };
}

export function buildOpenAIMessages(messages) {
  return buildPayloadMessages(messages).map((m) => {
    if (m.images.length === 0) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: [
        { type: 'text', text: m.content },
        ...m.images.map((img) => ({ type: 'image_url', image_url: { url: img.dataUrl } })),
      ],
    };
  });
}

export function buildAnthropicBody(model, messages) {
  const payload = buildPayloadMessages(messages);
  const system = payload
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const rest = payload
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.images.length === 0) return { role: m.role, content: m.content };
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          ...m.images.map((img) => {
            const parts = splitDataUrl(img.dataUrl);
            return {
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType || parts.mediaType, data: parts.data },
            };
          }),
        ],
      };
    });
  return { model, max_tokens: 1024, system: system || undefined, messages: rest };
}

export function buildGeminiBody(messages) {
  const payload = buildPayloadMessages(messages).filter((m) => m.role !== 'system');
  return {
    contents: payload.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: m.content },
        ...m.images.map((img) => {
          const parts = splitDataUrl(img.dataUrl);
          return { inline_data: { mime_type: img.mediaType || parts.mediaType, data: parts.data } };
        }),
      ],
    })),
  };
}

async function chatOpenAI({ key, model, baseUrl, messages }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: buildOpenAIMessages(messages) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
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
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(buildAnthropicBody(model, messages)),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.map((b) => b.text || '').join('') || '(empty response)';
}

async function chatGemini({ key, model, messages }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeminiBody(messages)),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '(empty response)';
}

export async function sendChat({ providerId, keys, model, baseUrl, messages }) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const key = keys[provider.keyName];
  if (!key) throw new Error(`Add your ${provider.label} key first.`);
  if (providerId === 'anthropic') {
    return chatAnthropic({ key, model, messages });
  }
  if (providerId === 'gemini') {
    return chatGemini({ key, model, messages });
  }
  return chatOpenAI({
    key,
    model,
    baseUrl: providerId === 'custom' ? baseUrl : provider.baseUrl,
    messages,
  });
}
