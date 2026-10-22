-- Migration 0002: starting showcase content.
-- WorkLink is public as "In development".
-- 4GUARD is saved as a hidden draft: when the client site goes live, open the admin
-- dashboard, add the live URL and a screenshot, set status to "Live" and tick "Published".

INSERT OR IGNORE INTO projects
  (slug, name, client, industry, summary, description, url, accent, tech, status, featured, published, sort_order)
VALUES
  ('worklink', 'WorkLink', 'Neuropulse (in-house)', 'Jobs & marketplace',
   'A job marketplace where people post work, apply, hire and get paid.',
   'Anyone can browse jobs without an account. Requesters post work and hire; workers apply, get selected and get paid. Built as a full-stack web platform with role-based access.',
   NULL, '#1E9BFF', '["React","Node.js","Express","PostgreSQL","Prisma"]',
   'in_development', 1, 1, 10),

  ('4guard', '4GUARD', '4Guard Cleaning & Pest Solutions', 'Cleaning & pest control',
   'Business website with customer accounts and online booking for a cleaning and pest control company.',
   'A professional website for 4Guard with service pages, customer login and a booking portal so customers can request cleaning or pest control at a time that suits them.',
   NULL, '#2BB0FF', '["Cloudflare Workers","D1","HTML","CSS","JavaScript"]',
   'coming_soon', 0, 0, 20);
