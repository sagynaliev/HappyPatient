# HappyPatient Sprint 1 MVP

HappyPatient is a small patient/doctor directory and authentication MVP. It is a clean TypeScript monorepo with:

- `backend/`: Express API, Prisma/PostgreSQL persistence, JWT authentication, bcrypt password hashing, role middleware, recovery tokens, and seed data.
- `frontend/`: React + TypeScript + Vite single-page application with responsive navigation, protected dashboards, authentication forms, and doctor/category search.

## Local development

1. Copy `.env.example` to `.env` and replace `JWT_SECRET` with a long random value.
2. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

3. Install dependencies and prepare Prisma:

   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

4. Start both apps:

   ```bash
   npm run dev
   ```

   The API runs on `http://localhost:4000`, and the web app runs on `http://localhost:5173`.

The seed creates an admin account from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` and five fictional doctors with office locations. Password recovery email uses Resend when configured. Registration confirmations use Resend when configured and a local development confirmation otherwise.

## Doctor schedules

Doctors can update their office location and publish daily availability from their dashboard. Schedule ranges are interpreted in UTC and generated as non-overlapping 30-minute slots. Signed-in patients can book future free slots with a visit purpose; doctors can mark slots occupied or free and view booked patient details. Patient schedule responses include slot status but never another patient's details.

The doctor directory provides debounced suggestions for doctor names, specialties, and offices. Patients can filter by specialty, location, published availability, and time of day; selecting a listed appointment opens that exact slot in the existing booking flow. Ratings, fees, experience, languages, and online-visit modes are not currently stored in doctor profiles, so the directory identifies those details as unavailable rather than displaying invented values.

## Docker

`docker compose up --build` runs PostgreSQL, the API, and the built frontend. The backend applies pending Prisma migrations before it starts. To seed optional demo accounts in the local Compose database, run the seed script from the repository after installing host dependencies and setting `DATABASE_URL` to the local PostgreSQL URL:

```bash
npm run db:seed
```

## Verification
##sadasdasdasd

```bash
npm run typecheck
npm run build
npm test
```

No real credentials or secrets are committed; use `.env.example` as the configuration template.
