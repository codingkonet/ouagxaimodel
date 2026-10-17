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

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError('');
    const nextThread = [...thread, { role: 'user', content: text }];
    setThread(nextThread);
    setInput('');
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
                <div className="bubble">{m.content}</div>
              </div>
            ))}
            {busy && <p className="hint">Contacting {provider.label}…</p>}
          </div>
          {error && <div className="error">{error}</div>}
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
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(key);
      } else {
        const area = document.createElement('textarea');
        area.value = key;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
    } catch {
      setError('Copy failed - select the key and copy it manually.');
    }
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

      <h2 className="section-title">Use it</h2>
      <div className="panel">
        <p>On the API machine, set the key you copied, add a provider key, and start:</p>
        <p><code>$env:OUAGX_API_KEY = "paste-the-key-here"</code></p>
        <p><code>$env:OUAGX_DEEPSEEK_KEY = "sk-..."</code></p>
        <p><code>npm run api</code></p>
        <p className="hint">Then give people the shared key with the PowerShell command.</p>
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
