import { useEffect, useMemo, useState } from 'react';
import { PROVIDERS, loadKeys, saveKeys, sendChat } from './lib/providers.js';
import { generateKey } from './lib/keygen.js';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  if (hash.startsWith('#/app')) return 'app';
  if (hash.startsWith('#/key')) return 'keygen';
  return 'home';
}

function Landing() {
  return (
    <div className="page">
      <div className="hero">
        <div>
          <div className="brand">OUAGX <small>provider gateway</small></div>
          <h1>One console for every AI provider you already pay for.</h1>
          <p className="lede">
            OUAGX is a bring-your-own-key gateway. Keep your OpenAI, Anthropic, Google,
            Groq, Together, or self-hosted endpoint keys, switch models in one place,
            and deploy the whole thing as a static site on AWS Amplify.
          </p>
          <div className="hero-actions">
            <a className="btn" href="#/app">Open the console</a>
            <a className="btn ghost" href="#providers">How providers work</a>
          </div>
          <ol className="steps">
            <li>Add one or more API keys in the console — they stay in your browser.</li>
            <li>Pick a provider and model, then chat.</li>
          </ol>
        </div>
        <img src="/logo.svg" alt="OUAGX logo" className="hero-logo" />
      </div>

      <h2 className="section-title" id="providers">Providers</h2>
      <div className="split">
        <div className="panel">
          <h3>First-party APIs</h3>
          <p>OpenAI, Anthropic, Google Gemini, Mistral, DeepSeek, xAI Grok, and OpenRouter — each called with your own key, straight from the browser.</p>
        </div>
        <div className="panel">
          <h3>Everything else via custom endpoint</h3>
          <p>Groq, Together, Fireworks, Ollama tunnels, and local servers work through the custom OpenAI-compatible base URL field.</p>
        </div>
      </div>

    </div>
  );
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    setCopied(await copyTextToClipboard(code));
  }
  return (
    <pre className="codeblock">
      <div className="code-head">
        <span>{lang || 'code'}</span>
        <button onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
      </div>
      <code>{code}</code>
    </pre>
  );
}

function InlineRich({ text }) {
  const bits = String(text).split(/(`[^`\n]+`)/g);
  return (
    <span>
      {bits.map((bit, i) => {
        if (bit.length > 2 && bit.startsWith('`') && bit.endsWith('`')) {
          return <code key={i}>{bit.slice(1, -1)}</code>;
        }
        const lines = bit.split('\n');
        return (
          <span key={i}>
            {lines.map((line, j) => (
              <span key={j}>
                {line}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}

function MessageBody({ text }) {
  const body = String(text || '');
  const segments = [];
  const fence = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = fence.exec(body)) !== null) {
    if (match.index > last) {
      segments.push({ kind: 'text', value: body.slice(last, match.index), key: key++ });
    }
    segments.push({ kind: 'code', lang: match[1].trim(), value: match[2].replace(/\n$/, ''), key: key++ });
    last = match.index + match[0].length;
  }
  if (last < body.length) {
    segments.push({ kind: 'text', value: body.slice(last), key: key++ });
  }
  return (
    <>
      {segments.map((s) =>
        s.kind === 'code' ? (
          <CodeBlock key={s.key} lang={s.lang} code={s.value} />
        ) : (
          <InlineRich key={s.key} text={s.value} />
        ),
      )}
    </>
  );
}

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TEXT_NAME_PATTERN = /\.(txt|md|markdown|js|jsx|ts|tsx|json|csv|css|html|xml|yml|yaml|log|py|java|c|cpp|h|sh|ps1|sql)$/i;
const ATTACH_ACCEPT = '.txt,.md,.js,.jsx,.ts,.tsx,.json,.csv,.css,.html,.xml,.yml,.yaml,.log,.py,.png,.jpg,.jpeg,.gif,.webp';
const MAX_IMAGES = 4;
const MAX_FILES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readFileAs(file, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    if (mode === 'image') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function Console() {
  const [keys, setKeys] = useState(() => loadKeys());
  const [providerId, setProviderId] = useState('openai');
  const [model, setModel] = useState(PROVIDERS[0].defaultModel);
  const [baseUrl, setBaseUrl] = useState('https://api.groq.com/openai/v1');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thread, setThread] = useState([
    { role: 'assistant', content: 'Pick a provider on the left, add its key, then ask something.' },
  ]);
  const [attachments, setAttachments] = useState([]);

  const provider = useMemo(() => PROVIDERS.find((p) => p.id === providerId), [providerId]);

  useEffect(() => {
    setModel(provider.defaultModel);
    setError('');
  }, [providerId]);

  function updateKey(name, value) {
    const next = { ...keys, [name]: value };
    setKeys(next);
    saveKeys(next);
  }

  function removeAttachment(index) {
    setAttachments(attachments.filter((_, i) => i !== index));
  }

  async function addFiles(list) {
    const picked = Array.from(list || []);
    if (picked.length === 0) return;
    setError('');
    const next = [...attachments];
    const problems = [];
    for (const file of picked) {
      if (IMAGE_MIME_TYPES.includes(file.type)) {
        if (next.filter((a) => a.kind === 'image').length >= MAX_IMAGES) {
          problems.push(`Only ${MAX_IMAGES} images per message.`);
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          problems.push(`${file.name} is over 5 MB.`);
          continue;
        }
        try {
          const dataUrl = await readFileAs(file, 'image');
          next.push({ kind: 'image', name: file.name, size: file.size, mediaType: file.type, dataUrl });
        } catch (e) {
          problems.push(e.message);
        }
      } else if (file.type === '' || file.type.startsWith('text/') || TEXT_NAME_PATTERN.test(file.name)) {
        if (next.filter((a) => a.kind === 'file').length >= MAX_FILES) {
          problems.push(`Only ${MAX_FILES} text files per message.`);
          continue;
        }
        if (file.size > MAX_TEXT_BYTES) {
          problems.push(`${file.name} is over 200 KB.`);
          continue;
        }
        try {
          const text = await readFileAs(file, 'text');
          next.push({ kind: 'file', name: file.name, size: file.size, text: String(text) });
        } catch (e) {
          problems.push(e.message);
        }
      } else {
        problems.push(`${file.name || 'That file'} is not supported (images: PNG, JPEG, GIF, WebP; plus text files).`);
      }
    }
    setAttachments(next);
    if (problems.length > 0) setError(problems.join(' '));
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    setError('');
    const files = attachments
      .filter((a) => a.kind === 'file')
      .map((a) => ({ name: a.name, size: a.size, text: a.text }));
    const images = attachments
      .filter((a) => a.kind === 'image')
      .map((a) => ({ name: a.name, size: a.size, mediaType: a.mediaType, dataUrl: a.dataUrl }));
    const nextThread = [...thread, { role: 'user', content: text, files, images }];
    setThread(nextThread);
    setInput('');
    setAttachments([]);
    setBusy(true);
    try {
      const reply = await sendChat({ providerId, keys, model, baseUrl, messages: nextThread });
      setThread([...nextThread, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h2>OUAGX console</h2>
      <p className="hint">Keys are stored only in this browser under <code>ouagx.keys</code>. Nothing is sent anywhere except the provider you select.</p>
      <div className="console">
        <div className="panel">
          <div className="field">
            <label>Provider</label>
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Model</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          {providerId === 'custom' && (
            <div className="field">
              <label>Base URL</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
          )}
          {PROVIDERS.map((p) => (
            <div className="field" key={p.keyName}>
              <label>{p.label} key</label>
              <input
                type="password"
                value={keys[p.keyName] || ''}
                onChange={(e) => updateKey(p.keyName, e.target.value)}
                placeholder="paste key"
              />
            </div>
          ))}
          <p className="hint">{provider.help}</p>
        </div>
        <div>
          <div className="thread">
            {thread.map((m, i) => (
              <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                <div className="who">{m.role === 'user' ? 'You' : `OUAGX · ${provider.label}`}</div>
                <div className="bubble">
                  {m.content && <MessageBody text={m.content} />}
                  {m.images && m.images.length > 0 && (
                    <div className="thumbs">
                      {m.images.map((img, j) => (
                        <img key={j} className="thumb" src={img.dataUrl} alt={img.name || 'attached image'} />
                      ))}
                    </div>
                  )}
                  {m.files && m.files.length > 0 && (
                    <div className="chips">
                      {m.files.map((f, j) => (
                        <span className="chip static" key={j}>{f.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="hint">Contacting {provider.label}…</p>}
          </div>
          {error && <div className="error">{error}</div>}
          <div className="attach-row">
            <label className="attach-btn">
              Attach files
              <input
                type="file"
                multiple
                accept={ATTACH_ACCEPT}
                onChange={async (e) => {
                  await addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {attachments.map((a, i) => (
              <span className="chip" key={i}>
                {a.kind === 'image' && <img className="chip-thumb" src={a.dataUrl} alt="" />}
                <span>{a.name} · {formatBytes(a.size)}</span>
                <button onClick={() => removeAttachment(i)} aria-label={`Remove ${a.name}`}>&times;</button>
              </span>
            ))}
          </div>
          <div className="composer">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Ask OUAGX something…"
              aria-label="Message"
            />
            <button className="btn" onClick={send} disabled={busy}>Send</button>
          </div>
          <p className="hint">Anthropic and some providers may block direct browser calls (CORS). If you see a fetch/CORS error, route that provider through a small proxy or an Amplify Function and keep the key server-side.</p>
        </div>
      </div>
    </div>
  );
}

function Keygen() {
  const [length, setLength] = useState(48);
  const [key, setKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  function make(n) {
    setError('');
    setCopied(false);
    try {
      setKey(generateKey(n));
    } catch (e) {
      setError(String((e && e.message) || e));
      setKey('');
    }
  }

  useEffect(() => { make(48); }, []);

  async function copy() {
    if (!key) return;
    const ok = await copyTextToClipboard(key);
    if (ok) setCopied(true);
    else setError('Copy failed - select the key and copy it manually.');
  }

  return (
    <div className="page">
      <h2>API key generator</h2>
      <p className="hint">
        Make a shared <code>OUAGX_API_KEY</code> for your API server. The key is
        generated inside your browser with a secure random generator and never
        sent anywhere.
      </p>
      <div className="panel">
        <div className="field">
          <label>Length</label>
          <select
            value={length}
            onChange={(e) => {
              const n = Number(e.target.value);
              setLength(n);
              make(n);
            }}
          >
            <option value={32}>32 characters</option>
            <option value={48}>48 characters (recommended)</option>
            <option value={64}>64 characters</option>
          </select>
        </div>
        <div className="field">
          <label>Your key</label>
          <input
            className="key-output"
            readOnly
            value={key}
            onFocus={(e) => e.target.select()}
            placeholder="Generating..."
            aria-label="Generated API key"
          />
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={() => make(length)}>Generate new key</button>
          <button className="btn ghost" onClick={copy} disabled={!key}>Copy</button>
          {copied && <span className="copy-ok">Copied!</span>}
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      <h2 className="section-title">Run your API machine</h2>
      <div className="panel">
        <ol className="steps">
          <li>Copy the key above - it becomes your shared <code>OUAGX_API_KEY</code>.</li>
          <li>
            On the API machine, open PowerShell in your OUAGX folder:
            <br /><code>cd $env:LOCALAPPDATA\OUAGX</code>
          </li>
          <li>
            Set the shared key and at least one provider key:
            <br /><code>$env:OUAGX_API_KEY = &quot;{key || 'paste-the-key-here'}&quot;</code>
            <br /><code>$env:OUAGX_DEEPSEEK_KEY = &quot;sk-...&quot;</code>
          </li>
          <li>
            Start the API and leave the window open:
            <br /><code>npm run api</code>
          </li>
          <li>
            Check it in a second window:
            <br /><code>irm http://127.0.0.1:8080/api/health</code>
            <br /><span className="hint">ok : True means it is running.</span>
          </li>
          <li>
            Ask it from any machine:
            <br /><code>$env:OUAGX_API_KEY = &quot;{key || 'paste-the-key-here'}&quot;</code>
            <br /><code>irm https://ouagx.com/ouagx.ps1 -OutFile $env:TEMP\ouagx.ps1</code>
            <br /><code>&amp; $env:TEMP\ouagx.ps1 -Once &quot;hi&quot; -Provider deepseek -ApiUrl http://localhost:8080</code>
          </li>
        </ol>
        <p className="hint">
          Other computers on your network? Start the API with
          <code> $env:OUAGX_HOST = &quot;0.0.0.0&quot; </code>
          and point -ApiUrl at this machine&apos;s IP address.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  return (
    <>
      <header className="topbar">
        <div className="brand">OUAGX<small>gateway console</small></div>
        <nav className="nav">
          <a href="#/">Home</a>
          <a href="#/key">API key</a>
          <a href="#/app" className="cta">Console</a>
        </nav>
      </header>
      {route === 'app' ? <Console /> : route === 'keygen' ? <Keygen /> : <Landing />}
      <footer className="footer">
        <span>© {new Date().getFullYear()} OUAGX. All rights reserved.</span>
        <span>Bring-your-own-key gateway — keys stay in your browser.</span>
      </footer>
    </>
  );
}
