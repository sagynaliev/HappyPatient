# Sprint 5–6 implementation report

**Outcome:** all ten requested story IDs (22, 23, 26, 28, 29, 30, 31, 32, 33 and 34) are implemented in the existing HappyPatient application. No new runtime dependency, CSS framework or UI kit was added.

## Repository inspection (Step 0)

- Frontend: React 19, strict TypeScript, React Router 7, Vite and the existing global CSS/tokens. The project has no chart library, so the statistics page uses accessible SVG charts with data tables.
- Backend: Express 5, Prisma 6 and PostgreSQL. Authentication and role middleware were reused. Appointments are represented by ScheduleSlot; OCCUPIED is the existing checked-in/completed state.
- Stories 19–21 already had an append-only MedicalEntry model with test, anamnesis and conclusion categories. It was extended in place.
- The project already had in-app notifications, Resend-backed appointment email, schedule slots, doctor consultation fees, categories and legacy city/office fields. It had no location hierarchy, pricing rules, reminder scheduler, or QA test document named QATest. The changes add the hierarchy and reuse the existing data models and service paths.
- The existing appointment booking endpoint and authentication/token handling were preserved.

## Implemented

- **Stories 22–23 — clinical history:** server-side event-time sorting, stable tie-break, category filtering, pagination, date-grouped timeline, doctor attribution, read-only future-booking view and note creation only after check-in/visit start. One policy protects list, detail, export and create. Patients are bound to their session identity; other roles receive the same history-not-found response. Denials are audited without note content.
- **Story 26 — reminders:** configurable worker creates idempotent in-app 24-hour and 2-hour reminders, safely across concurrent runs. It uses the existing booking notification timestamp as a booking version and includes doctor, available clinic/address details, Almaty time and an appointment link. The header bell shows unread count and supports per-notification read state.
- **Stories 28–30 — pricing:** effective-dated, versioned integer-KZT rules, overlap checks, specificity resolution, old→new audit, admin create/version/deactivate UI, patient visit-cost breakdown and optional parking estimate. Visit cost uses the booking event time; a zero/missing rule falls back to the doctor’s existing consultation fee. Parking duration uses the slot’s actual start/end times.
- **Stories 31 and 33 — data quality/integrity:** 16 scheduled/on-demand SQL checks report names, severity, counts and up to ten record IDs per check. Runs and results are persisted; the UI shows previous-run trend and expandable ID samples. Medical history receives a server-assigned per-patient sequence. PostgreSQL sets and freezes its creation time, blocks sequence edits and hard deletion, and validates linked visit ownership/time.
- **Story 32 — statistics:** admin-only SQL aggregates for status, doctor workload, booked/available minutes, utilization, working-day average, no-show, new/returning patients, time series, specialty and office. Date presets/custom range use Asia/Almaty. Accessible charts have tables and the doctor table can be sorted.
- **Story 34 — reference data:** admin manages categories and city→floor→office locations with rename, active state, usage counts, explicit move confirmation and audit trail. Normalized names are unique in PostgreSQL. Inactive categories and office hierarchies are excluded from new doctor search; existing doctor records retain their saved location text.

## Data and product decisions

- A doctor is assigned to a patient for history access when they have an OCCUPIED visit or a future BOOKED visit. Cancelled-only and overdue unchecked bookings do not qualify.
- Clinical ordering uses appointment start time when linked, otherwise MedicalEntry creation time; ties use creation time then ID.
- Booking time is the existing BOOKED notification timestamp. If that notification is absent, the server uses ScheduleSlot.updatedAt, which changes when the slot is booked/rebooked.
- The project has no appointment treatment-line model. Treatment rules can be configured, but the patient cost response contains consultation only until appointments gain treatment records.
- The project has no parking facility or parking session data. The estimate therefore uses the real appointment slot duration and appears only when an office/global parking rule exists.
- Reminder delivery is in-app only. Existing Resend sends appointment emails, but reminders do not claim email/SMS delivery.
- Integrity output contains IDs and counts, never note bodies, diagnoses or patient names. Existing foreign keys protect medical patient/doctor/visit references; the new migrations add the reminder foreign key and chronology guards. No overlapping-slot database exclusion constraint was added; overlaps are checked and reported while the existing booking logic stays unchanged.

## Migrations and configuration

Sprint 5–6 database changes are additive and are in the project migration directory:

- 20261103120000_sprint56
- 20261104120000_sprint56_completion
- 20261105120000_sprint56_integrity
- 20261106120000_sprint56_database_guards
- 20261107120000_sprint56_integrity_sequence
- 20261108120000_sprint56_reference_uniqueness

The local PostgreSQL database used for verification is migrated through the latest migration. Reminder polling uses REMINDER_INTERVAL_MS (default 60 seconds) and REMINDER_LEAD_HOURS (default 24,2); integrity scheduling uses INTEGRITY_INTERVAL_MS (default one day). These values are documented in both environment templates.

## Verification

- Backend unit/API tests: **167 passed**; frontend component/page tests: **68 passed**.
- PostgreSQL integration suite: **5/5 passed**, including concurrent reminder delivery, chronological history and database immutability, plus reference creation/search/deactivation/audit.
- TypeScript check and production build pass. The largest application chunk is below 500 KB; build emits no chunk-size warning.
- All 15 Prisma migrations report up to date. The 16 integrity SQL checks also executed against the migrated PostgreSQL database.
- No lint script/configuration exists. Vitest emits its existing Node localStorage experimental warning.
- Browser smoke opened home and doctor search. Protected patient appointments and doctor schedule routes correctly redirected to sign-in because this run had no authenticated browser session; their page/component suites pass (patient appointments, schedule, doctor appointments and search).

## Files and ongoing operational notes

Backend changes are in Prisma schema/migrations and appointment lifecycle, medical history, pricing, admin operations, routes, server scheduling and their tests. Frontend changes cover the notification bell, patient cost panel, doctor history timeline, admin pricing/statistics/integrity/reference pages, routing and appended scoped styles. README and environment templates document configuration.

The integration fixtures are synthetic and are retained in the disposable local test database because medical-entry deletion is now correctly blocked. No production database was seeded or changed.
