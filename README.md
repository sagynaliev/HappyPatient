# HappyPatient Sprint 1 MVP

HappyPatient is a small patient/doctor directory and authentication MVP. It is a clean TypeScript monorepo with:

- `backend/`: Express API, Prisma/PostgreSQL persistence, JWT authentication, bcrypt password hashing, role middleware, recovery tokens, and seed data.
- `frontend/`: React + TypeScript + Vite single-page application with responsive navigation, protected dashboards, authentication forms, and doctor/category search.

## Local development

1. Copy `.env.example` to the repository-root `.env` and replace `JWT_SECRET` with a long random value. Keep local configuration in this single file; do not duplicate its variables in `backend/.env`, because Prisma Studio rejects conflicting environment files.
2. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

3. Install dependencies and prepare Prisma:

   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   npm run seed
   ```

4. Start both apps:

   ```bash
   npm run dev
   ```

   The API runs on `http://localhost:4000`, and the web app runs on `http://localhost:5173`.

The deterministic Prisma seed command is `npm run seed` (equivalently `npm run db:seed`). It re-seeds exactly 15 categories, 300 doctors, and one admin account with bcrypt-hashed alpha-test password `Demo@12345`; it preserves patient accounts and prints verification counts plus five sample doctors. Password recovery email uses Resend when configured. Registration confirmations use Resend when configured and a local development confirmation otherwise.

## Doctor schedules

Doctors can update their office location and publish daily availability from their dashboard. Schedule ranges are interpreted in UTC and generated as non-overlapping 30-minute slots. Signed-in patients can book future free slots with a visit purpose; doctors can mark slots occupied or free and view booked patient details. Patient schedule responses include slot status but never another patient's details.

The doctor directory provides debounced suggestions for doctor names, specialties, and offices. Patients can filter by specialty, location, published availability, and time of day; selecting a listed appointment opens that exact slot in the existing booking flow. Doctor consultation fees remain available as the fallback price; administrators can configure effective-dated visit and parking rules in the operations area. Ratings, experience, languages, and online-visit modes are not currently stored.


## Sprint 5–6 operations

The existing admin area now includes pricing rules, statistics, data quality/integrity, and reference data. Medical history is chronological and role-restricted; patients receive in-app upcoming-visit reminders. The office hierarchy is city → floor → office. See the [Sprint 5–6 implementation report](docs/sprint56-status.md) for rule definitions, migrations, verification and product-data limits.

Reminder polling is configured by REMINDER_INTERVAL_MS and REMINDER_LEAD_HOURS; persisted integrity checks use INTEGRITY_INTERVAL_MS. Defaults are 60 seconds, 24 and 2 hours, and one day respectively. No reminder email or SMS delivery is claimed.

## Docker

`docker compose up --build` runs PostgreSQL, the API, and the built frontend. The backend applies pending Prisma migrations before it starts. To seed optional demo accounts in the local Compose database, run the seed script from the repository after installing host dependencies and setting `DATABASE_URL` to the local PostgreSQL URL:

```bash
npm run seed
```

## Verification

```bash
npm run typecheck
npm run build
npm test
```

No real credentials or secrets are committed; use `.env.example` as the configuration template.

## Branded email notifications and check-in receipts

Appointment emails now share Happy Patient branding and include plain-text fallbacks. Successful check-in attaches a registration PDF with real appointment details in Asia/Almaty time. Existing authenticated receipt download/printing remains available. See [notification configuration, local previews, verification and failure handling](docs/notifications.md).

To inspect local database tables, run `npm run db:studio` from the repository root and open the localhost URL printed by Prisma. Backend workspace commands also load the root `.env`; externally supplied environment variables retain precedence.
