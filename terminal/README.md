# OUAGX terminal client

Chat with any OUAGX provider from the command line. Zero dependencies (Node 18+).

```bash
node chat.mjs                       # interactive chat (OpenAI by default)
node chat.mjs --provider deepseek    # start on another provider
node chat.mjs --once "hello"         # single question, print answer, exit
node chat.mjs --help
```

Chat commands: `/p <id>` switch provider, `/m <name>` switch model, `/q` quit.

API keys (pick one, never committed):

- env vars: `OUAGX_OPENAI_KEY`, `OUAGX_ANTHROPIC_KEY`, `OUAGX_GEMINI_KEY`,
  `OUAGX_MISTRAL_KEY`, `OUAGX_DEEPSEEK_KEY`, `OUAGX_XAI_KEY`,
  `OUAGX_OPENROUTER_KEY`, `OUAGX_COMPATIBLE_KEY`
- or `~/.ouagx/keys.json`, e.g. `{ "openai": "sk-...", "deepseek": "..." }`
