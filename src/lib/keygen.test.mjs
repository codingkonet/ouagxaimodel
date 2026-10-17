// Tests for the API-key generator. Run: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKey } from './keygen.js';

describe('generateKey', () => {
  it('makes keys of the requested length from A-Za-z0-9', () => {
    for (const n of [16, 32, 48, 64, 128]) {
      const key = generateKey(n);
      assert.equal(key.length, n);
      assert.match(key, /^[A-Za-z0-9]+$/);
    }
  });

  it('defaults to 48 chars and makes unique keys', () => {
    assert.equal(generateKey().length, 48);
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateKey(32));
    }
    assert.equal(seen.size, 1000);
  });

  it('rejects bad lengths', () => {
    for (const bad of [0, 15, 129, 2.5, Number.NaN, '48']) {
      assert.throws(() => generateKey(bad), /between 16 and 128/);
    }
  });
});
