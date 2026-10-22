/**
 * HTTP helpers shared by every route: JSON responses, typed errors, safe body parsing.
 */

export class HttpError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Message safe to show to the visitor
   * @param {Record<string,string>} [fields] Per-field validation messages
   */
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const API_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

/** JSON response with sensible API headers. */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...API_HEADERS, ...headers } });
}

/** Public, cacheable JSON (used for the showcase list so repeat visits don't hit D1). */
export function cachedJson(data, maxAge = 60) {
  return json(data, 200, { 'cache-control': `public, max-age=${maxAge}, s-maxage=${maxAge * 5}` });
}

export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ ok: false, error: err.message, ...(err.fields ? { fields: err.fields } : {}) }, err.status);
  }
  console.error('Unhandled error', err && err.stack ? err.stack : err);
  return json({ ok: false, error: 'Something went wrong on our side. Please try again in a minute.' }, 500);
}

/**
 * Read a JSON body with a size cap. Rejects anything that is not application/json.
 * @param {Request} request
 * @param {number} [maxBytes]
 */
export async function readJson(request, maxBytes = 32_768) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Send the data as JSON.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'That message is too long.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That message is too long.');
  try {
    const data = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
    return data;
  } catch {
    throw new HttpError(400, 'The data sent was not valid JSON.');
  }
}

/** Client IP as reported by Cloudflare (falls back to a constant locally). */
export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
}

/** Escape a value for CSV export (also defuses spreadsheet formula injection). */
export function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvResponse(filename, header, rows) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  return new Response('﻿' + body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
