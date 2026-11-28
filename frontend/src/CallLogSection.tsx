import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { API_URL, apiFetch } from "./api";
import ExotelCallPanel from "./ExotelCallPanel";
import TwilioRegionalCallPanel from "./TwilioRegionalCallPanel";
import UnifonicGulfPanel from "./UnifonicGulfPanel";
import ContactChannelActions from "./ContactChannelActions";

type TargetAccount = { id: string; company_name: string };
type TargetContact = {
  id: string; target_account_id: string; first_name: string; last_name: string | null;
  job_title: string | null; email: string | null; phone: string | null; do_not_contact: boolean;
  linkedin_url: string | null; email_status: "not_checked" | "verified" | "invalid";
};
type CallOutcome = "connected" | "voicemail" | "no_answer" | "busy" | "wrong_number" | "do_not_call";
type CallActivity = {
  id: string; target_account_id: string; target_contact_id: string; company_name: string;
  contact_name: string; job_title: string | null; phone: string | null; outcome: CallOutcome;
  called_at: string; notes: string; follow_up_at: string | null; follow_up_completed_at: string | null;
};
type CallGuide = {
  opening: string; reason_for_call: string; discovery_questions: string[];
  value_bridge: string; objection_responses: { objection: string; response: string }[];
  next_step_ask: string; voicemail: string; guardrails: string[];
};
type CallingMarket = "US" | "GULF" | "MY" | "GB" | "IN";
type LiveCallSuggestion = {
  suggested_reply: string; next_question: string; brief_reason: string; caution: string;
  conversation_stage: string; qualification_signal: string; recommended_action: string;
};

type Props = { organizationId: string };

function responseError(data: unknown, status: number) {
  if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string") return data.detail;
  return `The server returned ${status}.`;
}

export default function CallLogSection({ organizationId }: Props) {
  const [accounts, setAccounts] = useState<TargetAccount[]>([]);
  const [contacts, setContacts] = useState<TargetContact[]>([]);
  const [activities, setActivities] = useState<CallActivity[]>([]);
  const [contactId, setContactId] = useState("");
  const [callingMarket, setCallingMarket] = useState<CallingMarket>("US");
  const [outcome, setOutcome] = useState<CallOutcome>("no_answer");
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [callGuide, setCallGuide] = useState<CallGuide | null>(null);
  const [preparingGuide, setPreparingGuide] = useState(false);
  const [guideError, setGuideError] = useState("");
  const [guideNotice, setGuideNotice] = useState("");
  const [prospectSaid, setProspectSaid] = useState("");
  const [liveSuggestion, setLiveSuggestion] = useState<LiveCallSuggestion | null>(null);
  const [assistingLiveCall, setAssistingLiveCall] = useState(false);

  const loadData = useCallback(async () => {
    if (!organizationId.trim()) {
      setAccounts([]); setContacts([]); setActivities([]); setContactId("");
      return;
    }
    setLoading(true); setError("");
    const base = `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}`;
    try {
      const accountResponse = await apiFetch(`${base}/target-accounts`);
      const accountData = await accountResponse.json().catch(() => ({}));
      if (!accountResponse.ok) throw new Error(responseError(accountData, accountResponse.status));
      const loadedAccounts = Array.isArray(accountData) ? accountData as TargetAccount[] : [];
      const [contactLists, callData] = await Promise.all([
        Promise.all(loadedAccounts.map(async (account) => {
          const response = await apiFetch(`${base}/target-accounts/${encodeURIComponent(account.id)}/contacts`);
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(responseError(data, response.status));
          return Array.isArray(data) ? data as TargetContact[] : [];
        })),
        apiFetch(`${base}/calls`).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(responseError(data, response.status));
          return Array.isArray(data) ? data as CallActivity[] : [];
        }),
      ]);
      setAccounts(loadedAccounts);
      setContacts(contactLists.flat());
      setActivities(callData);
      setContactId((current) => contactLists.flat().some((contact) => contact.id === current && !contact.do_not_contact)
        ? current
        : contactLists.flat().find((contact) => !contact.do_not_contact)?.id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this client's call queue.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    setCallGuide(null);
    setGuideError("");
    setGuideNotice("");
    setProspectSaid("");
    setLiveSuggestion(null);
  }, [contactId, organizationId]);

  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const selectedContact = contactsById.get(contactId);
  const selectedAccount = selectedContact ? accountsById.get(selectedContact.target_account_id) : undefined;
  const dueCalls = activities.filter((activity) => activity.follow_up_at && !activity.follow_up_completed_at && new Date(activity.follow_up_at) <= new Date());

  async function prepareCallGuide() {
    if (!selectedContact || !selectedAccount || selectedContact.do_not_contact) return;
    setPreparingGuide(true); setGuideError(""); setGuideNotice("");
    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/calls/prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_account_id: selectedAccount.id, target_contact_id: selectedContact.id }),
          signal: AbortSignal.timeout(60000),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(data, response.status));
      setCallGuide(data as CallGuide);
      setGuideNotice("Call guide prepared from this client's saved offer and company research. Review all claims before using it.");
    } catch (caught) {
      setGuideError(caught instanceof Error ? caught.message : "Could not prepare the call guide.");
    } finally { setPreparingGuide(false); }
  }

  async function copyCallGuide() {
    if (!callGuide) return;
    const text = [
      `Opening: ${callGuide.opening}`,
      `Reason: ${callGuide.reason_for_call}`,
      "Discovery questions:", ...callGuide.discovery_questions.map((item) => `- ${item}`),
      `Value bridge: ${callGuide.value_bridge}`,
      "Objections:", ...callGuide.objection_responses.map((item) => `- ${item.objection}: ${item.response}`),
      `Next-step ask: ${callGuide.next_step_ask}`,
      `Voicemail: ${callGuide.voicemail}`,
      "Guardrails:", ...callGuide.guardrails.map((item) => `- ${item}`),
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setGuideNotice("Call guide copied.");
    } catch {
      setGuideError("Copy was unavailable in this browser. You can select and copy the guide text manually.");
    }
  }

  async function getLiveCallSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContact || !selectedAccount || selectedContact.do_not_contact || prospectSaid.trim().length < 2) return;
    setAssistingLiveCall(true); setGuideError(""); setGuideNotice("");
    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/calls/live-assist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_account_id: selectedAccount.id,
            target_contact_id: selectedContact.id,
            prospect_said: prospectSaid.trim(),
            call_guide: callGuide,
            recent_transcript: [{ speaker: "unknown", text: prospectSaid.trim() }],
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(data, response.status));
      setLiveSuggestion(data as LiveCallSuggestion);
    } catch (caught) {
      setGuideError(caught instanceof Error ? caught.message : "Could not prepare a call-side suggestion.");
    } finally { setAssistingLiveCall(false); }
  }

  async function recordCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContact || !selectedAccount) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const base = `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/calls`;
      const response = await apiFetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_account_id: selectedAccount.id,
          target_contact_id: selectedContact.id,
          outcome,
          notes,
          follow_up_at: followUpAt && outcome !== "do_not_call" ? new Date(followUpAt).toISOString() : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(data, response.status));
      setNotes(""); setFollowUpAt("");
      setNotice(outcome === "do_not_call"
        ? "Call recorded. This contact is now marked do not contact, and email sends to their saved address will be blocked for this client."
        : "Call recorded for this client.");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record the call.");
    } finally {
      setSaving(false);
    }
  }

  async function completeFollowUp(id: string) {
    const response = await apiFetch(
      `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/calls/${encodeURIComponent(id)}/complete-follow-up`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(responseError(data, response.status));
      return;
    }
    await loadData();
  }

  const outcomeLabels: Record<CallOutcome, string> = {
    connected: "Connected",
    voicemail: "Left voicemail",
    no_answer: "No answer",
    busy: "Busy",
    wrong_number: "Wrong number",
    do_not_call: "Asked not to be contacted",
  };

  return (
    <section className="form-card call-log-section" id="call-queue">
      <div className="card-heading">
        <div>
          <span className="research-kicker">MANUAL OUTREACH</span>
          <h2>Call queue and activity</h2>
          <p>Choose a market provider or call from your phone app, then record what happened and when to follow up. Each client's call history stays separate.</p>
        </div>
        <button className="load-button" type="button" onClick={() => void loadData()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error && <div className="research-error" role="alert">{error}</div>}
      {notice && <div className="prospect-notice" role="status">{notice}</div>}
      {dueCalls.length > 0 && <div className="call-due-banner"><strong>{dueCalls.length} follow-up{dueCalls.length === 1 ? "" : "s"} due</strong><span>Work through these reminders, then mark each complete.</span></div>}

      <form className="call-log-form" onSubmit={(event) => void recordCall(event)}>
        <label>Decision-maker
          <select value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={loading || contacts.every((contact) => contact.do_not_contact) || contacts.length === 0} required>
            {contacts.filter((contact) => !contact.do_not_contact).map((contact) => {
              const account = accountsById.get(contact.target_account_id);
              return <option key={contact.id} value={contact.id}>{account?.company_name ?? "Company"} · {[contact.first_name, contact.last_name].filter(Boolean).join(" ")}{contact.job_title ? ` · ${contact.job_title}` : ""}</option>;
            })}
            {contacts.length === 0 && <option value="">No saved contacts yet</option>}
            {contacts.length > 0 && contacts.every((contact) => contact.do_not_contact) && <option value="">All saved contacts are marked do not contact</option>}
          </select>
        </label>
        <div className="call-contact-actions">
          {selectedContact?.do_not_contact ? <p className="manual-call-missing">This contact is marked do not contact; outreach actions are disabled.</p> : selectedContact?.phone ? (
            <a className="apply-button manual-call-action" href={`tel:${selectedContact.phone}`}>Call from my phone · {selectedContact.phone}</a>
          ) : <p className="manual-call-missing">Add a phone number to this saved contact to enable the phone-app call button.</p>}
          {selectedContact && <ContactChannelActions email={selectedContact.email} emailStatus={selectedContact.email_status} phone={selectedContact.phone} linkedinUrl={selectedContact.linkedin_url} doNotContact={selectedContact.do_not_contact} />}
        </div>
        <label>Call outcome
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as CallOutcome)}>
            {Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={4000} placeholder="Key points, stated needs, and agreed next step" /></label>
        <label>Follow-up date and time <input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} disabled={outcome === "do_not_call"} /></label>
        <button className="save-button" type="submit" disabled={saving || loading || !selectedContact || !selectedAccount}>{saving ? "Saving call…" : "Record call"}</button>
      </form>
      <section className="call-market-picker" aria-label="Choose a calling market">
        <div><strong>Choose a calling market</strong><span>Select the market you are calling. The matching provider setup and in-app call option will appear below.</span></div>
        <div className="call-market-tabs">
          {([
            ["US", "United States · Twilio"], ["GULF", "Gulf · Unifonic"], ["MY", "Malaysia · Twilio"],
            ["GB", "United Kingdom · Twilio"], ["IN", "India · Exotel"],
          ] as [CallingMarket, string][]).map(([market, label]) => (
            <button key={market} type="button" aria-pressed={callingMarket === market} className={callingMarket === market ? "active" : ""} onClick={() => setCallingMarket(market)}>{label}</button>
          ))}
        </div>
      </section>
      {callingMarket === "IN" && <ExotelCallPanel organizationId={organizationId} account={selectedAccount} contact={selectedContact} callGuide={callGuide} />}
      {(callingMarket === "US" || callingMarket === "MY" || callingMarket === "GB") && <TwilioRegionalCallPanel organizationId={organizationId} account={selectedAccount} contact={selectedContact} callGuide={callGuide} market={callingMarket} />}
      {callingMarket === "GULF" && <UnifonicGulfPanel organizationId={organizationId} account={selectedAccount} contact={selectedContact} />}

      <section className="call-preparation">
        <div className="call-preparation-heading">
          <div><strong>AI call preparation</strong><p>Build a natural guide from this client's saved offer, the company evidence, and the contact's role.</p></div>
          <button className="apply-button" type="button" onClick={() => void prepareCallGuide()} disabled={preparingGuide || !selectedContact || !selectedAccount || selectedContact.do_not_contact}>
            {preparingGuide ? "Preparing…" : callGuide ? "Refresh call guide" : "Prepare call guide"}
          </button>
        </div>
        <small className="call-preparation-disclosure">This sends the saved client/company details to OpenAI and may use API credits. Review before use. It does not dial, listen, or record.</small>
        {guideError && <div className="research-error" role="alert">{guideError}</div>}
        {guideNotice && <div className="prospect-notice" role="status">{guideNotice}</div>}
        {callGuide && <div className="call-guide-card">
          <div className="call-guide-topline"><strong>Talk track · {selectedContact?.first_name} · {selectedAccount?.company_name}</strong><button className="load-button" type="button" onClick={() => void copyCallGuide()}>Copy guide</button></div>
          <div className="call-guide-field"><b>Opening</b><p>{callGuide.opening}</p></div>
          <div className="call-guide-field"><b>Reason for calling</b><p>{callGuide.reason_for_call}</p></div>
          <div className="call-guide-field"><b>Discovery questions</b><ol>{callGuide.discovery_questions.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}</ol></div>
          <div className="call-guide-field"><b>Value bridge</b><p>{callGuide.value_bridge}</p></div>
          <div className="call-guide-field"><b>Common objections</b>{callGuide.objection_responses.map((item) => <p key={item.objection}><strong>{item.objection}</strong> — {item.response}</p>)}</div>
          <div className="call-guide-field"><b>Next-step ask</b><p>{callGuide.next_step_ask}</p></div>
          <div className="call-guide-field"><b>Voicemail</b><p>{callGuide.voicemail}</p></div>
          {callGuide.guardrails.length > 0 && <div className="call-guide-field guardrails"><b>Check before the call</b><ul>{callGuide.guardrails.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        </div>}
        <div className="live-call-companion">
          <div><strong>During the call</strong><p>Type a short note about what they just said. Get a quick reply idea and one follow-up question.</p></div>
          <form onSubmit={(event) => void getLiveCallSuggestion(event)}>
            <label htmlFor="prospect-said">What did the prospect just say?</label>
            <textarea id="prospect-said" value={prospectSaid} onChange={(event) => setProspectSaid(event.target.value)} rows={2} maxLength={2500} placeholder="Example: We are already reviewing SAP migration options for next year." disabled={!selectedContact || selectedContact.do_not_contact} />
            <button className="apply-button" type="submit" disabled={assistingLiveCall || !selectedContact || !selectedAccount || selectedContact.do_not_contact || prospectSaid.trim().length < 2}>
              {assistingLiveCall ? "Thinking…" : "Suggest a response"}
            </button>
          </form>
          <small>This does not access headset or phone audio. Only the note you enter and the selected client's saved context are sent to OpenAI; API credits may apply. Suggestions are not saved or spoken automatically.</small>
          {liveSuggestion && <article className="live-call-suggestion" aria-live="polite">
            <div><b>Possible reply</b><p>{liveSuggestion.suggested_reply}</p></div>
            <div><b>Next question</b><p>{liveSuggestion.next_question}</p></div>
            <div><b>Call stage · next action</b><p>{liveSuggestion.conversation_stage.replaceAll("_", " ")} · {liveSuggestion.recommended_action.replaceAll("_", " ")}</p></div>
            <div><b>Qualification signal</b><p>{liveSuggestion.qualification_signal}</p></div>
            <div><b>Why this fits</b><p>{liveSuggestion.brief_reason}</p></div>
            <div className="live-call-caution"><b>Check</b><p>{liveSuggestion.caution}</p></div>
          </article>}
        </div>
      </section>

      {dueCalls.length > 0 && <div className="call-history-list"><h3>Due follow-ups</h3>{dueCalls.map((activity) => <article className="call-history-row due" key={activity.id}>
        <div><strong>{activity.contact_name}</strong><span>{activity.company_name}{activity.job_title ? ` · ${activity.job_title}` : ""}</span>{activity.phone && <a href={`tel:${activity.phone}`}>Call {activity.phone}</a>}<small>Due {new Date(activity.follow_up_at!).toLocaleString()}</small></div>
        <button className="load-button" type="button" onClick={() => void completeFollowUp(activity.id)}>Mark complete</button>
      </article>)}</div>}

      <div className="call-history-list"><h3>Recent calls</h3>
        {activities.length === 0 ? <p className="target-account-empty">No calls have been logged for this client.</p> : activities.slice(0, 20).map((activity) => <article className="call-history-row" key={activity.id}>
          <div><strong>{activity.contact_name}</strong><span>{activity.company_name}{activity.job_title ? ` · ${activity.job_title}` : ""}</span><small>{outcomeLabels[activity.outcome]} · {new Date(activity.called_at).toLocaleString()}</small>{activity.notes && <p>{activity.notes}</p>}</div>
          {activity.follow_up_at && <span className={`call-follow-up${activity.follow_up_completed_at ? " completed" : ""}`}>{activity.follow_up_completed_at ? "Follow-up complete" : `Follow-up ${new Date(activity.follow_up_at).toLocaleString()}`}</span>}
        </article>)}
      </div>
    </section>
  );
}
