/** Helpers for the public "interested in leasing?" contact flow: enquiry text and one-tap contact links. */

/** Local numbers that start with a single 0 are treated as Myanmar numbers when no country code is given. */
const DEFAULT_COUNTRY_CODE = '95';

export interface EnquiryUnit {
  /** Unit id, so the enquiry can be linked to the unit. */
  unitId?: string;
  unitNumber: string;
  /** Floor label as shown on the map. */
  floor: string;
  areaSqft?: number | null;
}

/** A unit that is available for lease, as listed on the public page. */
export interface AvailableUnit extends EnquiryUnit {
  unitId: string;
  /** Key used by the map to open the floor of this unit. */
  floorKey: string;
}

export type ContactChannel = 'call' | 'sms' | 'viber' | 'whatsapp' | 'telegram' | 'email' | 'website';

/** A channel the property team chose to publish (see Property > Key Contacts). */
export interface PublicChannel {
  type: 'phone' | 'mobile' | 'email' | 'viber' | 'whatsapp' | 'telegram' | 'sms' | 'website' | 'other';
  value: string;
}

interface ContactLink {
  id: ContactChannel;
  label: string;
  href: string;
  /** The number / address behind the button, shown next to it. */
  value?: string;
}

/** International digits of a phone number (no +), or '' when it has none. */
function internationalDigits(phone: string): string {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return digits;
  if (raw.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return DEFAULT_COUNTRY_CODE + digits.slice(1);
  return digits;
}

/** Ready-to-send message for the leasing team, naming the unit when one is picked. */
export function buildEnquiryMessage(propertyName: string | undefined, unit?: EnquiryUnit | null): string {
  const place = propertyName ? ` at ${propertyName}` : '';
  if (!unit) {
    return `Hello, I'm interested in leasing a space${place}. Could you please share the available units?`;
  }
  const size = unit.areaSqft ? `, ${Math.round(unit.areaSqft)} sqft` : '';
  return `Hello, I'm interested in leasing unit ${unit.unitNumber} (${unit.floor}${size})${place}. Could you please share the details?`;
}

/** One-tap contact links for a phone number and / or email. Text is pre-filled where the app supports it. */
export function buildContactLinks(
  phone: string | null | undefined,
  email: string | null | undefined,
  message: string,
  subject: string,
): ContactLink[] {
  const links: ContactLink[] = [];
  const intl = phone ? internationalDigits(phone) : '';
  if (phone && intl) {
    const dial = `+${intl}`;
    const text = encodeURIComponent(message);
    links.push(
      { id: 'call', label: 'Call', href: `tel:${dial}` },
      { id: 'sms', label: 'SMS', href: `sms:${dial}?body=${text}` },
      { id: 'viber', label: 'Viber', href: `viber://chat?number=${encodeURIComponent(dial)}` },
      { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${intl}?text=${text}` },
      { id: 'telegram', label: 'Telegram', href: `https://t.me/${dial}` },
    );
  }
  if (email) {
    links.push({
      id: 'email',
      label: 'Email',
      href: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    });
  }
  return links;
}

/** One-tap links for the exact channels a contact published; only the apps that were added get a button. */
export function buildChannelLinks(channels: PublicChannel[], message: string, subject: string): ContactLink[] {
  const links: ContactLink[] = [];
  const seen = new Set<string>();
  const push = (link: ContactLink) => {
    const key = `${link.id}|${link.href}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };
  const text = encodeURIComponent(message);
  for (const ch of channels) {
    const value = ch.value.trim();
    if (!value) continue;
    const intl = internationalDigits(value);
    const dial = `+${intl}`;
    switch (ch.type) {
      case 'phone':
        if (intl) push({ id: 'call', label: 'Call', href: `tel:${dial}`, value });
        break;
      case 'mobile':
        if (intl) {
          push({ id: 'call', label: 'Call', href: `tel:${dial}`, value });
          push({ id: 'sms', label: 'SMS', href: `sms:${dial}?body=${text}`, value });
        }
        break;
      case 'sms':
        if (intl) push({ id: 'sms', label: 'SMS', href: `sms:${dial}?body=${text}`, value });
        break;
      case 'viber':
        if (intl) push({ id: 'viber', label: 'Viber', href: `viber://chat?number=${encodeURIComponent(dial)}`, value });
        break;
      case 'whatsapp':
        if (intl) push({ id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${intl}?text=${text}`, value });
        break;
      case 'telegram': {
        // A phone number opens by number; anything else is treated as a @username.
        const isNumber = /^[+\d][\d\s()-]{4,}$/.test(value);
        const handle = value.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
        if (isNumber && intl) push({ id: 'telegram', label: 'Telegram', href: `https://t.me/${dial}`, value });
        else if (/^[A-Za-z0-9_]{3,}$/.test(handle)) push({ id: 'telegram', label: 'Telegram', href: `https://t.me/${handle}`, value });
        break;
      }
      case 'email':
        push({
          id: 'email',
          label: 'Email',
          href: `mailto:${value}?subject=${encodeURIComponent(subject)}&body=${text}`,
          value,
        });
        break;
      case 'website':
        push({ id: 'website', label: 'Website', href: /^https?:\/\//i.test(value) ? value : `https://${value}`, value });
        break;
      default:
        break;
    }
  }
  return links;
}
