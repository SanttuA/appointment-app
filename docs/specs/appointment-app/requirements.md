# Requirements

## Goals

- Patients can self-register, manage their profile, and book available appointments.
- Healthcare workers can manage profile details, availability, time off, and appointment status.
- Admins can manage users, services, appointments, and audit records.
- The app supports English and Finnish from v1 and can add more locales later.
- Local development is host-first and production has a light Docker Compose path.

## Non-Goals

- No diagnosis, treatment, or detailed health intake records in v1.
- No HIPAA compliance claim in v1.
- No PostgreSQL runtime in v1; the schema should remain portable for a future migration.

## Rules

- Appointment starts must align to 15-minute increments.
- Workers define appointment duration.
- Patients cannot book outside the 90-day horizon.
- Confirmed appointments cannot overlap for a worker.
- Patients cannot cancel or reschedule inside 24 hours.
- API errors must expose stable codes so the UI can localize messages.
