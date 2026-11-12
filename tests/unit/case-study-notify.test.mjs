import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseStudyBody } from '../../src/server/pages/case-study.js';
import { describeSelection, isSandboxSender } from '../../src/server/services/notify.service.js';

const project = {
  slug: 'demo', name: 'Demo <b>Co</b>', client: 'Demo & Sons', industry: 'Cleaning', summary: 'A demo project.', description: 'First paragraph.\n\nSecond paragraph.',
  problem: null, solution: 'We built a booking site.', results: null, url: 'https://example.co.za', image_url: null, accent: '#1E9BFF',
  tech: ['HTML', '<img src=x onerror=alert(1)>'], status: 'live', launched_at: '2026-03-15',
};

test('case study escapes every value', () => {
  const html = caseStudyBody(project, [{ quote: '"Great" <script>', author_name: 'Sam', author_role: null }]);
  assert.ok(!html.includes('<b>Co</b>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Demo &lt;b&gt;Co&lt;/b&gt;'));
  assert.ok(html.includes('Demo &amp; Sons'));
});

test('case study only shows sections that have text', () => {
  const html = caseStudyBody(project);
  assert.ok(html.includes('What we built'));
  assert.ok(!html.includes('The challenge'), 'no problem text, no section');
  assert.ok(!html.includes('The result'), 'no results text, no section');
  assert.ok(!html.includes('What the client said'), 'no testimonials, no section');
  assert.ok(html.includes('<p>First paragraph.</p><p>Second paragraph.</p>'));
  assert.ok(html.includes('March 2026'));
  assert.ok(html.includes('Visit the live site'));
});

test('case study with a real result and quote shows them', () => {
  const html = caseStudyBody({ ...project, problem: 'Phone bookings.', results: 'Fewer missed calls.' }, [{ quote: 'Very happy.', author_name: 'Sam', author_role: 'Owner' }]);
  assert.ok(html.includes('The challenge') && html.includes('The result') && html.includes('Very happy.'));
});

test('draft projects without a link get no visit button', () => {
  const html = caseStudyBody({ ...project, url: null, status: 'in_development' });
  assert.ok(!html.includes('Visit the live site') && !html.includes('Open the preview'));
});

test('the Resend test sender is detected', () => {
  assert.equal(isSandboxSender({ MAIL_FROM: 'Neuropulse Website <onboarding@resend.dev>' }), true);
  assert.equal(isSandboxSender({ MAIL_FROM: 'onboarding@resend.dev' }), true);
  assert.equal(isSandboxSender({ MAIL_FROM: 'Neuropulse <hello@neuropulseinc.com>' }), false);
  assert.equal(isSandboxSender({}), false);
});

test('estimator choices read back as one line', () => {
  assert.equal(describeSelection('{"type":"Business website","pages":"4 to 8 pages","extras":["Care plan"]}'), 'Business website, 4 to 8 pages, Care plan');
  assert.equal(describeSelection('nope'), '');
  assert.equal(describeSelection(null), '');
});
