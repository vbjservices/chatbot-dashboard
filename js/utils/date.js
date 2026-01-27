export function toISODateKey(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (!date || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODateKeyToDMY(key) {
  const s = String(key || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const dd = m[3];
  const mm = m[2];
  const yyyy = m[1];
  return `${dd}/${mm}/${yyyy}`;
}
