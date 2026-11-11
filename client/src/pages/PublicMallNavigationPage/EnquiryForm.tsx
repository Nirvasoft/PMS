import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useCreatePublicEnquiryMutation } from '../../store/api/mallApi';
import { buildEnquiryMessage, type EnquiryUnit } from './leasingContact';

const BUSINESS_TYPES = ['Retail', 'Food & Beverage', 'Fashion', 'Beauty & Health', 'Services', 'Electronics', 'Other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  propertyId: string;
  propertyName?: string;
  /** Unit the visitor is asking about; omit for a general enquiry. */
  unit?: EnquiryUnit | null;
}

/** Enquiry form on the public page. Submitting creates a CRM lead for the leasing team. */
export default function EnquiryForm({ propertyId, propertyName, unit }: Props) {
  const [createEnquiry, { isLoading }] = useCreatePublicEnquiryMutation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [message, setMessage] = useState(() => buildEnquiryMessage(propertyName, unit));
  const [honeypot, setHoneypot] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const nameInvalid = submitted && !name.trim();
  const phoneInvalid = submitted && !phone.trim() && !email.trim();
  const emailInvalid = submitted && Boolean(email.trim()) && !EMAIL_RE.test(email.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError('');
    const missingName = !name.trim();
    const missingContact = !phone.trim() && !email.trim();
    const badEmail = Boolean(email.trim()) && !EMAIL_RE.test(email.trim());
    if (missingName || missingContact || badEmail) {
      if (missingName) setError('Please enter your name.');
      else if (missingContact) setError('Please enter a phone number or an email.');
      else setError('Please enter a valid email.');
      return;
    }
    try {
      await createEnquiry({
        propertyId,
        body: {
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          companyName: companyName.trim() || undefined,
          businessType: businessType || undefined,
          message: message.trim() || undefined,
          unitId: unit?.unitId,
          website: honeypot || undefined,
        },
      }).unwrap();
      setSent(true);
    } catch (err: any) {
      setError(
        err?.status === 429
          ? 'Too many enquiries from this device. Please try again in a few minutes.'
          : err?.data?.errors?.[0]?.message || err?.data?.message || 'Could not send your enquiry. Please try again.',
      );
    }
  };

  if (sent) {
    return (
      <div className="public-enquiry-done" role="status">
        <CheckCircle2 size={22} />
        <strong>Thank you!</strong>
        <span>Our leasing team received your enquiry and will contact you soon.</span>
      </div>
    );
  }

  return (
    <form className="public-enquiry-form" onSubmit={submit} noValidate>
      <input
        className={`public-enquiry-input${nameInvalid ? ' input-error' : ''}`}
        placeholder="Your name *"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError('');
        }}
        aria-invalid={nameInvalid}
        maxLength={120}
        autoComplete="name"
      />
      <div className="public-enquiry-row">
        <input
          className={`public-enquiry-input${phoneInvalid ? ' input-error' : ''}`}
          placeholder="Phone *"
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (error) setError('');
          }}
          aria-invalid={phoneInvalid}
          maxLength={40}
          autoComplete="tel"
        />
        <input
          className={`public-enquiry-input${emailInvalid ? ' input-error' : ''}`}
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError('');
          }}
          aria-invalid={emailInvalid}
          maxLength={255}
          autoComplete="email"
        />
      </div>
      <div className="public-enquiry-row">
        <input
          className="public-enquiry-input"
          placeholder="Business / shop name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          maxLength={150}
        />
        <select
          className="public-enquiry-input"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          aria-label="Business type"
        >
          <option value="">Business type</option>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="public-enquiry-input"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
        aria-label="Message"
      />
      {/* Honeypot: hidden from people, bots tend to fill it. */}
      <input
        className="public-enquiry-trap"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        name="website"
      />
      {error && (
        <div className="public-enquiry-error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="public-ad-btn is-primary" disabled={isLoading}>
        {isLoading ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  );
}
