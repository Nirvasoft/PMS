export function calcLeaseTermMonths(start: Date, end: Date): number {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(1, months);
}

export function nextLeaseNumber(): string {
  const year = new Date().getFullYear();
  const rand  = Math.floor(Math.random() * 90000) + 10000;
  return `LSE-${year}-${rand}`;
}

export function daysUntilExpiry(endDate: Date | string): number {
  const ms = new Date(endDate).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function calcEarlyTermPenalty(rentAmount: number, remainingMonths: number): number {
  const threeMonths = rentAmount * 3;
  const halfRemaining = rentAmount * remainingMonths * 0.5;
  return Math.round(Math.min(threeMonths, halfRemaining) * 100) / 100;
}
