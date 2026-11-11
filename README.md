# Happy Patient

Happy Patient is a clinic management web platform built for the SOE 202 course (SDU). Patients find doctors and book 30-minute slots online, doctors manage their schedule and medical records, front-desk staff check patients in, and administrators manage pricing, statistics and reference data.

It is a TypeScript monorepo:

- `backend/`: Express 5 API, Prisma 6 with PostgreSQL, JWT authentication, bcrypt password hashing, role-based access control, zod validation, Resend email and jsPDF receipts.
- `frontend/`: React 19 + TypeScript + Vite single-page app with React Router, role-specific dashboards and plain CSS.

## Features

| Role | What they can do |
| --- | --- |
| Patient | Register, log in, recover a password, search doctors by name, category and location, view schedules, book and cancel appointments, check in at the front desk, view own medical history, see visit and parking cost, receive notifications and upcoming-visit reminders |
| Doctor | Log in, publish a daily schedule in 30-minute slots, see slot statuses (free / booked / occupied) and booking details, add categorized medical notes (tests, anamnesis, conclusions), view a patient's history in chronological order |
| Front desk | Look up patients, register walk-ins by ID/IIN, check patients in, issue receipts; walk-in slots are marked occupied within 30 minutes of the visit and booked otherwise |
| Administrator | Manage pricing rules (versioned, effective-dated), view workload and visit statistics, run data-integrity checks, manage reference data (categories, city → floor → office) |
| System | Releases unconfirmed slots, sends reminders, restricts medical history to the assigned doctor and the patient, sends branded email notifications |

Medical entries are append-only and visible only to the assigned doctor and the corresponding patient. Administrators cannot read confidential medical records.

## Local development

1. Copy `.env.example` to the repository-root `.env` and replace `JWT_SECRET` with a long random value. Keep local configuration in this single file. Do not duplicate its variables in `backend/.env`, because Prisma Studio rejects conflicting environment files.
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

   The API runs on `http://localhost:4000` and the web app on `http://localhost:5173`.

The deterministic seed (`npm run seed`, also `npm run db:seed`) creates exactly 15 categories, 300 doctors and one admin account with the alpha-test password `Demo@12345`. It keeps existing patient accounts and prints verification counts plus five sample doctors. Change the demo password before any real deployment.

## Scheduling and booking

- Doctors set their office and publish daily availability. Ranges are generated as non-overlapping 30-minute slots. Times are shown in Asia/Almaty.
- Signed-in patients can book future free slots with a visit purpose. Patient schedule responses show slot status only, never another patient's details.
- Doctor search offers debounced suggestions for names, specialties and offices, and filters by specialty, location, availability and time of day. Choosing a listed appointment opens that exact slot in the booking flow.
- A booked slot that is not checked in within 10 minutes of its start is released back to free by a background job.
- Check-in moves a slot from booked to occupied and issues a registration receipt.

## Pricing

Administrators configure effective-dated visit and parking pricing rules in the operations area. The doctor's consultation fee is used as the fallback price. Patients see the calculated visit and parking cost for each appointment. Amounts are integer KZT.

## Admin operations

The admin area includes pricing rules, statistics, data quality and integrity checks, and reference data. The office hierarchy is city → floor → office. See the [Sprint 5–6 implementation report](docs/sprint56-status.md) for rule definitions, migrations, verification and known product-data limits, and the [Sprint 4 notes](docs/sprint4.md).

## Notifications and receipts

Appointment emails share Happy Patient branding and include plain-text fallbacks. Password recovery, registration confirmation and appointment emails are sent through Resend when `RESEND_API_KEY` is configured. Without it, the app uses a local development confirmation instead. Successful check-in attaches a registration PDF with the real appointment details. Authenticated receipt download and printing remain available. Upcoming-visit reminders are shown in the app only. SMS delivery is not implemented.

See [notification configuration, local previews, verification and failure handling](docs/notifications.md).

## Background jobs

Three schedulers run inside the API server. Defaults are shown below.

| Variable | Purpose | Default |
| --- | --- | --- |
| `SLOT_RELEASE_INTERVAL_MS` | How often unconfirmed slots are released | see `.env.example` |
| `REMINDER_INTERVAL_MS` | How often reminders are checked | 60 seconds |
| `REMINDER_LEAD_HOURS` | How long before a visit the reminder appears | 24 and 2 hours |
| `INTEGRITY_INTERVAL_MS` | How often persisted integrity checks run | one day |

## Docker

`docker compose up --build` runs PostgreSQL, the API and the built frontend. The backend applies pending Prisma migrations before it starts. To seed demo accounts in the local Compose database, install the host dependencies, set `DATABASE_URL` to the local PostgreSQL URL and run:

```bash
npm run seed
```

## Verification

```bash
npm run typecheck
npm run build
npm test
```

Some backend suites run against a real PostgreSQL database, so start the database first.

## Database tools

To inspect local tables, run `npm run db:studio` from the repository root and open the localhost URL Prisma prints. Backend workspace commands also load the root `.env`, and externally supplied environment variables take precedence.

## Security

No real credentials or secrets are committed. Use `.env.example` as the configuration template.

## Running under load

- **Sign-in protection.** Ten wrong passwords for one account from one address lock sign-in for 15 minutes, and one address can make at most 100 sign-in, registration or recovery requests in 15 minutes. Counters are kept in the API's memory, which fits a single API instance. `RATE_LIMIT=off` turns the limits off for load tests.
- **Passwords** are hashed with scrypt on Node's thread pool, so a burst of sign-ins does not stall other requests. Accounts created earlier (bcrypt) still sign in and are upgraded at their next sign-in.
- **Database connections.** Prisma opens `CPU cores × 2 + 1` connections by default. On a small host with a small database plan, cap it in the connection string, for example `?connection_limit=5`.
- **One API instance.** The demo clock, the sign-in counters and the background jobs (auto-release, reminders, integrity check) live in the API process. Run a single instance; several instances would each keep their own.

## Demo time (for class demonstrations)

Admins can move the platform clock in **Admin → Demo time** to show time-based rules without waiting: the 10-minute auto-release, 24 h / 2 h reminders, the 30-minute check-in window and medical notes after a visit starts. Every user sees the same shifted time and an orange "Demo time" badge; moving the clock immediately releases overdue bookings and sends due reminders. The shift is kept in server memory, so a server restart returns to real time. Sign-in sessions last one day in app time, so shifting more than a day ahead signs people out. Set `TIME_CONTROL=off` to disable the feature.
