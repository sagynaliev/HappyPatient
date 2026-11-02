# Sprint 4 implementation and verification

Implemented stories 11, 12, 19, 20 and 21 in the existing application.

## Inspection

React 19, strict TypeScript, React Router 7, Vite, plain CSS; Express 5, PostgreSQL and Prisma 6. Existing Vitest/Testing Library/Supertest suites are reused. No new dependencies. No lint script/config or QATest/UserStory1QAT documents were found. Authentication and the patient booking endpoint are unchanged. Existing local changes to README, package.json and config were preserved.

Appointments are represented by ScheduleSlot, not a separate appointment table. Existing checkedInAt/checkedInById, check-in endpoint, walk-in registration service, availability picker and 60-second scheduler were extended. No duplicate check-in mechanism was introduced. There was no existing medical-record table to migrate.

The task's design description differs from this checkout: its existing fonts/palette are Onest and blue tokens. The new styles reuse the existing tokens and inherited fonts; no global palette/font change was made. Existing stylesheet blocks remain intact; new .mh- and .fd- rules are appended.

## Changed files

Backend: prisma/schema.prisma; prisma/migrations/20261102120000_sprint4/migration.sql; src/appointmentLifecycle.ts and test; src/visitTime.ts and test; src/medicalHistory.ts and test; src/routes.ts and test; src/server.ts; src/config.ts; src/sprint4.integration.test.ts. Root and backend .env.example document the interval.

Frontend: src/components/MedicalHistory.tsx and test; src/components/FrontDeskSlotStatus.tsx and test; src/pages/MedicalHistoryPage.tsx; src/pages/DoctorAppointments.tsx; src/pages/FrontDeskPage.tsx; src/components/Layout.tsx; src/main.tsx; appended section in src/styles/global.css.

## Behavior and assumptions

- Named grace constant: 10 minutes. UTC timestamps; exact 10:00 expires, 9:59 does not. Conditional writes inside a transaction protect checked-in/occupied/rebooked slots. ExpiredAppointment retains the visit snapshot and the audit reason auto_release_no_checkin. appointmentId is the existing slot-based appointment ID; bookingVersion distinguishes reuse. Audit data is stored in the DB, never emitted to logs.
- SLOT_RELEASE_INTERVAL_MS defaults to 60000, minimum 1000. No new authentication environment variables.
- getWalkInSlotStatus uses <= 30 minutes (30:00 occupied, 30:01 booked). Already-started but unended slots are offered. Server clock and status win over client input. Concurrent claims return 409 and roll back newly created patient rows.
- OCCUPIED is the project's checked-in visit state. A visit is eligible for notes when OCCUPIED and startAt <= now; after endAt this represents a completed visit. There is no separate completed state. Merely elapsed BOOKED visits never grant note access.
- Medical entries are append-only with exactly test/anamnesis/conclusion, required trimmed title/body and limits 120/5000. Patient and doctor identity are derived from session/eligible visit, never posted patient/doctor IDs. No edit/delete endpoints. Patient reads always use their session identity even if another patientId is requested. ADMIN/FRONT_DESK cannot access history. Responses use no-store and generic private errors with no content logging.
- Shared history UI displays newest entries first, category counts, filters, 20-record pagination, doctor/time, escaped multiline body, skeleton/empty/error/retry states. Filters apply to loaded records; Load more remains available to retrieve older entries.
- Times display through Intl.DateTimeFormat in Asia/Almaty. Header/footer and authentication remain unchanged.

## Verification

- Typecheck and production build passed.
- Full existing and added unit/API/component suites: 137 backend tests and 68 frontend tests passed. The optional integration suite has 2 tests and runs separately against a disposable DB.
- PostgreSQL: all nine migrations deployed successfully to a fresh temporary database. Two real concurrent transactions expired one appointment once; checked-in/occupied slots remained protected. A real categorized entry was created/read through HTTP, and a different patient could not obtain it.
- Browser with synthetic data from real API/temporary database: patient profile, doctor search and booking flow, doctor schedule, doctor appointments and patient medical history loaded. Doctor created a Conclusions entry with keyboard submission; success and prepended record appeared. Front desk looked up a patient and registered a near-term walk-in; server returned Occupied, displayed the reason and generated the existing receipt.
- Responsive doctor history checked at approximately 1024, 768 and 375 CSS pixels; no document horizontal overflow. Filter controls have aria-pressed, form fields have labels, character counter/errors are described, note textarea has visible focus. Keyboard submission succeeded.
- No lint command exists. Existing Prisma package.json configuration deprecation and Node/Vitest localStorage experimental warnings are pre-existing; no new application warning was introduced.

## Deployment / remaining operational step

The normal application database at localhost:5433 was not running. No production/user database was seeded or altered. Before running the application against its normal database, start PostgreSQL and apply the migration using:

    npx prisma migrate deploy --schema backend/prisma/schema.prisma
    npm run db:generate
    npm run dev

Use the project's existing DATABASE_URL configuration. Do not seed an existing database just to deploy this feature.

To rerun the opt-in database suite, provision a disposable migrated DB, then set SPRINT4_DATABASE_URL to its URL and run:

    npm test --workspace backend -- --run src/sprint4.integration.test.ts

Product constraint to review: existing patient search and booking deliberately accept only future start times. Auto-release persists FREE immediately, and doctor schedule/refetch reflects it; front desk can reuse an unended released slot. Offering already-started released slots in patient search/calendar would require changing the existing booking policy, expressly excluded by this task. That part of the availability acceptance criterion remains limited by the existing policy. The visit-state and current-design assumptions above should also be reviewed with the team.
