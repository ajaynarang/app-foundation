/**
 * Parse an appointment date + time string ("HH:mm") into a full Date.
 * Returns null on invalid input.
 */
export function parseAppointmentTime(date: Date, timeStr: string): Date | null {
  try {
    const d = new Date(date);
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;
    d.setHours(hours, minutes, 0, 0);
    return d;
  } catch {
    return null;
  }
}
