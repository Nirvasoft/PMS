import { Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import EnquiryForm from './EnquiryForm';
import {
  buildChannelLinks,
  buildContactLinks,
  buildEnquiryMessage,
  type EnquiryUnit,
  type PublicChannel,
} from './leasingContact';

export interface LeasingContact {
  name?: string | null;
  phones?: string[] | null;
  email?: string | null;
  /** Channels the team published (Viber, Telegram, ...). When present they replace the phone / email based buttons. */
  channels?: PublicChannel[] | null;
}

interface Props {
  /** When set, the enquiry form is shown and submitting it creates a CRM lead. */
  propertyId?: string;
  contact?: LeasingContact | null;
  propertyName?: string;
  /** Unit the visitor is asking about; omit for a general enquiry. */
  unit?: EnquiryUnit | null;
}

/** Enquiry form plus one-tap contact channels (call / SMS / Viber / WhatsApp / Telegram / email) with a pre-filled message. */
export default function LeasingContactPanel({ propertyId, contact, propertyName, unit }: Props) {
  const phones = contact?.phones?.filter(Boolean) ?? [];
  const channels = contact?.channels?.filter((c) => c?.value) ?? [];
  const hasDirectContact = channels.length > 0 || phones.length > 0 || Boolean(contact?.email);
  const message = buildEnquiryMessage(propertyName, unit);
  const subject = unit ? `Leasing enquiry - unit ${unit.unitNumber}` : 'Leasing enquiry';
  const links =
    channels.length > 0
      ? buildChannelLinks(channels, message, subject)
      : buildContactLinks(phones[0], contact?.email, message, subject);
  const otherPhones = channels.length > 0 ? [] : phones.slice(1);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Message copied');
    } catch {
      toast.error('Could not copy the message');
    }
  };

  return (
    <div className="public-ad-contact">
      {unit && (
        <div className="public-contact-unit">
          Unit {unit.unitNumber} · {unit.floor}
          {unit.areaSqft ? ` · ${Math.round(unit.areaSqft)} sqft` : ''}
        </div>
      )}

      {propertyId && (
        <EnquiryForm key={unit?.unitId ?? 'general'} propertyId={propertyId} propertyName={propertyName} unit={unit} />
      )}

      {hasDirectContact && (
        <>
          {propertyId && <div className="public-contact-divider">Or contact us directly</div>}
          {contact?.name && <div className="public-ad-contact-name">{contact.name}</div>}
          {channels.length > 0 ? (
            <ul className="public-contact-list">
              {links.map((l) => (
                <li key={`${l.id}|${l.href}`}>
                  <a
                    className={`public-contact-row is-${l.id}`}
                    href={l.href}
                    target={l.href.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                  >
                    <span className="public-contact-row-label">{l.label}</span>
                    <span className="public-contact-row-value">{l.value}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="public-contact-values">
                {[...phones, contact?.email].filter(Boolean).join(' · ')}
              </div>
              <div className="public-contact-channels">
                {links.map((l) => (
                  <a
                    key={l.id}
                    className={`public-contact-chip is-${l.id}`}
                    href={l.href}
                    target={l.href.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
              {otherPhones.map((p) => (
                <a key={p} className="public-ad-contact-link" href={`tel:${p.replace(/[^\d+]/g, '')}`}>
                  Call {p}
                </a>
              ))}
            </>
          )}
          <button type="button" className="public-contact-copy" onClick={copyMessage} title={message}>
            <Copy size={13} /> Copy message
          </button>
        </>
      )}
    </div>
  );
}
