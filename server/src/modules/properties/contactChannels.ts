import { AppError } from '../../common/errors';

/** Ways a property contact can be reached. Stored as JSON on `PropertyContact.channels`. */
const CONTACT_CHANNEL_TYPES = [
  'phone',
  'mobile',
  'email',
  'viber',
  'whatsapp',
  'telegram',
  'sms',
  'website',
  'other',
] as const;

export type ContactChannelType = (typeof CONTACT_CHANNEL_TYPES)[number];

export interface ContactChannel {
  type: ContactChannelType;
  value: string;
}

const MAX_CHANNELS = 12;
const MAX_VALUE_LENGTH = 255;
/** Types that hold a phone number (and map to a VarChar(50) legacy column). */
const NUMBER_TYPES: ContactChannelType[] = ['phone', 'mobile', 'sms', 'viber', 'whatsapp'];

const isType = (v: unknown): v is ContactChannelType => CONTACT_CHANNEL_TYPES.includes(v as ContactChannelType);

/** Safely reads stored JSON; silently drops malformed entries. */
export function parseContactChannels(raw: unknown): ContactChannel[] {
  if (!Array.isArray(raw)) return [];
  const out: ContactChannel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { type, value } = item as { type?: unknown; value?: unknown };
    if (!isType(type) || typeof value !== 'string' || !value.trim()) continue;
    out.push({ type, value: value.trim() });
  }
  return out;
}

/** Validates channels sent by the client; throws a validation error for the first bad entry. */
export function validateContactChannels(raw: unknown): ContactChannel[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw AppError.validation('channels must be a list');
  const out: ContactChannel[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const { type, value } = (item ?? {}) as { type?: unknown; value?: unknown };
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) continue; // ignore empty rows
    if (!isType(type)) throw AppError.validation('Unknown contact channel type');
    if (v.length > MAX_VALUE_LENGTH) throw AppError.validation(`${type}: value is too long`);
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      throw AppError.validation(`Invalid email address: ${v}`);
    }
    if (NUMBER_TYPES.includes(type)) {
      const digits = v.replace(/\D/g, '');
      if (digits.length < 5 || digits.length > 15 || v.length > 50) {
        throw AppError.validation(`Invalid ${type} number: ${v}`);
      }
    }
    if (type === 'website' && !/^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(v)) {
      throw AppError.validation(`Invalid website: ${v}`);
    }
    const key = `${type}:${v.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, value: v });
  }
  if (out.length > MAX_CHANNELS) throw AppError.validation(`At most ${MAX_CHANNELS} channels per contact`);
  return out;
}

/** Legacy columns kept in sync with `channels` so older consumers (leases, portal, ...) keep working. */
export function legacyColumnsFromChannels(channels: ContactChannel[]) {
  const first = (t: ContactChannelType) => channels.find((c) => c.type === t)?.value ?? null;
  return { phone: first('phone'), mobile: first('mobile'), email: first('email') };
}

/** True when the contact has anything a visitor could use to reach it. */
export function hasReachableChannel(c: {
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  channels?: unknown;
}): boolean {
  return Boolean(
    c.phone || c.mobile || c.email || parseContactChannels(c.channels).some((ch) => ch.type !== 'other'),
  );
}
