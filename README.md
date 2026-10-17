# OUAGX — provider gateway

Static Vite + React app. Home page (`#/`) is the landing page; `#/app` is the BYOK chat console.

Providers: OpenAI, Anthropic, Google Gemini, Mistral, DeepSeek, xAI Grok,
OpenRouter, plus any OpenAI-compatible endpoint (Groq, Together, Ollama
tunnels) via a custom base URL.

## Run locally

```bash
cd ouagx
npm install
npm run dev
```

Open the printed local URL in a browser. The landing page is home; click Console.

## Terminal client

```bash
node terminal/chat.mjs --provider deepseek
```

Same 8 providers in your terminal, keys via env vars or `~/.ouagx/keys.json`.
See [terminal/README.md](terminal/README.md).

## API server + connect from PowerShell (shared key)

Provider keys stay on the API machine; anyone with the shared key connects
from PowerShell with one command — no provider keys, no Node.js needed.

No key yet? Generate one at `https://ouagx.com/#/key` — made locally
in your browser, never sent anywhere.

On the API machine:

```powershell
$env:OUAGX_API_KEY = "a-long-random-string"
$env:OUAGX_DEEPSEEK_KEY = "sk-..."   # + any other providers you want
npm run api
```

On any Windows machine (the API lives at `ouagx.com/api`):

```powershell
$env:OUAGX_API_KEY = "the-shared-key"
& $HOME\ouagx\ouagx.ps1 -Once "hello in one word" -Provider deepseek -ApiUrl https://ouagx.com
```

Self-hosting the API instead? Point `-ApiUrl` at your machine, e.g.
`http://<api-host>:8080`.

Keep a copy with `irm https://ouagx.com/ouagx.ps1 -OutFile $HOME\ouagx\ouagx.ps1`,
or paste a single line with nothing to install:

```powershell
irm https://ouagx.com/ouagx.ps1 -OutFile $env:TEMP\ouagx.ps1; & $env:TEMP\ouagx.ps1 -Once "hi" -Provider openai -ApiUrl https://ouagx.com
```

Omit `-Once` for interactive chat (`/p <id>` provider, `/m <name>` model,
`/q` quit). `-ListProviders` and `-Help` work offline. Same 8 providers as
everywhere else. See [server/README.md](server/README.md) for endpoints,
env vars, and Amplify Function deploy.

## One-line PowerShell install (from ouagx.com)

Once `ouagx.com` points at the Amplify app, anyone on Windows can install with:

```powershell
irm https://ouagx.com/install.ps1 | iex
```

The installer (`public/install.ps1`) downloads the app source from GitHub,
installs dependencies, builds, and launches OUAGX at `http://localhost:4173/`.

## Build

```bash
npm run build
```

## Deploy on AWS Amplify Hosting

1. Push the `ouagx/` folder to a git repo.
2. Amplify Console → New app → Host web app → select the repo.
3. Amplify detects `amplify.yml`: `npm ci`, `npm run build`, serves `dist/`.
4. No env vars needed. Keys are pasted in the browser and stay in `localStorage`.

For production, put provider keys in an Amplify Function proxy instead of the browser.
