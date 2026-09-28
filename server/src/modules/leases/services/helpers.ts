export function calcLeaseTermMonths(start: Date | string, end: Date | string): number {
  if (!start || !end) return 0;

  const parseParts = (val: Date | string) => {
    if (typeof val === 'string') {
      const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
      }
    }
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return null;
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  };

  const s = parseParts(start);
  const e = parseParts(end);
  if (!s || !e) return 0;

  const startUtc = Date.UTC(s.y, s.m, s.d);
  const endUtc = Date.UTC(e.y, e.m, e.d);
  if (endUtc < startUtc) return 0;

  // Add 1 day because lease end dates are inclusive
  const nextDay = new Date(Date.UTC(e.y, e.m, e.d + 1));
  let months = (nextDay.getUTCFullYear() - s.y) * 12 + (nextDay.getUTCMonth() - s.m);
  if (nextDay.getUTCDate() < s.d) {
    months -= 1;
  }
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
