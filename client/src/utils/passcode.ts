/**
 * Currency-unlock passcode: DD + XX + YYYY + XX + MM, where DD/YYYY/MM must match
 * today's date and both XX segments must be an identical 2-digit pair chosen by the user.
 * e.g. for 17/09/2026: "174420264409" or "171220261209" both work (XX = 44 or 12).
 */
export function isValidCurrencyOverridePasscode(input: string, today: Date = new Date()): boolean {
  if (!/^\d{12}$/.test(input)) return false;
  const dd   = String(today.getDate()).padStart(2, '0');
  const yyyy = String(today.getFullYear());
  const mm   = String(today.getMonth() + 1).padStart(2, '0');
  const day    = input.slice(0, 2);
  const x1     = input.slice(2, 4);
  const year   = input.slice(4, 8);
  const x2     = input.slice(8, 10);
  const month  = input.slice(10, 12);
  return day === dd && year === yyyy && month === mm && x1 === x2;
}
