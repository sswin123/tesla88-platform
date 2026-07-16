export function normalizePhone(phone: string): string | null {
  const cleaned = phone.trim().replace(/[\s\-]/g, '');
  let normalized: string;
  if (cleaned.startsWith('+60')) normalized = '60' + cleaned.slice(3);
  else if (cleaned.startsWith('60')) normalized = cleaned;
  else if (cleaned.startsWith('0')) normalized = '60' + cleaned.slice(1);
  else return null;
  if (!/^60\d{8,10}$/.test(normalized)) return null;
  return normalized;
}
