# Fake Rider Motorparts — Appointment Scheduling Site

A premium, race-inspired booking site for the shop (Philippine local UI: PHP pricing, PH mobile format, Asia/Manila time). Public visitors browse products and book service appointments with no account. Only staff log in.

## Look and feel

- Dark carbon/asphalt base with the logo's yellow + orange accents, checkered-flag and motion details, bold condensed headings.
- The uploaded logo is used as the site logo and favicon; the team photo is used in an "Our Riders Family" / about section.

## Public side

1. **Home** — hero with logo and booking CTA, featured product showcase (parts, accessories, motorcycle catalog) pulled from the database, services with prices, family photo section, shop info and map/contact.
2. **Shop pages** — Services, Parts & Accessories, Motorcycle Catalog listings with images, price, availability.
3. **Book an appointment** — one flow:
   - Name, mobile number (PH format), optional email
   - Motorcycle: brand, model, variant/version, year, plate number
   - Select one or more services
   - Date + fixed time slot picker. Dates within the next 48 hours are disabled; fully-booked slots and blocked dates (set by admin) are disabled.
   - Terms & conditions checkbox (required)
   - On submit: confirmation screen with a big **reference code** (e.g. FRM-8K2QD4) and a copy button.
4. **My appointment** — enter reference code + mobile number to view status, details and cancel (cancellation blocked inside 48 hours of the slot, with a message to call the shop).

## Admin side (login required)

Sidebar matching the provided module list:

- **Dashboard** — today's appointments, counts by status, quick stats
- **Appointments Management** — list/filter by date & status, view details, confirm / complete / cancel / no-show, reschedule, archive
- **Shop** — Services, Parts & Accessories, Motorcycle Catalog (full add/edit/delete with images)
- **Prices Management** — service and product pricing in one editable table
- **Customer List** — customers derived from bookings, with history per phone number
- **Operations Management** — Schedule Blocks (close dates/slots, set capacity per slot) and Pit Crew Roster (mechanics, roles, assignment to appointments)
- **Reports** — bookings over time, top services, revenue estimate, CSV export
- **Archive** — archived/completed/cancelled appointments, restorable
- **Notifications** — bell with unread count for new bookings and cancellations, realtime; opens the appointment

## Technical notes

- TanStack Start (React + TypeScript) frontend, Lovable Cloud (Supabase) for database, auth, storage and server logic via server functions.
- Tables: `services`, `products` (with category: part/accessory/motorcycle), `appointments`, `appointment_services`, `schedule_blocks`, `time_slots` config, `crew_members`, `notifications`, `user_roles` (roles in a separate table, admin checked server-side).
- Public booking and lookup go through server functions with validation (Zod) so the reference code, capacity rules and the 48-hour rule are enforced on the server, not just in the UI. Row-level security keeps appointment rows unreadable from the browser; lookup requires reference code + matching phone.
- Admin routes live under an authenticated layout; every admin server function verifies the admin role.
- Seed data: a starter set of services, products and slot configuration so the site looks complete immediately.
- Realtime subscription on new appointments drives the admin notification bell.

## What I need from you

- The email address for the admin account (I'll create it and grant the admin role; you'll set/receive the password).
- Shop address, opening hours and contact number, plus your real service list and prices — otherwise I'll use clear placeholders (Mon–Sat 8:00–17:00, 1-hour slots, 2 bikes per slot) that you can edit in the admin later.
