/**
 * Small declarative validator. Each schema maps a field to its rules; validate() returns
 * clean, trimmed values or throws a 422 HttpError listing every problem at once.
 *
 * Rules: type ('string'|'boolean'|'integer'|'array'), required, min, max (length or value),
 * email, url, enum, pattern, default, label (used in messages).
 */
import { HttpError } from './http.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,24}$/i;

export function isEmail(s) {
  return typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s);
}

export function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Strip control characters (keeps newlines and tabs) and trim. */
export function clean(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/**
 * @param {Record<string, any>} input
 * @param {Record<string, object>} schema
 * @param {{ partial?: boolean }} [opts] partial: only validate fields that are present (for PATCH)
 */
export function validate(input, schema, opts = {}) {
  const out = {};
  const errors = {};

  for (const [key, rule] of Object.entries(schema)) {
    const label = rule.label || key;
    let v = input[key];
    const missing = v === undefined || v === null || (typeof v === 'string' && clean(v) === '');

    if (missing) {
      if (opts.partial && v === undefined) continue;
      if (rule.required) errors[key] = `${label} is required.`;
      else if ('default' in rule) out[key] = rule.default;
      else out[key] = null; // D1 rejects undefined, so absent optional fields become NULL
      continue;
    }

    switch (rule.type || 'string') {
      case 'string': {
        if (typeof v !== 'string' && typeof v !== 'number') { errors[key] = `${label} must be text.`; continue; }
        v = clean(v);
        if (rule.min && v.length < rule.min) { errors[key] = `${label} needs at least ${rule.min} characters.`; continue; }
        if (rule.max && v.length > rule.max) { errors[key] = `${label} can be at most ${rule.max} characters.`; continue; }
        if (rule.email && !isEmail(v)) { errors[key] = `Enter a valid email address, like name@example.com.`; continue; }
        if (rule.url && !isHttpUrl(v)) { errors[key] = `${label} must be a full link starting with https://`; continue; }
        if (rule.enum && !rule.enum.includes(v)) { errors[key] = `Choose one of the options for ${label.toLowerCase()}.`; continue; }
        if (rule.pattern && !rule.pattern.test(v)) { errors[key] = rule.patternMessage || `${label} has an invalid format.`; continue; }
        out[key] = v;
        break;
      }
      case 'boolean':
        out[key] = v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
        break;
      case 'integer': {
        const n = Number(v);
        if (!Number.isInteger(n)) { errors[key] = `${label} must be a whole number.`; continue; }
        if (rule.min != null && n < rule.min) { errors[key] = `${label} must be ${rule.min} or more.`; continue; }
        if (rule.max != null && n > rule.max) { errors[key] = `${label} must be ${rule.max} or less.`; continue; }
        out[key] = n;
        break;
      }
      case 'array': {
        const arr = Array.isArray(v) ? v : String(v).split(',');
        const items = arr.map((x) => clean(x)).filter(Boolean);
        if (rule.max && items.length > rule.max) { errors[key] = `${label} can have at most ${rule.max} items.`; continue; }
        if (items.some((x) => x.length > (rule.itemMax || 40))) { errors[key] = `Each ${label.toLowerCase()} item must be short.`; continue; }
        out[key] = items;
        break;
      }
      default:
        throw new Error(`Unknown rule type for ${key}`);
    }
  }

  if (Object.keys(errors).length) {
    throw new HttpError(422, 'Please fix the highlighted fields.', errors);
  }
  return out;
}

// ---- Schemas used by the API ---------------------------------------------------------------

export const SERVICES = ['Business website', 'Web application', 'Booking or e-commerce system', 'Android app', 'API or database', 'Maintenance & hosting', 'Not sure yet'];
export const BUDGETS = ['Under R5 000', 'R5 000 – R15 000', 'R15 000 – R50 000', 'R50 000+', 'Not sure yet'];
export const TIMELINES = ['As soon as possible', 'Within 1 month', '1 – 3 months', 'Just exploring'];
export const ENQUIRY_STATUSES = ['new', 'contacted', 'in_progress', 'won', 'lost', 'spam'];
export const PROJECT_STATUSES = ['live', 'in_development', 'coming_soon'];

export const enquirySchema = {
  name: { required: true, min: 2, max: 80, label: 'Your name' },
  email: { required: true, email: true, max: 254, label: 'Email' },
  phone: { max: 20, pattern: /^[+\d][\d\s()-]{6,19}$/, patternMessage: 'Enter a phone number like 072 123 4567.', label: 'Phone' },
  company: { max: 100, label: 'Company' },
  service: { required: true, enum: SERVICES, label: 'Service' },
  budget: { enum: BUDGETS, label: 'Budget' },
  timeline: { enum: TIMELINES, label: 'Timeline' },
  message: { required: true, min: 20, max: 4000, label: 'Project details' },
  contact_pref: { enum: ['email', 'phone', 'whatsapp'], default: 'email', label: 'Contact preference' },
  consent: { type: 'boolean', required: true, label: 'Consent' },
  source_page: { max: 200 },
};

export const subscribeSchema = {
  email: { required: true, email: true, max: 254, label: 'Email' },
};

export const loginSchema = {
  email: { required: true, email: true, max: 254, label: 'Email' },
  password: { required: true, min: 1, max: 200, label: 'Password' },
};

export const projectSchema = {
  name: { required: true, min: 2, max: 80, label: 'Name' },
  slug: { required: true, max: 60, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, patternMessage: 'Use lowercase letters, numbers and dashes only, like my-project.', label: 'Slug' },
  client: { max: 100, label: 'Client' },
  industry: { max: 60, label: 'Industry' },
  summary: { required: true, min: 10, max: 200, label: 'Summary' },
  description: { max: 3000, label: 'Description' },
  url: { url: true, max: 300, label: 'Website link' },
  image_url: { max: 300, pattern: /^(https:\/\/|\/assets\/)/, patternMessage: 'Use an https:// link or a path starting with /assets/.', label: 'Screenshot' },
  accent: { pattern: /^#[0-9a-fA-F]{6}$/, patternMessage: 'Use a hex colour like #1E9BFF.', default: '#1E9BFF', label: 'Accent colour' },
  tech: { type: 'array', max: 12, default: [], label: 'Tech' },
  status: { required: true, enum: PROJECT_STATUSES, label: 'Status' },
  featured: { type: 'boolean', default: false },
  published: { type: 'boolean', default: false },
  sort_order: { type: 'integer', min: 0, max: 10000, default: 100, label: 'Order' },
  launched_at: { pattern: /^\d{4}-\d{2}-\d{2}$/, patternMessage: 'Use a date like 2026-12-01.', label: 'Launch date' },
};

export const enquiryUpdateSchema = {
  status: { enum: ENQUIRY_STATUSES, label: 'Status' },
  notes: { max: 4000, label: 'Notes' },
};
