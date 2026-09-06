-- Upgrade the initial built-in copy without replacing terms an administrator has already edited.
UPDATE public.shop_settings
SET booking_terms = 'Bookings are subject to shop confirmation. Please arrive 15 minutes before your slot. Late arrivals beyond 30 minutes may be rescheduled. Quoted prices are starting rates; parts and additional labor are billed separately. The shop is not liable for personal items left on the unit.

Cancellations must be made at least 48 hours before the schedule.

We use your name, contact details, motorcycle details, selected services, and notes only to manage this booking, contact you about it, and provide shop services. We do not sell your information.'
WHERE booking_terms = 'Bookings are subject to shop confirmation. Please arrive 15 minutes before your appointment. Cancellations must be made before the required notice period.';
