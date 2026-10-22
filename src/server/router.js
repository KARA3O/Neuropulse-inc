/**
 * Minimal router: method + path pattern (":param" segments) -> handler(ctx).
 * ctx = { request, env, url, params, waitUntil, admin? }
 */
import { HttpError } from './lib/http.js';

export class Router {
  constructor() {
    /** @type {{ method: string, regex: RegExp, keys: string[], handler: Function }[]} */
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/\/:(\w+)/g, (_, k) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ method, regex, keys, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  /** @returns {{ handler: Function, params: Record<string,string> }} */
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = pathname.match(r.regex);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { handler: r.handler, params };
    }
    if (pathMatched) throw new HttpError(405, 'That method is not allowed here.');
    throw new HttpError(404, 'That API endpoint does not exist.');
  }
}
