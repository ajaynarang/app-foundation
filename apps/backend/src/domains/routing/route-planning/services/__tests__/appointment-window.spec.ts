import { buildAppointmentWindow } from '../appointment-window';

describe('buildAppointmentWindow (SQ-97)', () => {
  // The Prisma client returns @db.Date columns as JS Dates anchored at UTC
  // midnight of the calendar day, e.g. `new Date('2026-05-10T00:00:00Z')`.
  // We test with that exact shape because the bug was that the engine used
  // `new Date()` (today) and dropped the appointment date entirely.
  const utcMidnight = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it('combines appointmentDate + HH:MM + timezone into a proper UTC Date', () => {
    const window = buildAppointmentWindow(
      {
        appointmentDate: utcMidnight('2026-05-10'),
        earliestArrival: '12:00',
        latestArrival: '12:00',
      },
      'America/New_York',
    );

    expect(window).toBeDefined();
    // 12:00 ET on 2026-05-10 == 16:00 UTC (May → EDT, -04:00)
    expect(window.start.toISOString()).toBe('2026-05-10T16:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-05-10T16:00:00.000Z');
  });

  it('returns distinct start and end when the window has duration', () => {
    const window = buildAppointmentWindow(
      {
        appointmentDate: utcMidnight('2026-05-11'),
        earliestArrival: '08:30',
        latestArrival: '10:00',
      },
      'America/New_York',
    );

    expect(window.start.toISOString()).toBe('2026-05-11T12:30:00.000Z');
    expect(window.end.toISOString()).toBe('2026-05-11T14:00:00.000Z');
  });

  it('respects a non-default timezone (Pacific) on the same calendar day', () => {
    const window = buildAppointmentWindow(
      {
        appointmentDate: utcMidnight('2026-07-15'),
        earliestArrival: '09:00',
        latestArrival: '17:00',
      },
      'America/Los_Angeles',
    );

    // 09:00 PT in July == 16:00 UTC (PDT -07:00)
    expect(window.start.toISOString()).toBe('2026-07-15T16:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-07-16T00:00:00.000Z');
  });

  it('handles 02:15 AM correctly without rolling to the previous day (SQ-97 scenario)', () => {
    // The exact bug shape: pickup at 02:15 AM local on Apr 23. Prior code
    // computed `new Date()` with hours/minutes set, anchoring on TODAY in the
    // host TZ — for a planner that runs at 8 PM the night before, that
    // landed the pickup at 02:15 AM TODAY, ~24 hours off.
    const window = buildAppointmentWindow(
      {
        appointmentDate: utcMidnight('2026-04-23'),
        earliestArrival: '02:15',
        latestArrival: '03:00',
      },
      'America/New_York',
    );

    expect(window.start.toISOString()).toBe('2026-04-23T06:15:00.000Z');
    expect(window.end.toISOString()).toBe('2026-04-23T07:00:00.000Z');
  });

  it('handles DST forward transition (US spring-forward)', () => {
    // March 8, 2026 — second Sunday of March, US DST begins at 02:00 local.
    // 02:30 local is non-existent; Luxon advances to 03:30 EDT (UTC -04:00).
    const window = buildAppointmentWindow(
      {
        appointmentDate: utcMidnight('2026-03-08'),
        earliestArrival: '02:30',
        latestArrival: '04:00',
      },
      'America/New_York',
    );

    expect(window).toBeDefined();
    // 04:00 ET after spring-forward == 08:00 UTC
    expect(window.end.toISOString()).toBe('2026-03-08T08:00:00.000Z');
  });

  it('returns undefined when appointmentDate is missing', () => {
    const window = buildAppointmentWindow(
      { appointmentDate: null, earliestArrival: '12:00', latestArrival: '12:00' },
      'America/New_York',
    );
    expect(window).toBeUndefined();
  });

  it('returns undefined when earliestArrival is missing', () => {
    const window = buildAppointmentWindow(
      { appointmentDate: utcMidnight('2026-05-10'), earliestArrival: null, latestArrival: '12:00' },
      'America/New_York',
    );
    expect(window).toBeUndefined();
  });

  it('returns undefined when latestArrival is missing', () => {
    const window = buildAppointmentWindow(
      { appointmentDate: utcMidnight('2026-05-10'), earliestArrival: '12:00', latestArrival: null },
      'America/New_York',
    );
    expect(window).toBeUndefined();
  });

  it('returns undefined when a time string is malformed', () => {
    const window = buildAppointmentWindow(
      { appointmentDate: utcMidnight('2026-05-10'), earliestArrival: '25:99', latestArrival: '12:00' },
      'America/New_York',
    );
    expect(window).toBeUndefined();
  });

  it('returns undefined when timezone is invalid', () => {
    const window = buildAppointmentWindow(
      { appointmentDate: utcMidnight('2026-05-10'), earliestArrival: '12:00', latestArrival: '12:00' },
      'Not/A_Real_Zone',
    );
    expect(window).toBeUndefined();
  });

  // ─── Facility operating-hours fallback (§3.5) ──────────────────────────────
  // When a stop has no per-load appointment, we must not schedule arrival at a
  // closed dock. The facility's operatingHours for the relevant weekday become
  // the window. The weekday is resolved from `referenceDate` (the planned day),
  // since there is no appointmentDate to anchor on in the fallback path.
  describe('facility operating-hours fallback', () => {
    const apptDate = utcMidnight('2026-04-03'); // Fri Apr 3, 2026

    it('falls back to facility operating hours when no per-load window', () => {
      const window = buildAppointmentWindow(
        { appointmentDate: apptDate, earliestArrival: null, latestArrival: null },
        'UTC',
        { operatingHours: { fri: ['06:00', '18:00'] }, referenceDate: apptDate },
      );
      expect(window).toBeDefined();
      expect(window.start.toISOString()).toBe('2026-04-03T06:00:00.000Z');
      expect(window.end.toISOString()).toBe('2026-04-03T18:00:00.000Z');
    });

    it('per-load window takes precedence over operating hours', () => {
      const window = buildAppointmentWindow(
        { appointmentDate: apptDate, earliestArrival: '09:00', latestArrival: '10:00' },
        'UTC',
        { operatingHours: { fri: ['06:00', '18:00'] }, appointmentRequired: true, referenceDate: apptDate },
      );
      // Confirmed appointment wins over the broader operating-hours window.
      expect(window.start.toISOString()).toBe('2026-04-03T09:00:00.000Z');
      expect(window.end.toISOString()).toBe('2026-04-03T10:00:00.000Z');
    });

    it('returns undefined when the facility is closed that weekday', () => {
      const window = buildAppointmentWindow(
        { appointmentDate: apptDate, earliestArrival: null, latestArrival: null },
        'UTC',
        { operatingHours: { mon: ['06:00', '18:00'] }, referenceDate: apptDate }, // no Fri entry
      );
      expect(window).toBeUndefined();
    });

    it('returns undefined when there is neither an appointment nor a facility', () => {
      const window = buildAppointmentWindow(
        { appointmentDate: null, earliestArrival: null, latestArrival: null },
        'UTC',
      );
      expect(window).toBeUndefined();
    });

    it('resolves the weekday from referenceDate in the stop timezone', () => {
      // referenceDate is a UTC-midnight @db.Date; in ET it is still Fri Apr 3.
      const window = buildAppointmentWindow(
        { appointmentDate: null, earliestArrival: null, latestArrival: null },
        'America/New_York',
        { operatingHours: { fri: ['08:00', '17:00'] }, referenceDate: apptDate },
      );
      expect(window).toBeDefined();
      // 08:00 ET (EDT -04:00) on Apr 3 == 12:00 UTC
      expect(window.start.toISOString()).toBe('2026-04-03T12:00:00.000Z');
      expect(window.end.toISOString()).toBe('2026-04-03T21:00:00.000Z');
    });
  });
});
