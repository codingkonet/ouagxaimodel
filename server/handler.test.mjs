// Contract tests for the OUAGX API core. Run: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, checkAuth, route } from './handler.mjs';

const ENV = {
  OUAGX_API_KEY: 'test-shared-key',
  OUAGX_OPENAI_KEY: 'sk-openai',
  OUAGX_ANTHROPIC_KEY: 'sk-anthropic',
  OUAGX_GEMINI_KEY: 'gemini-key',
  OUAGX_COMPATIBLE_KEY: 'compat-key',
};
const AUTH = { authorization: 'Bearer test-shared-key' };

function okJson(data) {
  return {
    ok: true, status: 200, statusText: 'OK',
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function errStatus(status, text) {
  return {
    ok: false, status, statusText: text,
    json: async () => ({}),
    text: async () => text,
  };
}

function stubFetch(responder) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return responder(url, options);
  };
  return { impl, calls };
}

const chat = (body, headers = AUTH, env = ENV, fetchImpl = null) => route(
  'POST',
  '/api/chat',
  headers,
  JSON.stringify(body),
  { env, ...(fetchImpl ? { fetchImpl } : {}) },
);

describe('auth', () => {
  it('accepts the shared key, rejects anything else', () => {
    assert.equal(checkAuth(AUTH, ENV.OUAGX_API_KEY), true);
    assert.equal(checkAuth({ authorization: 'Bearer wrong' }, ENV.OUAGX_API_KEY), false);
    assert.equal(checkAuth({}, ENV.OUAGX_API_KEY), false);
    assert.equal(checkAuth({ authorization: 'Token x' }, ENV.OUAGX_API_KEY), false);
    assert.equal(checkAuth(AUTH, ''), false);
  });

  it('returns 401 without a valid key', async () => {
    const noKey = await chat({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }, {});
    assert.equal(noKey.status, 401);
    const providers = await route('GET', '/api/providers', {}, '', { env: ENV });
    assert.equal(providers.status, 401);
  });
});

describe('routes', () => {
  it('GET /health needs no auth', async () => {
    const out = await route('GET', '/health', {}, '', { env: ENV });
    assert.deepEqual(out, { status: 200, json: { ok: true } });
  });

  it('GET /api/health is the same check under the API prefix', async () => {
    const out = await route('GET', '/api/health', {}, '', { env: ENV });
    assert.deepEqual(out, { status: 200, json: { ok: true } });
  });

  it('GET /api/providers lists all providers', async () => {
    const out = await route('GET', '/api/providers', AUTH, '', { env: ENV });
    assert.equal(out.status, 200);
    assert.deepEqual(out.json.providers.map((p) => p.id), PROVIDERS.map((p) => p.id));
  });

  it('unknown routes 404', async () => {
    const out = await route('GET', '/nope', AUTH, '', { env: ENV });
    assert.equal(out.status, 404);
  });

  it('rejects non-JSON chat bodies', async () => {
    const out = await route('POST', '/api/chat', AUTH, 'not json', { env: ENV });
    assert.equal(out.status, 400);
  });
});

describe('chat', () => {
  it('calls OpenAI-compatible endpoints with the server key', async () => {
    const stub = stubFetch(async () => okJson({ choices: [{ message: { content: 'hello back' } }] }));
    const out = await chat(
      { provider: 'openai', messages: [{ role: 'user', content: 'hi' }] },
      AUTH, ENV, stub.impl,
    );
    assert.deepEqual(out, { status: 200, json: { reply: 'hello back', provider: 'openai', model: 'gpt-4o-mini' } });
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(stub.calls[0].options.headers.Authorization, 'Bearer sk-openai');
    assert.equal(stub.calls[0].body.model, 'gpt-4o-mini');
  });

  it('calls Anthropic with its key and version header', async () => {
    const stub = stubFetch(async () => okJson({ content: [{ text: 'claude says hi' }] }));
    const out = await chat(
      { provider: 'anthropic', model: 'claude-x', messages: [{ role: 'user', content: 'hi' }] },
      AUTH, ENV, stub.impl,
    );
    assert.equal(out.status, 200);
    assert.equal(out.json.reply, 'claude says hi');
    assert.equal(stub.calls[0].url, 'https://api.anthropic.com/v1/messages');
    assert.equal(stub.calls[0].options.headers['x-api-key'], 'sk-anthropic');
    assert.equal(stub.calls[0].options.headers['anthropic-version'], '2023-06-01');
    assert.equal(stub.calls[0].body.model, 'claude-x');
  });

  it('calls Gemini with mapped roles', async () => {
    const stub = stubFetch(async () => okJson({
      candidates: [{ content: { parts: [{ text: 'gemini hi' }] } }],
    }));
    const out = await chat(
      {
        provider: 'gemini',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hey' },
          { role: 'user', content: 'yo' },
        ],
      },
      AUTH, ENV, stub.impl,
    );
    assert.equal(out.json.reply, 'gemini hi');
    assert.match(stub.calls[0].url, /gemini-2\.0-flash:generateContent\?key=gemini-key/);
    assert.deepEqual(stub.calls[0].body.contents.map((c) => c.role), ['user', 'model', 'user']);
  });

  it('lets custom override the base URL', async () => {
    const stub = stubFetch(async () => okJson({ choices: [{ message: { content: 'custom hi' } }] }));
    const out = await chat(
      {
        provider: 'custom',
        baseUrl: 'https://groq.test/v1/',
        messages: [{ role: 'user', content: 'hi' }],
      },
      AUTH, ENV, stub.impl,
    );
    assert.equal(out.status, 200);
    assert.equal(stub.calls[0].url, 'https://groq.test/v1/chat/completions');
  });

  it('rejects bad custom base URLs', async () => {
    const stub = stubFetch(async () => okJson({}));
    const out = await chat(
      { provider: 'custom', baseUrl: '::::', messages: [{ role: 'user', content: 'hi' }] },
      AUTH, ENV, stub.impl,
    );
    assert.equal(out.status, 400);
    assert.equal(stub.calls.length, 0);
  });

  it('rejects unknown providers and bad messages', async () => {
    const stub = stubFetch(async () => okJson({}));
    const unknown = await chat({ provider: 'nope', messages: [{ role: 'user', content: 'hi' }] }, AUTH, ENV, stub.impl);
    assert.equal(unknown.status, 400);
    const empty = await chat({ provider: 'openai', messages: [] }, AUTH, ENV, stub.impl);
    assert.equal(empty.status, 400);
    const missing = await chat({ provider: 'openai' }, AUTH, ENV, stub.impl);
    assert.equal(missing.status, 400);
    assert.equal(stub.calls.length, 0);
  });

  it('returns 500 when the server has no key for the provider', async () => {
    const stub = stubFetch(async () => okJson({}));
    const env = { ...ENV };
    delete env.OUAGX_OPENAI_KEY;
    const out = await chat({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }, AUTH, env, stub.impl);
    assert.equal(out.status, 500);
    assert.match(out.json.error, /no API key configured for OpenAI/);
  });

  it('maps upstream failures to 502', async () => {
    const stub = stubFetch(async () => errStatus(401, 'bad key'));
    const out = await chat({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }, AUTH, ENV, stub.impl);
    assert.equal(out.status, 502);
    assert.match(out.json.error, /OpenAI error: HTTP 401/);
  });
});
