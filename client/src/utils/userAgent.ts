/**
 * Parses a raw HTTP User-Agent string into a concise human-readable label
 * such as "Edge • Windows", "Chrome • macOS", or "Safari • iPhone".
 */
export function formatUserAgent(raw?: unknown): string {
  const ua = typeof raw === 'string' ? raw.trim() : '';
  if (!ua || ua.toLowerCase() === 'unknown') return '—';

  let browser = '';
  if (/Edg(?:A|iOS)?\//i.test(ua)) browser = 'Edge';
  else if (/(?:OPR|Opera)\//i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser\//i.test(ua)) browser = 'Samsung Internet';
  else if (/(?:Firefox|FxiOS)\//i.test(ua)) browser = 'Firefox';
  else if (/(?:Chrome|CriOS)\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  else if (/PostmanRuntime\//i.test(ua)) browser = 'Postman';
  else if (/curl\//i.test(ua)) browser = 'cURL';

  let os = '';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  if (browser && os) return `${browser} • ${os}`;
  if (browser) return browser;
  if (os) return os;
  return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
}

/**
 * Normalizes IPv6 loopback (::1) and IPv4-mapped IPv6 (::ffff:x.x.x.x)
 * into clean IPv4 display strings.
 */
export function formatIpAddress(raw?: unknown): string {
  const ip = typeof raw === 'string' ? raw.trim() : '';
  if (!ip) return '—';
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return '127.0.0.1';
  if (/^::ffff:/i.test(ip)) return ip.slice(7);
  return ip;
}
