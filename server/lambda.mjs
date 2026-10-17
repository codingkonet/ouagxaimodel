// OUAGX API as an AWS Lambda / Amplify Function handler. Same core as
// server.mjs: set OUAGX_API_KEY plus provider keys (OUAGX_OPENAI_KEY, ...)
// as function environment variables, then point an HTTP route at this handler.
import { route } from './handler.mjs';

export const handler = async (event = {}) => {
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = event.path || event.rawPath || '/';
  const headers = {};
  for (const [name, value] of Object.entries(event.headers || {})) {
    headers[String(name).toLowerCase()] = value;
  }
  let bodyText = event.body || '';
  if (bodyText && event.isBase64Encoded) {
    bodyText = Buffer.from(bodyText, 'base64').toString('utf8');
  }
  const out = await route(method, path, headers, bodyText, { env: process.env });
  return {
    statusCode: out.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(out.json),
  };
};
