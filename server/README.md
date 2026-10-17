# OUAGX API server

Zero-dependency Node API that holds the provider keys server-side.
Clients (e.g. `public/ouagx.ps1`) authenticate with one shared key and
never see provider keys.

- `handler.mjs` — framework-free core: auth, routing, provider calls.
- `server.mjs` — plain Node `http` server. Run: `npm run api`.
- `lambda.mjs` — AWS Lambda / Amplify Function adapter for the same core.
- `handler.test.mjs`, `lambda.test.mjs` — contract tests. Run: `npm test`.

## Endpoints

| Method | Path             | Auth | Body / response |
| ------ | ---------------- | ---- | --------------- |
| GET    | `/health`, `/api/health` | no | `{ ok: true }` |
| GET    | `/api/providers` | yes  | `{ providers: [{ id, label, model }] }` |
| POST   | `/api/chat`      | yes  | `{ provider, model?, messages, baseUrl? }` → `{ reply, provider, model }` |

Auth is `Authorization: Bearer <OUAGX_API_KEY>` (compared in constant time).
`baseUrl` is honored only for `provider: "custom"` and must be http(s).
Bodies are capped at 1 MB. Errors are JSON: `{ error: "..." }`.

## Environment

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `OUAGX_API_KEY` | yes | shared key clients must send (server refuses to start without it) |
| `OUAGX_OPENAI_KEY`, `OUAGX_ANTHROPIC_KEY`, `OUAGX_GEMINI_KEY`, `OUAGX_MISTRAL_KEY`, `OUAGX_DEEPSEEK_KEY`, `OUAGX_XAI_KEY`, `OUAGX_OPENROUTER_KEY`, `OUAGX_COMPATIBLE_KEY` | per provider | server-side provider keys; only configured providers work |
| `PORT` | no | listen port (default `8080`) |
| `OUAGX_HOST` | no | bind address (default `127.0.0.1`; set `0.0.0.0` to serve the LAN) |

```powershell
$env:OUAGX_API_KEY = "a-long-random-string"
$env:OUAGX_DEEPSEEK_KEY = "sk-..."
npm run api
```

## Connect from PowerShell

```powershell
$env:OUAGX_API_KEY = "the-shared-key"
.\public\ouagx.ps1 -Once "hello in one word" -Provider deepseek
.\public\ouagx.ps1 -ApiUrl https://ouagx.com -Provider openai
```

See the main [README](../README.md) for the no-file one-liner anyone can run.

## Deploy as an Amplify Function

1. Create a function whose handler is `server/lambda.mjs` (`handler` export).
2. Set `OUAGX_API_KEY` plus the provider keys you want as function env vars.
3. In Amplify Console → Rewrites and redirects, add a 200 (rewrite/proxy)
   rule so the API lives at `ouagx.com/api` on the same domain: source
   `/api/<*>`, target your function origin with the path preserved.
   Verify with `GET https://ouagx.com/api/health` → `{ ok: true }`.
4. Give people the base URL `https://ouagx.com` (clients append `/api/chat`)
   plus the shared key.

## Notes

- Serve over HTTPS in production (reverse proxy or Function URL); the
  `server.mjs` listener is plain HTTP for local/LAN use.
- `custom` lets key holders point the server at any http(s) endpoint, so
  share the key only with people you trust, and rotate it if it leaks.
