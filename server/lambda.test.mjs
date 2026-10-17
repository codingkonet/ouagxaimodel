// Adapter tests: the Lambda/Amplify Function wrapper speaks API Gateway
// events and reuses the same route() contract. Run: npm test
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from './lambda.mjs';

const KEYS = {
  OUAGX_API_KEY: 'test-shared-key',
  OUAGX_OPENAI_KEY: 'sk-openai',
};

let savedEnv;
let savedFetch;

beforeEach(() => {
  savedEnv = { ...process.env };
  Object.assign(process.env, KEYS);
  savedFetch = globalThis.fetch;
});

afterEach(() => {
  process.env = savedEnv;
  globalThis.fetch = savedFetch;
});

function event(method, path, body, headers = {}) {
  return {
    httpMethod: method,
    path,
    headers: { Authorization: 'Bearer test-shared-key', ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('lambda adapter', () => {
  it('proxies chat and maps headers case-insensitively', async () => {
    let seen;
    globalThis.fetch = async (url, options) => {
      seen = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'via lambda' } }] }) };
    };
    const res = await handler(event('POST', '/api/chat', {
      provider: 'openai',
      messages: [{ role: 'user', content: 'hi' }],
    }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { reply: 'via lambda', provider: 'openai', model: 'gpt-4o-mini' });
    assert.equal(seen.url, 'https://api.openai.com/v1/chat/completions');
  });

  it('returns 401 for a bad key', async () => {
    const res = await handler(event('POST', '/api/chat', { provider: 'openai', messages: [] }, { Authorization: 'Bearer nope' }));
    assert.equal(res.statusCode, 401);
  });

  it('decodes base64 bodies', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'b64' } }] }) });
    const raw = { ...event('POST', '/api/chat', { provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }) };
    raw.body = Buffer.from(raw.body).toString('base64');
    raw.isBase64Encoded = true;
    const res = await handler(raw);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /b64/);
  });
});
