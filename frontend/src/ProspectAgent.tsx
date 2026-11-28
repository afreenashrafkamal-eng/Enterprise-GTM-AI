import { useEffect, useState } from "react";
import { API_URL, apiFetch } from "./api";
import ProspectDataSources from "./ProspectDataSources";
import ContactChannelActions from "./ContactChannelActions";

type Prospect = {
  company_name: string;
  fit_score: number;
  website: string;
  industry: string;
  location: string;
  why_fit: string;
  recent_signal: string;
  signal_type?: string;
  signal_date?: string;
  signal_source_url?: string;
  signal_confidence?: string;
  counter_signal: string;
  evidence_url: string;
  contact: {
    name: string;
    job_title: string;
    public_work_email: string;
    email_source_url: string;
    linkedin_url: string;
    contact_source_url: string;
  };
  email_subject: string;
  email_body: string;
  sources: { title: string; url: string }[];
};

type SenderStatus = { provider: string; connected: boolean; email: string | null };
type SearchLocation = { country: string; state_or_province: string; city: string; local_area: string };
type OrganizationSummary = { id: string; name: string };
type SavedCampaign = { id: string; prompt: string; summary: string; result_count: number; created_at: string };
type EmailHistoryItem = {
  id: string; sender_email: string; recipient_email: string; subject: string;
  email_source_url: string; status: "sent" | "failed" | "unknown"; failure_reason: string | null; created_at: string;
};

type Props = { organizationId: string; mode?: "prospecting" | "email"; onGoToProspecting?: () => void; initialPrompt?: string; onInitialPromptApplied?: () => void };
const RESULTS_PER_PAGE = 20;

const starterPrompt =
  "Find companies that may need the selected client's products or services. Use the client's saved profile and ideal-customer criteria. Look for current, verifiable buying signals, explain each company's fit and uncertainty, and identify the most relevant decision-maker.";

const blankLocation: SearchLocation = { country: "", state_or_province: "", city: "", local_area: "" };

function safeUrl(value: string | undefined) {
  return /^https?:\/\//i.test(value ?? "") ? value ?? "" : "";
}

function fullNameParts(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() ?? "", last_name: parts.join(" ") || null };
}

function errorDetail(data: unknown, status: number) {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return `The server returned ${status}.`;
}

export default function ProspectAgent({ organizationId, mode = "prospecting", onGoToProspecting, initialPrompt, onInitialPromptApplied }: Props) {
  const emailMode = mode === "email";
  const [prompt, setPrompt] = useState(starterPrompt);
  const [researching, setResearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [resultsPage, setResultsPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sendRequested, setSendRequested] = useState(false);
  const [emailSender, setEmailSender] = useState<SenderStatus>({ provider: "gmail", connected: false, email: null });
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState("");
  const [locations, setLocations] = useState<SearchLocation[]>([{ ...blankLocation }]);
  const [clientName, setClientName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [savedCampaigns, setSavedCampaigns] = useState<SavedCampaign[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [emailHistory, setEmailHistory] = useState<EmailHistoryItem[]>([]);

  useEffect(() => {
    if (!initialPrompt?.trim()) return;
    setPrompt(initialPrompt);
    onInitialPromptApplied?.();
  }, [initialPrompt]);

  useEffect(() => {
    let active = true;
    async function loadEmailSenderStatus() {
      try {
        const response = await apiFetch(`${API_URL}/auth/email/sender/status`);
        const data = (await response.json()) as SenderStatus;
        if (active && response.ok) setEmailSender(data);
      } catch {
        if (active) setEmailSender({ provider: "gmail", connected: false, email: null });
      }
    }
    if (new URLSearchParams(window.location.search).get("gmail_connected") === "1") {
      setNotice("Gmail connected for sending. The permission is stored securely and refreshed when Google allows it.");
    }
    if (new URLSearchParams(window.location.search).get("auth_error") === "gmail_connection_failed") {
      setError("Gmail could not be connected. Confirm the Google account has a verified email and retry.");
    }
    void loadEmailSenderStatus();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadClientName() {
      if (!organizationId.trim()) {
        setClientName("");
        return;
      }
      try {
        const response = await apiFetch(`${API_URL}/organizations`);
        const data = response.ok ? ((await response.json()) as OrganizationSummary[]) : [];
        const organization = data.find((item) => item.id === organizationId);
        if (active) setClientName(organization?.name ?? "Selected client");
      } catch {
        if (active) setClientName("Selected client");
      }
    }
    void loadClientName();
    return () => { active = false; };
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    async function loadEmailHistory() {
      if (!organizationId.trim()) {
        setEmailHistory([]);
        return;
      }
      try {
        const response = await apiFetch(
          `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/prospecting/emails/history`,
        );
        const data = await response.json().catch(() => []);
        if (response.ok && active) setEmailHistory(Array.isArray(data) ? data as EmailHistoryItem[] : []);
      } catch {
        if (active) setEmailHistory([]);
      }
    }
    void loadEmailHistory();
    return () => { active = false; };
  }, [organizationId]);

  async function refreshEmailHistory() {
    if (!organizationId.trim()) return;
    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/prospecting/emails/history`,
      );
      const data = await response.json().catch(() => []);
      if (response.ok) setEmailHistory(Array.isArray(data) ? data as EmailHistoryItem[] : []);
    } catch {
      // Keep sending feedback visible even if history refresh is unavailable.
    }
  }

  useEffect(() => {
    let active = true;
    async function loadCampaignHistory() {
      if (!organizationId.trim()) {
        setSavedCampaigns([]);
        return;
      }
      setHistoryLoading(true);
      try {
        const response = await apiFetch(
          `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/prospecting/campaigns`,
        );
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(errorDetail(data, response.status));
        if (active) setSavedCampaigns(Array.isArray(data) ? data as SavedCampaign[] : []);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load saved searches.");
      } finally {
        if (active) setHistoryLoading(false);
      }
    }
    setCampaignId("");
    setProspects([]);
    setResultsPage(1);
    setSummary("");
    setSelected(new Set());
    void loadCampaignHistory();
    return () => { active = false; };
  }, [organizationId]);

  async function refreshCampaignHistory() {
    if (!organizationId.trim()) return;
    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/prospecting/campaigns`,
      );
      const data = await response.json().catch(() => []);
      if (response.ok) setSavedCampaigns(Array.isArray(data) ? data as SavedCampaign[] : []);
    } catch {
      // Keep the just-completed research visible if history refresh is unavailable.
    }
  }

  async function openSavedCampaign(savedId: string) {
    if (!savedId) return;
    setHistoryLoading(true);
    setError("");
    setNotice("");
    setSendNotice("");
    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/prospecting/campaigns/${encodeURIComponent(savedId)}`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorDetail(data, response.status));
      setCampaignId(data.id);
      setPrompt(data.prompt ?? starterPrompt);
      const savedLocations = Array.isArray(data.search_locations) ? data.search_locations as SearchLocation[] : [];
      setLocations(savedLocations.length ? savedLocations : [{ ...blankLocation }]);
      setSummary(data.summary ?? "");
      setProspects(Array.isArray(data.prospects) ? data.prospects as Prospect[] : []);
      setResultsPage(1);
      setSelected(new Set(Array.isArray(data.selected_indices) ? data.selected_indices as number[] : []));
      setSendRequested(data.send_requested === true);
      setNotice("Saved search reopened. No new AI research was run.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this saved search.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function runResearch() {
    if (!organizationId.trim()) {
      setError("Load or create your workspace before researching prospects.");
      return;
    }
    setResearching(true);
    setError("");
    setNotice("");
    setSendNotice("");
    setProspects([]);
    setResultsPage(1);
    setSummary("");
    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/prospecting/research`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            search_locations: locations.filter((location) => Object.values(location).some((value) => value.trim())),
          }),
          signal: AbortSignal.timeout(90000),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorDetail(data, response.status));
      const results = Array.isArray(data.prospects) ? (data.prospects as Prospect[]) : [];
      setSummary(typeof data.summary === "string" ? data.summary : "");
      setProspects(results);
      setResultsPage(1);
      setCampaignId(typeof data.campaign_id === "string" ? data.campaign_id : "");
      setSelected(new Set(Array.isArray(data.selected_indices)
        ? data.selected_indices as number[]
        : results.flatMap((prospect, index) => prospect.fit_score >= 75 ? [index] : [])));
      setSendRequested(data.send_requested === true);
      if (!results.length) setNotice("The research did not find sufficiently supported prospects. Refine your prompt and try again.");
      else setNotice("Search saved for this client. Reopen it later without running AI research again.");
      void refreshCampaignHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prospect research could not be completed.");
    } finally {
      setResearching(false);
    }
  }

  function toggleSelected(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateDraft(index: number, field: "email_subject" | "email_body", value: string) {
    setProspects((current) => current.map((prospect, itemIndex) =>
      itemIndex === index ? { ...prospect, [field]: value } : prospect,
    ));
  }

  const pageCount = Math.max(1, Math.ceil(prospects.length / RESULTS_PER_PAGE));
  const visibleProspects = prospects
    .map((prospect, index) => ({ prospect, index }))
    .slice((resultsPage - 1) * RESULTS_PER_PAGE, resultsPage * RESULTS_PER_PAGE);
  const resultsPager = () => <nav className="prospect-results-pager" aria-label="Prospect result pages">
    <span>Showing {(resultsPage - 1) * RESULTS_PER_PAGE + 1}–{Math.min(resultsPage * RESULTS_PER_PAGE, prospects.length)} of {prospects.length}</span>
    <div>
      <button className="load-button" type="button" onClick={() => setResultsPage((page) => Math.max(1, page - 1))} disabled={resultsPage === 1}>Previous</button>
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <button
        className={page === resultsPage ? "apply-button" : "load-button"}
        type="button" key={page} onClick={() => setResultsPage(page)} aria-current={page === resultsPage ? "page" : undefined}
      >{page}</button>)}
      <button className="load-button" type="button" onClick={() => setResultsPage((page) => Math.min(pageCount, page + 1))} disabled={resultsPage === pageCount}>Next</button>
    </div>
  </nav>;

  async function saveCampaignChanges() {
    if (!campaignId || !organizationId.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/prospecting/campaigns/${encodeURIComponent(campaignId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prospects,
            selected_indices: [...selected].sort((a, b) => a - b),
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorDetail(data, response.status));
      setProspects(data.prospects as Prospect[]);
      setSelected(new Set(data.selected_indices as number[]));
      setNotice("Campaign changes saved. Reopening it will not run AI research.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save campaign changes.");
    } finally {
      setSaving(false);
    }
  }

  function connectGmail() {
    window.location.href = `${API_URL}/auth/google/gmail/connect`;
  }

  async function sendSelectedEmails() {
    if (!sendRequested || !emailSender.connected) return;
    const ready = [...selected]
      .map((index) => prospects[index])
      .filter((prospect) => prospect?.contact.public_work_email && safeUrl(prospect.contact.email_source_url)
        && prospect.email_subject.trim() && prospect.email_body.trim()
        && !/\[(first name|your name|your company|relevant buyer problem)\]/i.test(prospect.email_body));
    if (!ready.length) {
      setSendNotice("No selected prospect has a source-backed public work email and a completed draft yet.");
      return;
    }
    const recipients = ready.map((prospect, index) =>
      `${index + 1}. ${prospect.contact.public_work_email} — ${prospect.company_name}\n` +
      `Subject: ${prospect.email_subject}\n` +
      `Message:\n${prospect.email_body}\n` +
      `Email source: ${prospect.contact.email_source_url}`,
    ).join("\n\n");
    const confirmed = window.confirm(
      `Final review: send ${ready.length} email(s) from ${emailSender.email}?\n\n${recipients}\n\nChoose OK to send these exact messages now.`,
    );
    if (!confirmed) return;

    setSending(true);
    setSendNotice("");
    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/prospecting/emails/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approved: true,
            emails: ready.map((prospect) => ({
              recipient_email: prospect.contact.public_work_email,
              email_source_url: prospect.contact.email_source_url,
              subject: prospect.email_subject,
              body: prospect.email_body,
            })),
          }),
          signal: AbortSignal.timeout(60000),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorDetail(data, response.status));
      setSendNotice(data.message ?? `${data.sent_count ?? 0} email(s) sent.`);
      await refreshEmailHistory();
    } catch (caught) {
      setSendNotice(caught instanceof Error ? caught.message : "Email sending failed. Check your Gmail connection.");
      await refreshEmailHistory();
      if (caught instanceof Error && caught.message.toLowerCase().includes("connect gmail")) {
        setEmailSender({ provider: "gmail", connected: false, email: null });
      }
    } finally {
      setSending(false);
    }
  }

  async function saveSelected() {
    if (!organizationId.trim() || selected.size === 0) return;
    setSaving(true);
    setError("");
    setNotice("");
    let saved = 0;
    let skipped = 0;
    const failures: string[] = [];
    try {
      const listResponse = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts`,
      );
      const existing = listResponse.ok ? ((await listResponse.json()) as { company_name: string }[]) : [];
      if (!listResponse.ok) throw new Error(errorDetail(await listResponse.json().catch(() => ({})), listResponse.status));
      const knownNames = new Set(existing.map((account) => account.company_name.trim().toLowerCase()));

      for (const index of selected) {
        const prospect = prospects[index];
        if (!prospect) continue;
        const key = prospect.company_name.trim().toLowerCase();
        if (!key || knownNames.has(key)) {
          skipped += 1;
          continue;
        }
        const accountResponse = await apiFetch(
          `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              company_name: prospect.company_name,
              website: safeUrl(prospect.website) || null,
              industry: prospect.industry || null,
              location: prospect.location || null,
              notes: `AI research prospect. Recent signal: ${prospect.recent_signal}\nCounter-signal: ${prospect.counter_signal}`,
              outreach_reason: prospect.why_fit,
              evidence_url: safeUrl(prospect.evidence_url) || safeUrl(prospect.sources[0]?.url ?? "") || null,
            }),
          },
        );
        const account = await accountResponse.json().catch(() => ({}));
        if (!accountResponse.ok) {
          failures.push(`${prospect.company_name}: ${errorDetail(account, accountResponse.status)}`);
          continue;
        }
        knownNames.add(key);
        saved += 1;

        const contact = prospect.contact;
        const names = fullNameParts(contact.name);
        if (names.first_name) {
          const contactResponse = await apiFetch(
            `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts/${encodeURIComponent(account.id)}/contacts`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...names,
                job_title: contact.job_title || null,
                email: contact.public_work_email || null,
                linkedin_url: safeUrl(contact.linkedin_url) || null,
                source_url: safeUrl(contact.contact_source_url) || safeUrl(contact.email_source_url) || null,
              }),
            },
          );
          if (!contactResponse.ok) failures.push(`${prospect.company_name} contact: ${errorDetail(await contactResponse.json().catch(() => ({})), contactResponse.status)}`);
        }
      }
      setNotice(`${saved} prospect${saved === 1 ? "" : "s"} saved to Target companies${skipped ? `; ${skipped} already existed and were skipped` : ""}. Email addresses remain unverified. Review the account evidence and email drafts before use.`);
      if (failures.length) setError(failures.join(" "));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the selected prospects.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`form-card prospect-agent ${emailMode ? "email-workspace" : ""}`} id={emailMode ? "email-automation" : "prospect-agent"}>
      <div className="card-heading">
        <div>
          <span className="research-kicker">{emailMode ? "PERSONALIZED OUTREACH" : "PROMPT-LED WORKFLOW"}</span>
          <h2>{emailMode ? "Email automation" : "AI prospecting agent"}</h2>
          <p>{emailMode ? "Review researched drafts, choose a sender, and approve each message before it goes out." : "Describe what you are building and who you want to reach. The agent researches suitable companies, likely decision-makers, and public contact details."}</p>
        </div>
        {emailMode && <span className="draft-badge">REVIEW BEFORE SENDING</span>}
      </div>

      {!emailMode && <>
      <label className="prospect-prompt-label" htmlFor="prospect-prompt">What should the agent find?</label>
      <div className="saved-search-row">
        <label htmlFor="saved-searches">Saved searches for {clientName || "this client"}</label>
        <select id="saved-searches" value={campaignId} onChange={(event) => void openSavedCampaign(event.target.value)} disabled={historyLoading || savedCampaigns.length === 0}>
          <option value="">{historyLoading ? "Loading saved searches…" : savedCampaigns.length ? "Choose a saved search to reopen" : "No saved searches yet"}</option>
          {savedCampaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {new Date(campaign.created_at).toLocaleString()} · {campaign.prompt.slice(0, 75)}
            </option>
          ))}
        </select>
      </div>
      <div className="client-context-note">
        <strong>Researching for: {clientName || "the selected client"}</strong>
        <span>The agent uses this client’s saved offer and ideal-customer profile. Locations below apply to this search only.</span>
      </div>
      <ProspectDataSources organizationId={organizationId} />
      <section className="data-source-status" aria-label="Prospecting data sources">
        <div className="data-source-heading"><div><strong>Research and contact-data sources</strong><span>See what the agent uses now and which connections are still future options.</span></div><span className="research-kicker">SOURCE STATUS</span></div>
        <div className="data-source-grid">
          <div className="data-source-item active"><span className="data-source-state">In use</span><strong>OpenAI web search</strong><small>Finds public company pages, news, and evidence. It is not a private contact database.</small></div>
          <div className="data-source-item"><span className="data-source-state">Setup available above</span><strong>Apollo · Lusha · ZoomInfo</strong><small>Save provider access per workspace. These credentials are not yet used by AI searches.</small></div>
          <div className="data-source-item"><span className="data-source-state">Manual research</span><strong>LinkedIn Sales Navigator</strong><small>Use it to verify people manually. This app does not scrape or automate LinkedIn.</small></div>
          <div className="data-source-item"><span className="data-source-state">Open-source option</span><strong>Crawl4AI</strong><small>Could collect public pages locally; it does not supply a ready-made people database or verified emails.</small></div>
        </div>
        <p>For client-facing use, a commercial data provider must explicitly allow its data to be shown through this product. We’ll connect a vendor only after its plan and terms permit that use.</p>
      </section>
      <textarea
        id="prospect-prompt"
        className="prospect-prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={5}
        maxLength={5000}
      />
      <div className="search-location-section">
        <div className="search-location-heading">
          <div><strong>Where should it search?</strong><span>Optional. Enter only the detail you know; country, state/province, city, and local area are all supported.</span></div>
          <button type="button" className="load-button" onClick={() => setLocations((current) => [...current, { ...blankLocation }])} disabled={locations.length >= 12}>Add location</button>
        </div>
        {locations.map((location, index) => (
          <div className="search-location-row" key={index}>
            <input aria-label={`Country for location ${index + 1}`} placeholder="Country" value={location.country} onChange={(event) => setLocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, country: event.target.value } : item))} />
            <input aria-label={`State or province for location ${index + 1}`} placeholder="State / province (optional)" value={location.state_or_province} onChange={(event) => setLocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, state_or_province: event.target.value } : item))} />
            <input aria-label={`City for location ${index + 1}`} placeholder="City (optional)" value={location.city} onChange={(event) => setLocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, city: event.target.value } : item))} />
            <input aria-label={`Local area for location ${index + 1}`} placeholder="Local area / metro (optional)" value={location.local_area} onChange={(event) => setLocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, local_area: event.target.value } : item))} />
            {locations.length > 1 && <button type="button" className="remove-location" aria-label={`Remove location ${index + 1}`} onClick={() => setLocations((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}
          </div>
        ))}
      </div>
      <p className="research-disclosure">Your prompt is sent to OpenAI for web research and may use API credits. Nothing is sent until you review the exact recipients and confirm. The agent will not guess missing email addresses.</p>
      <p className="research-disclosure">A search can return up to 100 supported prospects, shown 20 per page (five pages at 100). The agent may return fewer when it cannot find enough reliable evidence.</p>
      <button className="research-button" type="button" onClick={() => void runResearch()} disabled={researching || !prompt.trim()}>
        {researching ? "Researching companies and decision-makers…" : "Find prospects with AI"}
        {!researching && <span>✧</span>}
      </button>
      </>}

      {error && <div className="research-error" role="alert">{error}</div>}
      {notice && <div className="prospect-notice" role="status">{notice}</div>}
      {emailMode && emailHistory.length > 0 && (
        <section className="email-history" aria-label={`Email history for ${clientName || "this client"}`}>
          <div className="email-history-heading"><strong>Recent email activity · {clientName || "this client"}</strong><span>Up to 100 messages</span></div>
          {emailHistory.map((item) => (
            <div className="email-history-row" key={item.id}>
              <span className={`email-history-status ${item.status}`}>{item.status === "sent" ? "Sent" : item.status === "unknown" ? "Check before retry" : "Failed"}</span>
              <span><b>{item.recipient_email}</b><small>{item.subject}</small></span>
              <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              {item.failure_reason && <small className="email-history-note">{item.failure_reason}</small>}
            </div>
          ))}
        </section>
      )}
      {emailMode && prospects.length === 0 && (
        <div className="email-empty-state">
          <span className="workspace-launch-icon">✉</span>
          <div><strong>No researched email drafts are open yet</strong><p>Run a new prospect search or reopen a saved search. Its researched contacts and personalized drafts will appear here for review.</p></div>
          <button className="apply-button" type="button" onClick={onGoToProspecting}>Go to AI prospecting</button>
        </div>
      )}
      {emailHistory.length > 0 && (
        !emailMode &&
        <section className="email-history" aria-label={`Email history for ${clientName || "this client"}`}>
          <div className="email-history-heading"><strong>Recent email activity · {clientName || "this client"}</strong><span>Up to 100 messages</span></div>
          {emailHistory.map((item) => (
            <div className="email-history-row" key={item.id}>
              <span className={`email-history-status ${item.status}`}>{item.status === "sent" ? "Sent" : item.status === "unknown" ? "Check before retry" : "Failed"}</span>
              <span><b>{item.recipient_email}</b><small>{item.subject}</small></span>
              <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              {safeUrl(item.email_source_url) && <a href={safeUrl(item.email_source_url)} target="_blank" rel="noreferrer">Email source</a>}
              {item.failure_reason && <small className="email-history-note">{item.failure_reason}</small>}
            </div>
          ))}
        </section>
      )}
      {prospects.length > 0 && (
        <div className="prospect-results" aria-live="polite">
          <div className="prospect-results-heading">
            <div><span className="research-kicker">RESEARCH COMPLETE</span><h3>Review suggested prospects</h3></div>
            {!emailMode && <div className="prospect-result-actions">
              <button className="load-button" type="button" onClick={() => void saveCampaignChanges()} disabled={saving || !campaignId}>
                {saving ? "Saving…" : "Save search changes"}
              </button>
              <button className="apply-button" type="button" onClick={() => void saveSelected()} disabled={saving || selected.size === 0}>
                {saving ? "Saving…" : `Save ${selected.size} to client`}
              </button>
            </div>}
          </div>
          {!emailMode && summary && <p className="research-summary">{summary}</p>}
          {resultsPager()}
          {visibleProspects.map(({ prospect, index }) => (
            <div key={`${prospect.company_name}-${index}`}>
            {!emailMode && prospect.fit_score >= 75 && index === 0 && <h4 className="prospect-group-heading">Strong matches</h4>}
            {!emailMode && prospect.fit_score < 75 && (index === 0 || prospects[index - 1]?.fit_score >= 75) && <h4 className="prospect-group-heading">More candidates to review</h4>}
            <article className="prospect-card">
              <div className="prospect-card-topline">
              <label className="prospect-select">
                <input type="checkbox" checked={selected.has(index)} onChange={() => toggleSelected(index)} />
                <span><strong>{prospect.company_name || "Company name not found"}</strong><small>{prospect.industry}{prospect.location ? ` · ${prospect.location}` : ""}</small></span>
              </label>
              <span className={`fit-score ${prospect.fit_score >= 75 ? "strong" : "potential"}`}>{prospect.fit_score >= 75 ? "Strong match" : "More to review"} · {prospect.fit_score}/100</span>
              </div>
              {safeUrl(prospect.website) && <a href={safeUrl(prospect.website)} target="_blank" rel="noreferrer">Company website</a>}
              {!emailMode && <div className="prospect-evidence">
                <strong>Why it may fit</strong><p>{prospect.why_fit}</p>
                <strong>Recent public signal</strong><p>{prospect.recent_signal || "No supported signal found."}</p>
                <div className="signal-details">
                  <span><b>Signal type</b>{prospect.signal_type || "Not recorded in this search"}</span>
                  <span><b>Date in source</b>{prospect.signal_date || "Not stated"}</span>
                  <span><b>Evidence strength</b>{prospect.signal_confidence || "Not assessed in this search"}</span>
                </div>
                {safeUrl(prospect.signal_source_url) && <a className="signal-source-link" href={safeUrl(prospect.signal_source_url)} target="_blank" rel="noreferrer">Open signal source</a>}
                <strong>Counter-signal / uncertainty</strong><p>{prospect.counter_signal || "No counter-signal found; verify before outreach."}</p>
              </div>}
              {!emailMode && <div className="prospect-contact">
                <strong>Suggested decision-maker</strong>
                <div className="contact-name-row"><p>{prospect.contact.name || "No reliably sourced name found"}{prospect.contact.job_title ? ` · ${prospect.contact.job_title}` : ""}</p><ContactChannelActions email={prospect.contact.public_work_email} emailStatus="not_checked" linkedinUrl={safeUrl(prospect.contact.linkedin_url)} /></div>
                {prospect.contact.public_work_email ? <p>Public work email: <a href={`mailto:${prospect.contact.public_work_email}`}>{prospect.contact.public_work_email}</a> <span className="unverified-label">Not verified</span></p> : <p>No public work email found. No address was guessed.</p>}
                {safeUrl(prospect.contact.linkedin_url) && <p><a href={safeUrl(prospect.contact.linkedin_url)} target="_blank" rel="noreferrer">LinkedIn profile</a></p>}
                {safeUrl(prospect.contact.contact_source_url) && <p><a href={safeUrl(prospect.contact.contact_source_url)} target="_blank" rel="noreferrer">Contact evidence</a></p>}
              </div>}
              {emailMode && <div className="prospect-contact email-recipient-summary"><strong>Recipient</strong><div className="contact-name-row"><p>{prospect.contact.name || "No verified contact name"}{prospect.contact.job_title ? ` · ${prospect.contact.job_title}` : ""}</p><ContactChannelActions email={prospect.contact.public_work_email} emailStatus="not_checked" linkedinUrl={safeUrl(prospect.contact.linkedin_url)} /></div><p>{prospect.contact.public_work_email || "No public work email found; this contact cannot be sent an email."}</p><small>Contact details and address still need human verification.</small></div>}
              {emailMode && <div className="prospect-email">
                <strong>Editable email draft</strong>
                <input aria-label={`Email subject for ${prospect.company_name}`} value={prospect.email_subject} onChange={(event) => updateDraft(index, "email_subject", event.target.value)} />
                <textarea aria-label={`Email draft for ${prospect.company_name}`} value={prospect.email_body} onChange={(event) => updateDraft(index, "email_body", event.target.value)} rows={7} />
                <small>Personalize the sender details and verify every claim before approving a Gmail send.</small>
              </div>}
              {!emailMode && prospect.sources.length > 0 && <div className="source-list"><strong>Research sources</strong>{prospect.sources.filter((source) => safeUrl(source.url)).map((source) => <a key={source.url} href={safeUrl(source.url)} target="_blank" rel="noreferrer">{source.title || source.url}</a>)}</div>}
            </article>
            </div>
          ))}
          {pageCount > 1 && resultsPager()}
          {(sendRequested || emailMode) && (
            <section className="gmail-send-panel" aria-live="polite">
              <div>
                <strong>{sendRequested ? "Email sending is enabled for this search." : "Set up reviewed email sending"}</strong>
                <p>{!sendRequested ? "Nothing is sent automatically. Enable sending to connect the sender and review selected, eligible emails." : emailSender.provider === "smtp"
                  ? "The configured domain mailbox is ready. You will review recipients and message text and confirm each send here."
                  : "Connect the Gmail account you want to send from. The app requests send-only access; it does not read your inbox. You will review recipients and message text and confirm the send here."}</p>
              </div>
              {!sendRequested ? (
                <button className="apply-button" type="button" onClick={() => setSendRequested(true)}>Set up email sending</button>
              ) : emailSender.connected ? (
                <div className="gmail-connected-row">
                  <span>{emailSender.provider === "smtp" ? "Configured mailbox:" : "Connected:"} {emailSender.email}</span>
                  <button className="load-button" type="button" onClick={() => void sendSelectedEmails()} disabled={sending || selected.size === 0}>
                    {sending ? "Sending…" : `Review and send selected`}
                  </button>
                </div>
              ) : (
                emailSender.provider === "gmail"
                  ? <button className="apply-button" type="button" onClick={connectGmail}>Connect Gmail for sending</button>
                  : <p className="target-account-empty">The selected mail provider is not configured. Set its details in the private project environment.</p>
              )}
              <small>Only selected contacts with a publicly sourced email and a completed draft can be sent. Each message requires your confirmation. {emailSender.provider === "gmail" ? "Google send-only access is used; the app does not read your inbox." : "The configured SMTP mailbox sends messages; keep its password private in the project environment."}</small>
              {sendNotice && <div className="prospect-notice" role="status">{sendNotice}</div>}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
