import { useCallback, useEffect, useState } from "react";
import { API_URL, apiFetch } from "./api";
import ContactChannelActions from "./ContactChannelActions";

type Channel = "linkedin" | "whatsapp";
type Account = { id: string; company_name: string };
type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  do_not_contact: boolean;
};

export default function MessagingChannel({ organizationId, channel }: { organizationId: string; channel: Channel }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAccounts = useCallback(async () => {
    if (!organizationId.trim()) { setAccounts([]); setAccountId(""); return; }
    setLoading(true); setError("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts`);
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Could not load target companies.");
      const rows = Array.isArray(data) ? data as Account[] : [];
      setAccounts(rows);
      setAccountId((current) => rows.some((account) => account.id === current) ? current : rows[0]?.id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load target companies.");
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    let active = true;
    async function loadContacts() {
      if (!organizationId.trim() || !accountId) { setContacts([]); setContactId(""); return; }
      setLoading(true); setError("");
      try {
        const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts/${encodeURIComponent(accountId)}/contacts`);
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Could not load saved contacts.");
        const rows = Array.isArray(data) ? data as Contact[] : [];
        if (active) {
          setContacts(rows);
          setContactId(rows.find((contact) => !contact.do_not_contact)?.id ?? "");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load saved contacts.");
      } finally { if (active) setLoading(false); }
    }
    void loadContacts();
    return () => { active = false; };
  }, [accountId, organizationId]);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const selectedContact = contacts.find((contact) => contact.id === contactId);
  const isLinkedIn = channel === "linkedin";

  useEffect(() => {
    if (!selectedContact || !selectedAccount) { setMessage(""); return; }
    const firstName = selectedContact.first_name || "there";
    setMessage(isLinkedIn
      ? `Hi ${firstName}, I came across ${selectedAccount.company_name} and thought it could be useful to connect. I work with teams on [relevant outcome]. Would you be open to a brief conversation?`
      : `Hi ${firstName}, I’m reaching out because of your work at ${selectedAccount.company_name}. We help teams with [relevant outcome]. Would a short conversation be useful?`);
  }, [isLinkedIn, selectedAccount, selectedContact]);

  const eligibleContacts = contacts.filter((contact) => !contact.do_not_contact);
  const linkedinUrl = /^https:\/\//i.test(selectedContact?.linkedin_url ?? "") ? selectedContact?.linkedin_url ?? "" : "";
  const phoneDigits = (selectedContact?.phone ?? "").replace(/\D/g, "");
  const whatsappUrl = phoneDigits.length >= 8
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`
    : "";

  return <section className="form-card messaging-channel-panel" aria-label={`${isLinkedIn ? "LinkedIn" : "WhatsApp"} messaging`}>
    <div className="card-heading">
      <div><span className="research-kicker">MANUAL HANDOFF</span><h2>{isLinkedIn ? "LinkedIn messaging" : "WhatsApp messaging"}</h2>
        <p>Prepare a message from this client’s saved contacts, then review and send it yourself in {isLinkedIn ? "LinkedIn" : "WhatsApp"}.</p></div>
      <span className="draft-badge">APP NOT CONNECTED</span>
    </div>
    <p className="channel-setup-note">
      {isLinkedIn
        ? "Use the button below to sign in to LinkedIn in a separate tab. It does not link LinkedIn to this app; messages are still sent manually, and your password is never stored here."
        : "Use the button below to link WhatsApp Web with its QR code. This does not connect the WhatsApp Business API to this app; messages are still reviewed and sent manually."}
    </p>
    <div className="channel-connect-actions">
      {isLinkedIn ? <>
        <a className="apply-button" href="https://www.linkedin.com/uas/login" target="_blank" rel="noreferrer">Connect LinkedIn account ↗</a>
        <a className="provider-signup-link" href="https://www.linkedin.com/developers/" target="_blank" rel="noreferrer">LinkedIn developer access</a>
      </> : <>
        <a className="apply-button" href="https://web.whatsapp.com/" target="_blank" rel="noreferrer">Connect WhatsApp account ↗</a>
        <a className="provider-signup-link" href="https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/" target="_blank" rel="noreferrer">Set up WhatsApp Business Platform</a>
      </>}
    </div>
    <div className="form-grid">
      <div className="field full-width"><label htmlFor={`${channel}-account`}>Target company</label>
        <select id={`${channel}-account`} value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={loading || accounts.length === 0}>
          {accounts.length === 0 ? <option value="">{loading ? "Loading companies…" : "Add a target company first"}</option> : accounts.map((account) => <option value={account.id} key={account.id}>{account.company_name}</option>)}
        </select>
      </div>
      <div className="field full-width"><label htmlFor={`${channel}-contact`}>Contact</label>
        <select id={`${channel}-contact`} value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={loading || eligibleContacts.length === 0}>
          {eligibleContacts.length === 0 ? <option value="">{contacts.some((contact) => contact.do_not_contact) ? "No eligible contacts; do-not-contact records are excluded" : "Add a saved contact first"}</option> : eligibleContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.first_name} {contact.last_name ?? ""}{contact.job_title ? ` · ${contact.job_title}` : ""}</option>)}
        </select>
      </div>
      {selectedContact && <div className="field full-width"><ContactChannelActions email={selectedContact.email} phone={selectedContact.phone} linkedinUrl={selectedContact.linkedin_url} doNotContact={selectedContact.do_not_contact} /></div>}
      <div className="field full-width"><label htmlFor={`${channel}-draft`}>Editable message draft</label>
        <textarea id={`${channel}-draft`} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} disabled={!selectedContact} />
        <span className="field-hint">Replace the bracketed text and check the message before sending.</span>
      </div>
    </div>
    {selectedContact && (isLinkedIn
      ? linkedinUrl
        ? <a className="apply-button channel-launch" href={linkedinUrl} target="_blank" rel="noreferrer">Open LinkedIn profile to send manually ↗</a>
        : <p className="target-account-empty">This contact has no saved LinkedIn profile link. Add one under Decision-maker contacts.</p>
      : whatsappUrl
        ? <a className="apply-button channel-launch" href={whatsappUrl} target="_blank" rel="noreferrer">Review and open WhatsApp chat ↗</a>
        : <p className="target-account-empty">This contact needs a phone number with its country code for a WhatsApp handoff.</p>
    )}
    {error && <div className="research-error" role="alert">{error}</div>}
  </section>;
}
