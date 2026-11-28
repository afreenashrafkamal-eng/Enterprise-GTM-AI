import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, API_URL } from "./api";
import ContactChannelActions from "./ContactChannelActions";

type StrategyFields = {
  target_segment: string;
  account_prioritization: string;
  buyer_and_problem: string;
  value_message: string;
  channels_and_timing: string;
  success_measures: string;
  guardrails: string;
};

type PilotTouch = {
  day: string;
  channel: "Email" | "LinkedIn";
  purpose: string;
};

type PilotMessageDraft = {
  account_id: string;
  contact_id: string | null;
  subject: string;
  body: string;
  evidence_url: string;
  reviewed: boolean;
};

type PilotContact = {
  id: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  email_status: "not_checked" | "verified" | "invalid";
  qualification_status: "new" | "qualified" | "disqualified";
  do_not_contact: boolean;
};

type SourceData = {
  company?: {
    company_description?: string | null;
    products_services?: string | null;
    target_market?: string | null;
  };
  icp?: {
    industries?: string | null;
    employee_range?: string | null;
    revenue_range?: string | null;
    geographic_focus?: string | null;
    buyer_titles?: string | null;
    pain_points?: string | null;
    excluded_segments?: string | null;
  };
};

type PriorityAccount = {
  id: string;
  company_name: string;
  industry: string | null;
  location: string | null;
  outreach_reason: string | null;
  evidence_url: string | null;
  qualification_status: "new" | "qualified" | "disqualified";
  contact_count: number;
  qualified_contact_count: number;
  verified_email_count: number;
};

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

const emptyStrategy: StrategyFields = {
  target_segment: "",
  account_prioritization: "",
  buyer_and_problem: "",
  value_message: "",
  channels_and_timing: "",
  success_measures: "",
  guardrails: "",
};

const starterPilotGoal =
  "Run a small, human-reviewed pilot with ICP-qualified accounts to learn which buyer problems and messages earn useful replies.";

const starterPilotTouches: PilotTouch[] = [
  {
    day: "Day 1",
    channel: "Email",
    purpose:
      "Open with a reviewed company-level fact and one problem relevant to this buyer. Ask one clear question.",
  },
  {
    day: "Day 3",
    channel: "LinkedIn",
    purpose:
      "Use a relevant public business observation only if it supports the conversation; otherwise skip this touch.",
  },
  {
    day: "Day 6",
    channel: "Email",
    purpose:
      "Share one useful, relevant insight and ask whether the problem is a priority.",
  },
  {
    day: "Day 10",
    channel: "Email",
    purpose:
      "Send a brief close-the-loop note. Stop if the contact opts out or is not a fit.",
  },
];

function joinValues(values: (string | null | undefined)[]) {
  return values.map((value) => value?.trim()).filter(Boolean).join("\n");
}

function makeStarterStrategy({ company, icp }: SourceData): StrategyFields {
  const targetDetails = joinValues([
    icp?.industries ? `Industries: ${icp.industries}` : null,
    icp?.employee_range ? `Company size: ${icp.employee_range}` : null,
    icp?.revenue_range ? `Revenue: ${icp.revenue_range}` : null,
    icp?.geographic_focus ? `Geography: ${icp.geographic_focus}` : null,
    icp?.excluded_segments ? `Exclude: ${icp.excluded_segments}` : null,
  ]);
  const offer = joinValues([
    company?.products_services,
    company?.company_description,
  ]);

  return {
    target_segment: targetDetails || icp?.industries?.trim() ||
      "Add target industries, company size, and geography to the ideal customer profile.",
    account_prioritization:
      "Start with companies marked Qualified for ICP fit. Before outreach, confirm a current, relevant reason to contact each account. ICP fit alone does not establish buying intent.",
    buyer_and_problem: joinValues([
      icp?.buyer_titles ? `Buyer roles: ${icp.buyer_titles}` : null,
      icp?.pain_points ? `Problems to address: ${icp.pain_points}` : null,
    ]) || "Add buyer roles and customer problems to the ideal customer profile.",
    value_message: offer
      ? `Use this saved offer as the starting point, then connect it to one specific buyer problem:\n${offer}`
      : company?.target_market?.trim() ||
        "Add your product or service and the customer outcome it supports to the company profile.",
    channels_and_timing:
      "Start with a small, personalized sequence across appropriate business channels: Day 1 email, Day 3 LinkedIn touch, Day 6 follow-up with a different useful point, and Day 10 close-the-loop note. Review each touch before using it.",
    success_measures:
      "Track target accounts reached, valid contacts, replies, positive replies, meetings booked, and conversion by segment and buyer role. Establish a baseline before setting numeric goals.",
    guardrails:
      "Keep claims tied to reviewed facts. Verify account and contact details before use, honor opt-outs and suppression lists, and do not describe an account as interested based only on ICP fit.",
  };
}

async function readOptionalJson(url: string) {
  const response = await apiFetch(url);
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail ?? `The server returned ${response.status}.`);
  }
  return data;
}

type Props = { organizationId: string };

export default function OutboundStrategySection({ organizationId }: Props) {
  const [strategy, setStrategy] = useState<StrategyFields>(emptyStrategy);
  const [priorityAccounts, setPriorityAccounts] = useState<PriorityAccount[]>([]);
  const [pilotGoal, setPilotGoal] = useState(starterPilotGoal);
  const [pilotAccountIds, setPilotAccountIds] = useState<string[]>([]);
  const [pilotTouches, setPilotTouches] = useState<PilotTouch[]>(starterPilotTouches);
  const [pilotMessageDrafts, setPilotMessageDrafts] = useState<PilotMessageDraft[]>([]);
  const [pilotContacts, setPilotContacts] = useState<Record<string, PilotContact[]>>({});
  const [sourceData, setSourceData] = useState<SourceData>({});
  const [draftNotice, setDraftNotice] = useState("");
  const [hasSavedStrategy, setHasSavedStrategy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading your outbound strategy…");

  const loadStrategy = useCallback(async () => {
    if (!organizationId.trim()) {
      setStrategy(emptyStrategy);
      setHasSavedStrategy(false);
      setMessage("Create or load a workspace before building an outbound strategy.");
      return;
    }

    setLoading(true);
    setMessage("Loading your company profile, ideal customer, and strategy…");

    try {
      const base = `${API_URL}/organizations/${organizationId.trim()}`;
      const [savedStrategy, company, icp, priorities] = await Promise.all([
        readOptionalJson(`${base}/outbound-strategy`),
        readOptionalJson(`${base}/company-profile`),
        readOptionalJson(`${base}/ideal-customer-profile`),
        readOptionalJson(`${base}/outbound-priorities`),
      ]);

      setPriorityAccounts(
        Array.isArray(priorities) ? (priorities as PriorityAccount[]) : [],
      );
      setSourceData({ company: company ?? undefined, icp: icp ?? undefined });

      if (savedStrategy) {
        setStrategy({
          target_segment: savedStrategy.target_segment ?? "",
          account_prioritization: savedStrategy.account_prioritization ?? "",
          buyer_and_problem: savedStrategy.buyer_and_problem ?? "",
          value_message: savedStrategy.value_message ?? "",
          channels_and_timing: savedStrategy.channels_and_timing ?? "",
          success_measures: savedStrategy.success_measures ?? "",
          guardrails: savedStrategy.guardrails ?? "",
        });
        setPilotGoal(savedStrategy.pilot_goal ?? starterPilotGoal);
        const eligibleAccountIds = new Set(
          (Array.isArray(priorities) ? priorities as PriorityAccount[] : [])
            .filter((account) => account.qualification_status === "qualified")
            .map((account) => account.id),
        );
        setPilotAccountIds(
          (Array.isArray(savedStrategy.pilot_account_ids)
            ? savedStrategy.pilot_account_ids
            : []).filter((id: string) => eligibleAccountIds.has(id)).slice(0, 5),
        );
        setPilotTouches(
          Array.isArray(savedStrategy.pilot_touches) && savedStrategy.pilot_touches.length > 0
            ? savedStrategy.pilot_touches
            : starterPilotTouches,
        );
        setPilotMessageDrafts(
          (Array.isArray(savedStrategy.pilot_message_drafts)
            ? savedStrategy.pilot_message_drafts
            : [])
            .filter((draft: PilotMessageDraft) => eligibleAccountIds.has(draft.account_id))
            .map((draft: PilotMessageDraft) => ({
              ...draft,
              evidence_url: typeof draft.evidence_url === "string" ? draft.evidence_url : "",
              reviewed: draft.reviewed === true &&
                isHttpUrl(draft.evidence_url) &&
                !/\[[^\]]+\]/.test(`${draft.subject}\n${draft.body}`),
            })),
        );
        setHasSavedStrategy(true);
        setMessage("Saved outbound strategy loaded.");
      } else {
        setStrategy(makeStarterStrategy({ company, icp }));
        setPilotGoal(starterPilotGoal);
        setPilotAccountIds([]);
        setPilotTouches(starterPilotTouches);
        setPilotMessageDrafts([]);
        setHasSavedStrategy(false);
        setMessage(
          "Starter draft prepared from your saved company profile and ideal customer profile. Review it before saving.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not load the strategy. ${error.message}`
          : "Could not reach the workspace backend.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadStrategy();
  }, [loadStrategy]);

  useEffect(() => {
    let active = true;

    async function loadPilotContacts() {
      if (!organizationId.trim() || pilotAccountIds.length === 0) {
        setPilotContacts({});
        return;
      }

      const loaded = await Promise.all(
        pilotAccountIds.map(async (accountId) => {
          try {
            const data = await readOptionalJson(
              `${API_URL}/organizations/${organizationId.trim()}/target-accounts/${accountId}/contacts`,
            );
            return [accountId, Array.isArray(data) ? data as PilotContact[] : []] as const;
          } catch {
            return [accountId, []] as const;
          }
        }),
      );

      if (active) {
        const contactMap: Record<string, PilotContact[]> = Object.fromEntries(loaded);
        setPilotContacts(contactMap);
        setPilotMessageDrafts((current) =>
          current.map((draft) =>
            draft.contact_id &&
            !contactMap[draft.account_id]?.some(
              (contact) =>
                contact.id === draft.contact_id &&
                contact.qualification_status === "qualified",
            )
              ? { ...draft, contact_id: null, reviewed: false }
              : draft,
          ),
        );
      }
    }

    void loadPilotContacts();
    return () => {
      active = false;
    };
  }, [organizationId, pilotAccountIds]);

  function updateField(field: keyof StrategyFields, value: string) {
    setStrategy((current) => ({ ...current, [field]: value }));
  }

  async function persistStrategy() {
    if (!organizationId.trim()) {
      setMessage("Create or load a workspace before saving this strategy.");
      return;
    }

    setSaving(true);
    setMessage("Saving your outbound strategy…");

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${organizationId.trim()}/outbound-strategy`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...strategy,
            pilot_goal: pilotGoal,
            pilot_account_ids: pilotAccountIds,
            pilot_touches: pilotTouches,
            pilot_message_drafts: pilotMessageDrafts,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }
      setHasSavedStrategy(true);
      setMessage("Outbound strategy saved for this organization.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not save the strategy. ${error.message}`
          : "Could not save the strategy. Check the backend connection.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveStrategy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistStrategy();
  }

  function togglePilotAccount(accountId: string, checked: boolean) {
    if (!checked) {
      setPilotAccountIds((current) => current.filter((id) => id !== accountId));
      setPilotMessageDrafts((drafts) =>
        drafts.filter((draft) => draft.account_id !== accountId),
      );
      return;
    }

    setPilotAccountIds((current) => {
      if (current.includes(accountId) || current.length >= 5) return current;
      return [...current, accountId];
    });
  }

  function updatePilotTouch(index: number, field: keyof PilotTouch, value: string) {
    setPilotTouches((current) =>
      current.map((touch, touchIndex) =>
        touchIndex === index ? { ...touch, [field]: value } : touch,
      ),
    );
  }

  function prepareMessageDraft(accountId: string) {
    const account = priorityAccounts.find((item) => item.id === accountId);
    if (!account) return;
    const contacts = pilotContacts[accountId] ?? [];
    const contact = contacts.find((item) => item.qualification_status === "qualified");
    const offerDetails =
      sourceData.company?.products_services?.trim() ||
      sourceData.company?.company_description?.trim() ||
      "";
    const sentenceEnd = offerDetails.search(/[.!?](?:\s|$)/);
    const offer = (sentenceEnd >= 0 ? offerDetails.slice(0, sentenceEnd) : offerDetails.slice(0, 180))
      .trim()
      .replace(/[.!?]+$/, "");
    const salutation = contact?.first_name ?? "[First name]";
    const accountReason = account.outreach_reason?.trim();
    const draft: PilotMessageDraft = {
      account_id: accountId,
      contact_id: contact?.id ?? null,
      subject: `A question for ${contact?.first_name ?? account.company_name}`,
      evidence_url: account.evidence_url ?? "",
      body: [
        `Hi ${salutation},`,
        "",
        `I'm with [Your company]. We provide ${offer || "[Briefly describe your offer and customer outcome]"}.`,
        "",
        accountReason || `[Add one current, reviewed reason for contacting ${account.company_name}.]`,
        "",
        "Would a short conversation about [relevant buyer problem] be useful?",
        "",
        "Best,",
        "[Your name]",
      ].join("\n"),
      reviewed: false,
    };
    setPilotMessageDrafts((current) => [
      ...current.filter((item) => item.account_id !== accountId),
      draft,
    ]);
    setDraftNotice("Draft prepared from saved workspace details. Review every bracketed item.");
  }

  function updateMessageDraft(
    accountId: string,
    field: "contact_id" | "subject" | "body" | "evidence_url",
    value: string | null,
  ) {
    setPilotMessageDrafts((current) =>
      current.map((draft) =>
        draft.account_id === accountId
          ? { ...draft, [field]: value, reviewed: false }
          : draft,
      ),
    );
  }

  function markMessageDraftReviewed(accountId: string) {
    setPilotMessageDrafts((current) =>
      current.map((draft) =>
        draft.account_id === accountId ? { ...draft, reviewed: true } : draft,
      ),
    );
    setDraftNotice("Draft marked reviewed. Any later edit will require another review.");
  }

  function hasDraftPlaceholders(draft: PilotMessageDraft) {
    return /\[[^\]]+\]/.test(`${draft.subject}\n${draft.body}`);
  }

  function hasDraftEvidence(draft: PilotMessageDraft) {
    return isHttpUrl(draft.evidence_url.trim());
  }

  function removeMessageDraft(accountId: string) {
    setPilotMessageDrafts((current) =>
      current.filter((draft) => draft.account_id !== accountId),
    );
  }

  const fields: { key: keyof StrategyFields; label: string; rows: number }[] = [
    { key: "target_segment", label: "Who to target", rows: 4 },
    { key: "account_prioritization", label: "Which accounts come first", rows: 4 },
    { key: "buyer_and_problem", label: "Buyer roles and problems", rows: 4 },
    { key: "value_message", label: "Value message to test", rows: 4 },
    { key: "channels_and_timing", label: "Channels and timing", rows: 4 },
    { key: "success_measures", label: "How to measure progress", rows: 4 },
    { key: "guardrails", label: "Review rules", rows: 3 },
  ];

  return (
    <section id="outbound-strategy" className="form-card outbound-strategy-card">
      <div className="card-heading">
        <div>
          <h2>Account-based marketing plan</h2>
          <p>
            Turn your saved company profile and ideal customer details into a
            focused, reviewable plan.
          </p>
        </div>
        <span className="draft-badge">
          {hasSavedStrategy ? "SAVED STRATEGY" : "WORKING DRAFT"}
        </span>
      </div>

      <div className="strategy-intro">
        This is a starting plan, not a market prediction. Review the assumptions
        with your team. Saving it does not send messages or contact anyone.
      </div>

      <form onSubmit={saveStrategy}>
        <div className="form-grid strategy-grid">
          {fields.map(({ key, label, rows }) => (
            <div className="field full-width" key={key}>
              <label htmlFor={`strategy-${key}`}>{label}</label>
              <textarea
                id={`strategy-${key}`}
                rows={rows}
                value={strategy[key]}
                onChange={(event) => updateField(key, event.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="form-footer">
          <p className="notice" role="status" aria-live="polite">
            {loading ? "Loading… " : ""}{message}
          </p>
          <div className="strategy-actions">
            <button
              className="load-button"
              type="button"
              onClick={() => void loadStrategy()}
              disabled={loading || saving}
            >
              Reload
            </button>
            <button className="save-button" type="submit" disabled={saving || loading}>
              {saving ? "Saving…" : "Save strategy"}
              {!saving && <span>→</span>}
            </button>
          </div>
        </div>
      </form>

      <div className="outbound-priority">
        <div className="priority-heading">
          <div>
            <h3>Account readiness review</h3>
            <p>
              Accounts are grouped by their saved ICP-fit status. Contact and
              email counts reflect records in this workspace only.
            </p>
          </div>
          <button
            className="load-button priority-refresh"
            type="button"
            onClick={() => void loadStrategy()}
            disabled={loading || saving}
          >
            Refresh list
          </button>
        </div>

        <div className="priority-summary" aria-label="Target list summary">
          <div>
            <strong>{priorityAccounts.length}</strong>
            <span>target companies</span>
          </div>
          <div>
            <strong>
              {priorityAccounts.filter((account) => account.qualification_status === "qualified").length}
            </strong>
            <span>qualified for ICP fit</span>
          </div>
          <div>
            <strong>
              {priorityAccounts.reduce((total, account) => total + account.contact_count, 0)}
            </strong>
            <span>contacts on file</span>
          </div>
          <div>
            <strong>
              {priorityAccounts.reduce((total, account) => total + account.verified_email_count, 0)}
            </strong>
            <span>emails marked verified</span>
          </div>
        </div>

        {priorityAccounts.length === 0 ? (
          <p className="priority-empty">
            Add target companies to your account list to see where to start.
          </p>
        ) : (
          <div className="priority-table-wrap">
            <table className="priority-table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">ICP fit</th>
                  <th scope="col">Contacts</th>
                  <th scope="col">Emails marked verified</th>
                  <th scope="col">Suggested next step</th>
                  <th scope="col">Pilot</th>
                </tr>
              </thead>
              <tbody>
                {priorityAccounts.map((account) => {
                  const nextStep =
                    account.qualification_status === "disqualified"
                      ? "Keep out of the pilot"
                      : account.qualification_status === "new"
                        ? "Review ICP fit"
                        : account.contact_count === 0
                          ? "Add a buyer contact"
                            : account.qualified_contact_count === 0
                              ? "Review buyer role fit"
                            : !account.outreach_reason || !account.evidence_url
                              ? "Add a sourced account reason"
                              : account.verified_email_count === 0
                                ? "Review contact details"
                                : "Review the account-specific message";

                  return (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.company_name}</strong>
                        <span>{[account.industry, account.location].filter(Boolean).join(" · ") || "Details not added"}</span>
                        <span>{account.outreach_reason ? `Reason: ${account.outreach_reason}` : "Account-specific reason not recorded"}</span>
                        {account.evidence_url && (
                          <a href={account.evidence_url} target="_blank" rel="noreferrer">View reason source</a>
                        )}
                      </td>
                      <td>
                        <span className={`priority-status ${account.qualification_status}`}>
                          {account.qualification_status === "qualified"
                            ? "Qualified"
                            : account.qualification_status === "disqualified"
                              ? "Excluded"
                              : "Needs review"}
                        </span>
                      </td>
                      <td>
                        {account.contact_count}
                        <span className="priority-count-detail">
                          {account.qualified_contact_count} qualified
                        </span>
                      </td>
                      <td>{account.verified_email_count}</td>
                      <td>{nextStep}</td>
                      <td>
                        <input
                          aria-label={`Include ${account.company_name} in the pilot plan`}
                          className="pilot-account-checkbox"
                          type="checkbox"
                          checked={pilotAccountIds.includes(account.id)}
                          disabled={
                            account.qualification_status !== "qualified" ||
                            (!pilotAccountIds.includes(account.id) && pilotAccountIds.length >= 5)
                          }
                          onChange={(event) =>
                            togglePilotAccount(account.id, event.target.checked)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="priority-disclosure">
          “Qualified” means ICP fit was recorded in this workspace. It is not
          evidence of buying intent, a verified relationship, or permission to
          contact.
        </p>
      </div>

      <div className="pilot-plan">
        <div className="priority-heading">
          <div>
            <h3>Pilot campaign plan</h3>
            <p>
              Outline a small manual pilot. Select up to five qualified-fit
              accounts above and adjust the touchpoints before saving.
            </p>
          </div>
          <span className="draft-badge">
            {pilotAccountIds.length} OF 5 ACCOUNTS
          </span>
        </div>

        <div className="pilot-form">
          <div className="field full-width">
            <label htmlFor="pilot-goal">What should this pilot help you learn?</label>
            <textarea
              id="pilot-goal"
              rows={2}
              value={pilotGoal}
              onChange={(event) => setPilotGoal(event.target.value)}
            />
          </div>

          <div className="pilot-touches">
            {pilotTouches.map((touch, index) => (
              <div className="pilot-touch" key={`${index}-${touch.day}`}>
                <div className="pilot-touch-heading">
                  <strong>Touch {index + 1}</strong>
                  <span>Plan only</span>
                </div>
                <div className="pilot-touch-controls">
                  <div className="field">
                    <label htmlFor={`pilot-day-${index}`}>Timing</label>
                    <input
                      id={`pilot-day-${index}`}
                      value={touch.day}
                      onChange={(event) => updatePilotTouch(index, "day", event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`pilot-channel-${index}`}>Channel</label>
                    <select
                      id={`pilot-channel-${index}`}
                      value={touch.channel}
                      onChange={(event) => updatePilotTouch(index, "channel", event.target.value)}
                    >
                      <option value="Email">Email</option>
                      <option value="LinkedIn">LinkedIn</option>
                    </select>
                  </div>
                  <div className="field full-width">
                    <label htmlFor={`pilot-purpose-${index}`}>Purpose</label>
                    <textarea
                      id={`pilot-purpose-${index}`}
                      rows={2}
                      value={touch.purpose}
                      onChange={(event) => updatePilotTouch(index, "purpose", event.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pilot-message-section">
            <div className="pilot-message-heading">
              <div>
                <h4>Per-account email drafts</h4>
                <p>
                  Start from saved company details, then add a reviewed reason
                  for reaching out and tailor the buyer problem.
                </p>
              </div>
              <span className="draft-badge">
                {pilotMessageDrafts.filter((draft) => draft.reviewed).length} / {pilotMessageDrafts.length} REVIEWED
              </span>
            </div>

            {pilotAccountIds.length === 0 ? (
              <p className="priority-empty">
                Select qualified-fit companies above to prepare their draft emails.
              </p>
            ) : (
              <div className="pilot-message-list">
                {pilotAccountIds.map((accountId) => {
                  const account = priorityAccounts.find((item) => item.id === accountId);
                  if (!account) return null;
                  const draft = pilotMessageDrafts.find(
                    (item) => item.account_id === accountId,
                  );
                  const contacts = pilotContacts[accountId] ?? [];
                  const selectedPilotContact = contacts.find((contact) => contact.id === draft?.contact_id);

                  return (
                    <article className="pilot-message-card" key={accountId}>
                      <div className="pilot-message-card-heading">
                        <div>
                          <strong>{account.company_name}</strong>
                          <span>{account.industry || "Industry not recorded"}</span>
                        </div>
                        {draft && (
                          <span className={`message-review-state ${draft.reviewed ? "reviewed" : "needs-review"}`}>
                            {draft.reviewed ? "Reviewed" : "Needs review"}
                          </span>
                        )}
                        {!draft && (
                          <button
                            className="load-button"
                            type="button"
                            onClick={() => prepareMessageDraft(accountId)}
                          >
                            Prepare email draft
                          </button>
                        )}
                      </div>

                      {draft && (
                        <div className="pilot-message-fields">
                          <div className="field full-width">
                            <label htmlFor={`draft-contact-${accountId}`}>
                              Contact (optional)
                            </label>
                            <select
                              id={`draft-contact-${accountId}`}
                              value={draft.contact_id ?? ""}
                              onChange={(event) =>
                                updateMessageDraft(
                                  accountId,
                                  "contact_id",
                                  event.target.value || null,
                                )
                              }
                            >
                              <option value="">Use a name placeholder</option>
                              {contacts
                                .filter((contact) => contact.qualification_status === "qualified")
                                .map((contact) => (
                                <option key={contact.id} value={contact.id}>
                                  {`${contact.first_name} ${contact.last_name ?? ""}`.trim()}
                                  {contact.job_title ? ` · ${contact.job_title}` : ""}
                                  {contact.email_status === "verified"
                                    ? " · email marked verified"
                                    : contact.email_status === "invalid"
                                      ? " · email marked invalid"
                                      : " · email not checked"}
                                </option>
                              ))}
                            </select>
                            {selectedPilotContact && <ContactChannelActions email={selectedPilotContact.email} emailStatus={selectedPilotContact.email_status} phone={selectedPilotContact.phone} linkedinUrl={selectedPilotContact.linkedin_url} doNotContact={selectedPilotContact.do_not_contact} />}
                          </div>
                          <div className="field full-width">
                            <label htmlFor={`draft-subject-${accountId}`}>Subject</label>
                            <input
                              id={`draft-subject-${accountId}`}
                              value={draft.subject}
                              onChange={(event) =>
                                updateMessageDraft(accountId, "subject", event.target.value)
                              }
                            />
                          </div>
                          <div className="field full-width">
                            <label htmlFor={`draft-body-${accountId}`}>Email draft</label>
                            <textarea
                              id={`draft-body-${accountId}`}
                              rows={9}
                              value={draft.body}
                              onChange={(event) =>
                                updateMessageDraft(accountId, "body", event.target.value)
                              }
                            />
                          </div>
                          <div className="field full-width">
                            <label htmlFor={`draft-evidence-${accountId}`}>
                              Source for the account-specific reason
                            </label>
                            <input
                              id={`draft-evidence-${accountId}`}
                              type="url"
                              maxLength={2000}
                              placeholder="https://example.com/relevant-company-update"
                              value={draft.evidence_url}
                              onChange={(event) =>
                                updateMessageDraft(accountId, "evidence_url", event.target.value)
                              }
                            />
                            <span className="field-hint">
                              Keep a public source here so the reviewer can verify the reason. It is not added to the email.
                            </span>
                          </div>
                          <div className="pilot-draft-footer">
                            <button
                              className={draft.reviewed ? "load-button" : "save-button"}
                              type="button"
                              disabled={draft.reviewed || hasDraftPlaceholders(draft) || !hasDraftEvidence(draft)}
                              onClick={() => markMessageDraftReviewed(accountId)}
                            >
                              {draft.reviewed ? "Reviewed" : "Mark reviewed"}
                            </button>
                            <button
                              className="pilot-remove-button"
                              type="button"
                              onClick={() => removeMessageDraft(accountId)}
                            >
                              Remove draft
                            </button>
                          </div>
                          {(hasDraftPlaceholders(draft) || !hasDraftEvidence(draft)) && (
                            <p className="priority-disclosure">
                              {hasDraftPlaceholders(draft) && "Replace every bracketed placeholder. "}
                              {!hasDraftEvidence(draft) && "Add an HTTP or HTTPS source for the account-specific reason."}
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {draftNotice && <p className="priority-disclosure">{draftNotice}</p>}
            <p className="priority-disclosure">
              Drafts stay in this organization’s workspace. Check every claim,
              contact detail, and bracketed placeholder before using any copy.
              Nothing here sends email.
            </p>
          </div>

          <div className="pilot-footer">
            <p className="notice">
              This plan and its drafts are saved for review only. Nothing is sent.
            </p>
            <button
              className="save-button"
              type="button"
              onClick={() => void persistStrategy()}
              disabled={saving || loading}
            >
              {saving ? "Saving…" : "Save pilot plan"}
              {!saving && <span>→</span>}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
