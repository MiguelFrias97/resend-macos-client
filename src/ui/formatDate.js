// Human-friendly timestamps for the list and thread. Apple-Mail convention:
// today → time, this year → "Jun 11", older → "Jun 11, 2025". Never show a raw
// ISO string to a person.
export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    [],
    sameYear
      ? {month: 'short', day: 'numeric'}
      : {month: 'short', day: 'numeric', year: 'numeric'},
  );
}

// Longer form for the thread header ("Jun 11, 2026 at 3:07 PM").
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'});
  const time = d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  return `${date} at ${time}`;
}
