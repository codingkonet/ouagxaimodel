// Tests for the chat payload builders (files + images). Run: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnthropicBody,
  buildGeminiBody,
  buildOpenAIMessages,
  buildPayloadMessages,
} from './providers.js';

const IMG = {
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  mediaType: 'image/png',
};

describe('buildPayloadMessages', () => {
  it('passes plain messages through untouched', () => {
    const out = buildPayloadMessages([{ role: 'user', content: 'hi' }]);
    assert.deepEqual(out, [{ role: 'user', content: 'hi', images: [] }]);
  });

  it('inlines attached text files', () => {
    const out = buildPayloadMessages([
      {
        role: 'user',
        content: 'review this',
        files: [{ name: 'a.txt', text: 'hello' }],
      },
    ]);
    assert.equal(out[0].content, 'review this\n\n[Attached file: a.txt]\nhello');
  });
});

describe('buildOpenAIMessages', () => {
  it('keeps simple messages as strings', () => {
    const out = buildOpenAIMessages([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'yo' },
    ]);
    assert.deepEqual(out, [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'yo' },
    ]);
  });

  it('sends images as image_url blocks', () => {
    const out = buildOpenAIMessages([{ role: 'user', content: 'what is this?', images: [IMG] }]);
    assert.deepEqual(out, [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          { type: 'image_url', image_url: { url: IMG.dataUrl } },
        ],
      },
    ]);
  });
});

describe('buildAnthropicBody', () => {
  it('keeps system extraction and sends images as base64 blocks', () => {
    const out = buildAnthropicBody('claude-x', [
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'look', images: [IMG] },
    ]);
    assert.equal(out.model, 'claude-x');
    assert.equal(out.system, 'be nice');
    assert.deepEqual(out.messages, [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
          },
        ],
      },
    ]);
  });
});

describe('buildGeminiBody', () => {
  it('maps roles and images to parts', () => {
    const out = buildGeminiBody([
      { role: 'system', content: 'skip me' },
      { role: 'user', content: 'look', images: [IMG] },
      { role: 'assistant', content: 'seen' },
    ]);
    assert.deepEqual(out, {
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'look' },
            { inline_data: { mime_type: 'image/png', data: 'iVBORw0KGgo=' } },
          ],
        },
        { role: 'model', parts: [{ text: 'seen' }] },
      ],
    });
  });
});
