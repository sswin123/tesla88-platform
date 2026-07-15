/**
 * Normalize Malaysian phone number to 60XXXXXXXXX format.
 * Accepts: 0111234567 | 60111234567 | +60111234567
 * Returns: 60111234567 or null if invalid.
 */
export function normalizePhone(phone: string): string | null {
  const cleaned = phone.trim().replace(/[\s\-]/g, '');

  let normalized: string;
  if (cleaned.startsWith('+60')) {
    normalized = '60' + cleaned.slice(3);
  } else if (cleaned.startsWith('60')) {
    normalized = cleaned;
  } else if (cleaned.startsWith('0')) {
    normalized = '60' + cleaned.slice(1);
  } else {
    return null;
  }

  // Must be 60 followed by 8-10 digits (Malaysian numbers: 601x-xxxx-xxxx)
  if (!/^60\d{8,10}$/.test(normalized)) return null;
  return normalized;
}
