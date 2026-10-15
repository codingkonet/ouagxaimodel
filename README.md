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
