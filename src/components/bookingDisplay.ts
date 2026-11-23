// Preserve scenario-local time without timezone conversion.
export function bookingTime(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return value;
  const hour = Number(match[2]);
  return `${hour % 12 || 12}:${match[3]} ${hour >= 12 ? 'PM' : 'AM'} · ${match[1]}`;
}

export function timeOnly(value: string): string {
  const match = value.match(/[ T](\d{2}):(\d{2})$/);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}
