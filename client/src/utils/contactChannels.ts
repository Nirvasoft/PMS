/** Ways a property contact can be reached (stored as `channels` on the contact). */
export type ContactChannelType =
  | 'phone'
  | 'mobile'
  | 'email'
  | 'viber'
  | 'whatsapp'
  | 'telegram'
  | 'sms'
  | 'website'
  | 'other';

interface ContactChannelEntry {
  type: ContactChannelType;
  value: string;
}

interface ContactChannelOption {
  value: ContactChannelType;
  label: string;
  input: 'tel' | 'email' | 'url' | 'text';
  placeholder: string;
}

export const CONTACT_CHANNEL_OPTIONS: ContactChannelOption[] = [
  { value: 'mobile', label: 'Mobile', input: 'tel', placeholder: '09 123 456 789' },
  { value: 'phone', label: 'Phone (office)', input: 'tel', placeholder: '01 234 567' },
  { value: 'email', label: 'Email', input: 'email', placeholder: 'name@company.com' },
  { value: 'viber', label: 'Viber', input: 'tel', placeholder: 'Viber number, e.g. 09 123 456 789' },
  { value: 'telegram', label: 'Telegram', input: 'text', placeholder: '@username or phone number' },
  { value: 'whatsapp', label: 'WhatsApp', input: 'tel', placeholder: 'WhatsApp number, e.g. 09 123 456 789' },
  { value: 'sms', label: 'SMS', input: 'tel', placeholder: 'SMS number' },
  { value: 'website', label: 'Website', input: 'url', placeholder: 'https://example.com' },
  { value: 'other', label: 'Other', input: 'text', placeholder: 'Any other detail (e.g. WeChat ID)' },
];

export const channelOption = (type: ContactChannelType): ContactChannelOption =>
  CONTACT_CHANNEL_OPTIONS.find((o) => o.value === type) ?? CONTACT_CHANNEL_OPTIONS[CONTACT_CHANNEL_OPTIONS.length - 1];

interface ChannelSource {
  channels?: ContactChannelEntry[] | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
}

/** Channels of a contact. Contacts saved before channels existed fall back to their phone / mobile / email. */
export function contactChannelsOf(c: ChannelSource): ContactChannelEntry[] {
  if (Array.isArray(c.channels) && c.channels.length > 0) {
    return c.channels.filter((ch) => ch && typeof ch.value === 'string' && ch.value.trim());
  }
  const out: ContactChannelEntry[] = [];
  if (c.mobile) out.push({ type: 'mobile', value: c.mobile });
  if (c.phone) out.push({ type: 'phone', value: c.phone });
  if (c.email) out.push({ type: 'email', value: c.email });
  return out;
}

/** Returns an error message for a channel row, or null when it is valid (or still empty). */
export function validateChannelEntry(entry: ContactChannelEntry): string | null {
  const v = entry.value.trim();
  if (!v) return null;
  const label = channelOption(entry.type).label;
  if (entry.type === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : `${label}: enter a valid email address`;
  }
  if (['phone', 'mobile', 'sms', 'viber', 'whatsapp'].includes(entry.type)) {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 5 && digits.length <= 15 && v.length <= 50 ? null : `${label}: enter a valid phone number`;
  }
  if (entry.type === 'website') {
    return /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(v) ? null : `${label}: enter a valid web address`;
  }
  return null;
}
