/**
 * Ugandan mobile-money numbers.
 *
 * SHASHURA expects the international form without a plus: `2567XXXXXXXX`.
 * Shared by the client (validation/preview) and the server (authoritative
 * normalisation before a collection or payout is requested).
 */

export const MSISDN_PREFIX = '256';

/** Returns `256XXXXXXXXX`, or `null` when the input is not a Ugandan mobile number. */
export function normalizeMsisdn(input: string | null | undefined): string | null {
  const digits = (input ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.startsWith('256') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `256${digits.slice(1)}`;
  if (digits.length === 9 && /^[37]/.test(digits)) return `256${digits}`;

  return null;
}

/** Human form for lists and receipts: `0770 000 000`. */
export function formatMsisdn(input: string | null | undefined): string {
  const msisdn = normalizeMsisdn(input);
  if (!msisdn) return (input ?? '').trim() || '—';
  const local = `0${msisdn.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** Network shown next to a number, based on the Ugandan prefix. */
export function networkOf(input: string | null | undefined): 'MTN' | 'Airtel' | null {
  const msisdn = normalizeMsisdn(input);
  if (!msisdn) return null;
  const prefix = msisdn.slice(3, 5);
  if (['77', '78', '76', '39'].includes(prefix)) return 'MTN';
  if (['70', '75', '74', '20'].includes(prefix)) return 'Airtel';
  return null;
}
