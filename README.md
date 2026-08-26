# Fake Rider Motorparts

Appointment scheduling site for a motorcycle service shop featuring online booking,
service management, and parts & accessories shop.

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Booking protection

Apply the Supabase migrations before deploying. Public availability, booking, lookup, and
cancellation calls use the persistent rate-limit table introduced in the latest migration.

To require Cloudflare Turnstile for bookings, configure both variables in the deployment
environment. Never expose the secret key to the browser.

```sh
VITE_TURNSTILE_SITE_KEY=your-public-site-key
TURNSTILE_SECRET_KEY=your-server-secret
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
