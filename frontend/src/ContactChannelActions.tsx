type Props = {
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  doNotContact?: boolean;
  emailStatus?: "not_checked" | "verified" | "invalid";
};

function safeLinkedInUrl(value: string | null | undefined) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol) && (parsed.hostname === "linkedin.com" || parsed.hostname.endsWith(".linkedin.com")) ? parsed.href : "";
  } catch { return ""; }
}

export default function ContactChannelActions({ email, phone, linkedinUrl, doNotContact = false, emailStatus }: Props) {
  if (doNotContact) return <span className="contact-actions-blocked">Do not contact</span>;
  const safeEmail = email && emailStatus !== "invalid" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  const safePhone = (phone ?? "").replace(/\D/g, "");
  const safeWhatsAppPhone = safePhone.length >= 8 ? safePhone : "";
  const safeLinkedIn = safeLinkedInUrl(linkedinUrl);

  if (!safeEmail && !safeWhatsAppPhone && !safeLinkedIn) return null;
  return <div className="contact-channel-actions" aria-label="Contact channels">
    {safeEmail && <a className="channel-icon email" href={`mailto:${safeEmail}`} aria-label={`Email ${safeEmail}`} title={`Email ${safeEmail}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h17v11h-17z"/><path d="m4 7 8 6 8-6"/></svg>
    </a>}
    {safeLinkedIn && <a className="channel-icon linkedin" href={safeLinkedIn} target="_blank" rel="noreferrer" aria-label="Open LinkedIn profile" title="Open LinkedIn profile"><span aria-hidden="true">in</span></a>}
    {safeWhatsAppPhone && <a className="channel-icon whatsapp" href={`https://wa.me/${safeWhatsAppPhone}`} target="_blank" rel="noreferrer" aria-label="Open WhatsApp chat" title="Open WhatsApp chat">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 11.8a8.2 8.2 0 0 1-12.1 7.2L4 20l1.1-4a8.2 8.2 0 1 1 15.1-4.2Z"/><path d="M9 8.2c.2-.4.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.2.2-.2.4 0 .6.4.7 1 1.3 1.7 1.7.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.7-.1l1.6.8c.3.1.4.3.3.6-.1.5-.4 1.2-.9 1.5-.5.4-1.1.5-1.8.3-1-.3-2.3-1-3.4-2-1-.9-1.8-2.1-2.1-3.1-.3-.9 0-1.7.7-2.2Z"/></svg>
    </a>}
  </div>;
}
