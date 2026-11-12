-- Migration 0004: showcase content taken from the founder page.
-- TaskFlow is Neuropulse's own first product ("Neuropulse's first product" on /founder), so it is
-- published. The three projects built during the ICEP internship or as personal work are saved as
-- HIDDEN DRAFTS: open the admin dashboard, check you are happy to show them under "Our work", then
-- tick "Published". No results or client quotes are filled in: add real ones in the dashboard.

INSERT OR IGNORE INTO projects
  (slug, name, client, industry, summary, description, solution, url, accent, tech, status, featured, published, sort_order, launched_at)
VALUES
  ('taskflow', 'TaskFlow', 'Neuropulse (in-house)', 'Productivity software',
   'Neuropulse''s first product: a task manager with secure sign-in, built with Spring Boot and PostgreSQL.',
   'TaskFlow is a task-management application and the first product Neuropulse Inc. shipped. Users sign in with JWT-secured accounts and manage their tasks through a REST API backed by a PostgreSQL database.',
   'A Spring Boot REST API with JWT authentication, PostgreSQL storage and a web front end, deployed on Render.',
   'https://taskflow-u2if.onrender.com/', '#2BB0FF', '["Spring Boot","PostgreSQL","JWT","REST API"]',
   'live', 0, 1, 15, NULL),

  ('lvh-portal', 'LVH application portal', 'ICEP / Limpopo Varsity Hackathon', 'Education and events',
   'Where students apply to compete in the Limpopo Varsity Hackathon.',
   'The application portal for the Limpopo Varsity Hackathon, where students submit their details to compete.',
   NULL,
   'https://lvh.icep.co.za/', '#0B5FD6', '[]',
   'live', 0, 0, 40, NULL),

  ('lecture-room-booking', 'Lecture Room Booking System', 'Tshwane University of Technology', 'Education',
   'Students and lecturers find and book rooms at TUT; admins approve and report.',
   'A booking system where students and lecturers find and book lecture rooms at TUT, and administrators approve bookings and run reports.',
   NULL,
   'https://lecture-room-booking-management-sys.vercel.app/', '#1E9BFF', '[]',
   'live', 0, 0, 50, NULL),

  ('valery-boutique', 'Valery Boutique', 'Neuropulse (in-house)', 'Retail',
   'An AI-assisted sales, inventory and insights app for small business owners.',
   'An AI-assisted sales, inventory and insights application aimed at small business owners.',
   NULL,
   NULL, '#2BB0FF', '[]',
   'in_development', 0, 0, 60, NULL);
