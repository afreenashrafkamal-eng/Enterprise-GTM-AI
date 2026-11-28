import { useCallback, useEffect, useState } from "react";
import { API_URL, apiFetch } from "./api";

type Organization = { id: string; name: string };
type Account = { id: string; qualification_status: string; evidence_url: string | null };
type Campaign = {
  id: string; result_count: number; created_at: string;
  input_tokens: number; output_tokens: number; web_search_calls: number; usage_model: string | null;
};
type SendRecord = { id: string; status: "sent" | "failed" | "unknown"; created_at: string };
type CallRecord = { id: string; outcome: string; called_at: string; follow_up_at: string | null; follow_up_completed_at: string | null };
type ClientReport = {
  organization: Organization;
  accounts: Account[];
  contactCount: number;
  accountsWithoutContacts: number;
  searches: Campaign[];
  sends: SendRecord[];
  calls: CallRecord[];
};

type Props = { activeOrganizationId: string };

async function getJson<T>(url: string): Promise<T> {
  const response = await apiFetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : `The server returned ${response.status}.`;
    throw new Error(detail);
  }
  return data as T;
}

export default function ReportsDashboard({ activeOrganizationId }: Props) {
  const [clients, setClients] = useState<ClientReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const organizations = await getJson<Organization[]>(`${API_URL}/organizations`);
      const reports = await Promise.all(organizations.map(async (organization): Promise<ClientReport> => {
        const base = `${API_URL}/organizations/${encodeURIComponent(organization.id)}`;
        const [accounts, searches, sends, calls] = await Promise.all([
          getJson<Account[]>(`${base}/target-accounts`),
          getJson<Campaign[]>(`${base}/prospecting/campaigns?limit=100`),
          getJson<SendRecord[]>(`${base}/prospecting/emails/history`),
          getJson<CallRecord[]>(`${base}/calls`),
        ]);
        const contacts = await Promise.all(accounts.map((account) =>
          getJson<unknown[]>(`${base}/target-accounts/${encodeURIComponent(account.id)}/contacts`),
        ));
        return {
          organization,
          accounts,
          contactCount: contacts.reduce((total, list) => total + list.length, 0),
          accountsWithoutContacts: contacts.filter((list) => list.length === 0).length,
          searches,
          sends,
          calls,
        };
      }));
      setClients(reports);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load workspace reporting.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const totals = clients.reduce((summary, client) => ({
    searches: summary.searches + client.searches.length,
    accounts: summary.accounts + client.accounts.length,
    qualified: summary.qualified + client.accounts.filter((account) => account.qualification_status === "qualified").length,
    contacts: summary.contacts + client.contactCount,
    sent: summary.sent + client.sends.filter((send) => send.status === "sent").length,
    failed: summary.failed + client.sends.filter((send) => send.status === "failed").length,
    unknown: summary.unknown + client.sends.filter((send) => send.status === "unknown").length,
    calls: summary.calls + client.calls.length,
    inputTokens: summary.inputTokens + client.searches.reduce((total, search) => total + search.input_tokens, 0),
    outputTokens: summary.outputTokens + client.searches.reduce((total, search) => total + search.output_tokens, 0),
    webSearches: summary.webSearches + client.searches.reduce((total, search) => total + search.web_search_calls, 0),
  }), { searches: 0, accounts: 0, qualified: 0, contacts: 0, sent: 0, failed: 0, unknown: 0, calls: 0, inputTokens: 0, outputTokens: 0, webSearches: 0 });

  return (
    <section className="form-card reports-dashboard" id="reports">
      <div className="card-heading">
        <div>
          <span className="research-kicker">AGENCY + CLIENT VIEW</span>
          <h2>Performance and recommendations</h2>
          <p>Workspace activity stays separated by client. These are recorded counts, not revenue or proof of buying intent.</p>
        </div>
        <button className="load-button" type="button" onClick={() => void loadReports()} disabled={loading}>
          {loading ? "Updating…" : "Refresh reports"}
        </button>
      </div>

      {error && <div className="research-error" role="alert">{error}</div>}
      {loading && clients.length === 0 && <p className="field-hint">Loading saved workspace activity…</p>}
      {!loading && clients.length === 0 && !error && <p className="field-hint">Add a client workspace to begin tracking activity.</p>}

      {clients.length > 0 && <>
        <div className="report-rollup">
          <div className="report-rollup-heading"><strong>Agency overview</strong><span>{clients.length} separate workspace{clients.length === 1 ? "" : "s"}</span></div>
          <div className="report-metrics">
            <div><b>{totals.searches}</b><span>Saved searches</span></div>
            <div><b>{totals.accounts}</b><span>Target companies</span></div>
            <div><b>{totals.qualified}</b><span>Marked qualified</span></div>
            <div><b>{totals.contacts}</b><span>Saved contacts</span></div>
            <div><b>{totals.calls}</b><span>Recent calls (up to 100 per client)</span></div>
            <div><b>{(totals.inputTokens + totals.outputTokens).toLocaleString()}</b><span>Research tokens reported</span></div>
            <div><b>{totals.webSearches}</b><span>Web searches reported</span></div>
            <div><b>{totals.sent}</b><span>Recorded as sent</span></div>
            <div><b>{totals.failed + totals.unknown}</b><span>Failed / check outcome</span></div>
          </div>
          <p className="report-limit-note">OpenAI research spend and revenue are not recorded yet. AI fit scores and signal confidence are suggestions for human review.</p>
        </div>

        <div className="client-report-list">
          {clients.map((client) => {
            const qualified = client.accounts.filter((account) => account.qualification_status === "qualified").length;
            const sourced = client.accounts.filter((account) => Boolean(account.evidence_url?.trim())).length;
            const sendIssues = client.sends.filter((send) => send.status !== "sent").length;
            const followUpsDue = client.calls.filter((call) => call.follow_up_at && !call.follow_up_completed_at && new Date(call.follow_up_at) <= new Date()).length;
            const contactless = client.accountsWithoutContacts;
            const recommendations = [
              ...(contactless > 0 ? [`Review decision-maker coverage: ${contactless} saved companies may still need contacts.`] : []),
              ...(client.accounts.length > sourced ? [`Add a public source for ${client.accounts.length - sourced} company outreach reason${client.accounts.length - sourced === 1 ? "" : "s"}.`] : []),
              ...(client.accounts.length > qualified ? [`Review the remaining ${client.accounts.length - qualified} company qualification status${client.accounts.length - qualified === 1 ? "" : "es"}.`] : []),
              ...(sendIssues > 0 ? [`Check ${sendIssues} failed or uncertain email outcome${sendIssues === 1 ? "" : "s"} before retrying.`] : []),
              ...(followUpsDue > 0 ? [`Work through ${followUpsDue} due call follow-up${followUpsDue === 1 ? "" : "s"}.`] : []),
            ];
            return (
              <article className={`client-report-card${client.organization.id === activeOrganizationId ? " active" : ""}`} key={client.organization.id}>
                <div className="client-report-heading">
                  <div><h3>{client.organization.name}</h3>{client.organization.id === activeOrganizationId && <span className="report-current-label">Currently selected</span>}</div>
                  <span>{client.searches.length} search{client.searches.length === 1 ? "" : "es"}</span>
                </div>
                <div className="client-report-metrics">
                  <span><b>{client.accounts.length}</b> companies</span>
                  <span><b>{qualified}</b> qualified</span>
                  <span><b>{client.contactCount}</b> contacts</span>
                  <span><b>{client.calls.length}</b> recent calls</span>
                  <span><b>{(client.searches.reduce((total, search) => total + search.input_tokens + search.output_tokens, 0)).toLocaleString()}</b> research tokens</span>
                  <span><b>{client.searches.reduce((total, search) => total + search.web_search_calls, 0)}</b> web searches</span>
                  <span><b>{client.sends.filter((send) => send.status === "sent").length}</b> emails recorded as sent</span>
                  <span><b>{sourced}/{client.accounts.length}</b> company reasons with a source</span>
                </div>
                <div className="client-report-bottom">
                  <span>Latest search: {client.searches[0] ? new Date(client.searches[0].created_at).toLocaleString() : "None yet"}</span>
                  <span>Latest email activity: {client.sends[0] ? new Date(client.sends[0].created_at).toLocaleString() : "None recorded"}</span>
                </div>
                {recommendations.length > 0 ? (
                  <ul className="report-recommendations">{recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul>
                ) : <p className="report-clear-note">No follow-up recommendation from the recorded activity.</p>}
              </article>
            );
          })}
        </div>
      </>}
    </section>
  );
}
