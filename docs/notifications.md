# Happy Patient notifications and registration receipts

The React/Vite frontend and Express/TypeScript backend continue to use the existing Prisma records, Resend client, sender, and notification recipients. No schema migration or new environment variable is required.

## Configuration and local testing

1. Install dependencies with `npm install` and follow the existing README database setup.
2. Keep the existing `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, and optional `FRONTEND_URL` configuration. With no Resend key, notifications are recorded in-app without sending email. The existing sender remains `onboarding@resend.dev`; Resend's development-domain recipient restrictions still apply. Use an approved test recipient for manual delivery checks.
3. Run `npm run dev`. Book a future appointment as a patient; verify **Appointment Confirmed | Happy Patient**.
4. Cancel a separate booked appointment as the patient; verify **Appointment Cancelled | Happy Patient**. Book another visit and use the doctor's explicit release/cancellation flow; verify **Appointment Cancelled by Doctor | Happy Patient**, including the original visit details and cancellation reason.
5. Within the existing check-in window (30 minutes before the appointment until its end), check in as the patient or front-desk staff. Verify **Visit Check-in Confirmed | Happy Patient** and open the attached registration PDF. Compare receipt ID, booking ID, patient, doctor, appointment time and check-in timestamp with the receipt view and database. An immediate front-desk walk-in uses the same attachment flow.
6. Open the existing receipt dialog from the patient/front-desk workflow and use **Download PDF** or **Print receipt**. The browser download remains a thermal-format registration document; the email attachment uses an A4 branded document. Both omit payment totals and visit purpose. Receipt retrieval retains the existing authenticated ownership/staff checks; no public receipt URLs are added.
7. Repeating check-in must return 409 and create neither another receipt nor another email. A failed check-in must create neither. Check booking/cancellation conflicts similarly.

For previews without a database or email delivery:

```sh
npm run build
npm run preview:notifications --workspace backend
```

The command prints a temporary directory containing four HTML emails, matching plain-text versions and a PDF, all with explicitly synthetic data. Open the HTML at desktop and narrow/mobile widths, and open or print the PDF. To verify actual email-client rendering, send the manual test events to controlled Gmail/Outlook inboxes and inspect both desktop and mobile. Automated checks validate table layout, inline styles, Outlook conditional markup, escaping and responsive width settings; they do not emulate Gmail or Outlook rendering engines.

## Implementation

- `backend/src/email/layout.ts`: shared table-based HTML layout with inline brand styles, safe dynamic content, plain-text fallback and an optional HTTP(S) action.
- `backend/src/email/appointment.ts`: patient booking, patient cancellation, doctor cancellation and check-in content, with Asia/Almaty dates and times.
- `backend/src/appointmentNotifications.ts`: existing notification service, Resend attachment delivery, persistent event claims and failure records. Existing system notifications also use the shared layout. Registration and password recovery share it too.
- `backend/src/registrationReceipt.ts`: server-side jsPDF registration document generated from the receipt record and the exact check-in timestamp persisted by the successful transaction. Contains no IIN, visit purpose, payment data or clinical details.
- `backend/src/assets/` and `frontend/public/fonts/`: locally bundled SIL Open Font License Noto Sans for Kazakh/Cyrillic text. The backend build copies its assets into `dist/assets`; receipt creation makes no external font request. The browser loads the font from this application's static assets.
- Existing frontend receipt rendering/download/printing is retained, with registration-only content and real IDs. No prices, taxes, fake phone number or sample-document disclaimer remain on registration receipts.

## Deduplication and failures

Booking/cancellation keys use the persisted slot update timestamp to distinguish new bookings of a previously cancelled slot. Check-in keys use the unique persisted receipt ID. Recipient-specific keys preserve patient and doctor notification behavior. A unique `Notification.eventKey` record is inserted **before** contacting Resend; concurrent/replayed events cannot send twice. The same key is supplied as Resend's idempotency key. `Receipt.slotId` remains unique; front-desk walk-in receipt creation now runs inside the check-in transaction too.

Email notifications progress from `PENDING` to the existing `DELIVERED` or `FAILED` status. As before, `DELIVERED` means Resend accepted the request, not confirmed mailbox delivery. A provider/PDF failure records a generic error without patient content and cannot undo booking, cancellation or check-in. Notification errors do not log patient identifiers, clinical content, provider error bodies or credentials.

This retains the application's asynchronous best-effort delivery architecture: there is no new retry worker or durable outbox. Failed notifications are retained for operational review rather than automatically resent; a process crash can leave a `PENDING` claim. Review the provider delivery record before any manual recovery to avoid duplicate sends, especially after the provider's idempotency retention window. Receipts remain available through the authenticated app when delivery fails. No claim of guaranteed email delivery is made.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

All automated email tests mock Resend and do not send real messages. Backend tests cover actual routes, event concurrency, conflict rejection, failure isolation, PDF parsing/text/Unicode, real persisted IDs and check-in times, HTML escaping and timezone rollover. Frontend tests cover the existing receipt actions and registration-only content. There is no lint script configured in this repository.

Dependencies: backend runtime `jspdf` 4.2.1 (the same library/version already used by the frontend); backend test-only `pdfjs-dist` for independently parsing generated PDFs. PDF test execution requires Node >=22.13 (or >=24), consistent with the Node 22 Docker image when current.
