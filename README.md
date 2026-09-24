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

The seed creates an admin account from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` and five fictional doctors. The development password recovery endpoint returns a mock email payload rather than sending email.

## Docker

`docker compose up --build` runs PostgreSQL, the API, and the built frontend. The first database setup can be run with:

```bash
docker compose run --rm backend npm run prisma:migrate
docker compose run --rm backend npm run prisma:seed
```

## Verification
##sadasdasdasd

```bash
npm run typecheck
npm run build
npm test
```

No real credentials or secrets are committed; use `.env.example` as the configuration template.
