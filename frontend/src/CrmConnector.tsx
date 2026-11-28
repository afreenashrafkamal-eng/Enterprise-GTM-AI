import { useCallback, useEffect, useState, type FormEvent } from "react";
import { API_URL, apiFetch } from "./api";

type ConnectionStatus = { connected: boolean; portal_id: string | null };
type Props = { organizationId: string };

function detail(data: unknown, status: number) {
  if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string") return data.detail;
  return `The server returned ${status}.`;
}

export default function CrmConnector({ organizationId }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, portal_id: null });
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!organizationId.trim()) { setStatus({ connected: false, portal_id: null }); return; }
    setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/integrations/hubspot/status`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(detail(data, response.status));
      setStatus(data as ConnectionStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load HubSpot status.");
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/integrations/hubspot/connection`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ private_app_token: token.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(detail(data, response.status));
      setToken(""); setStatus(data as ConnectionStatus); setNotice("HubSpot connected for this client. The token is encrypted in the local database.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect HubSpot.");
    } finally { setLoading(false); }
  }

  async function sync() {
    setSyncing(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/integrations/hubspot/sync`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(detail(data, response.status));
      setNotice(`${data.message} Companies: ${data.companies_synced}; contacts: ${data.contacts_synced}; skipped without email: ${data.contacts_skipped_without_email}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "HubSpot sync failed.");
    } finally { setSyncing(false); }
  }

  async function disconnect() {
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/integrations/hubspot/connection`, { method: "DELETE" });
      if (!response.ok) throw new Error(detail(await response.json().catch(() => ({})), response.status));
      setStatus({ connected: false, portal_id: null }); setNotice("HubSpot disconnected for this client. Its saved token was removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect HubSpot.");
    } finally { setLoading(false); }
  }

  return <section className="form-card crm-connector" aria-labelledby="crm-connector-heading">
    <div className="card-heading"><div><span className="research-kicker">CRM INTEGRATION</span><h2 id="crm-connector-heading">HubSpot</h2><p>Connect one HubSpot account to this client workspace.</p></div></div>
    {error && <div className="research-error" role="alert">{error}</div>}
    {notice && <div className="prospect-notice" role="status">{notice}</div>}
    {status.connected ? <div className="crm-connected">
      <span>Connected{status.portal_id ? ` · account ${status.portal_id}` : ""}</span>
      <p>This first connector pushes saved companies and contacts to HubSpot. It matches companies by website domain (or exact name when no website is saved) and contacts by email. Contacts without an email are skipped. It does not delete HubSpot records or pull CRM records into this app yet.</p>
      <div className="crm-actions"><button className="apply-button" type="button" onClick={() => void sync()} disabled={syncing || loading}>{syncing ? "Syncing…" : "Sync saved records to HubSpot"}</button><button className="load-button" type="button" onClick={() => void disconnect()} disabled={loading || syncing}>Disconnect</button></div>
    </div> : <form className="crm-connect-form" onSubmit={(event) => void connect(event)}>
      <label>HubSpot private app token<input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} maxLength={500} required placeholder="Paste the token here" /></label>
      <small>Create a private app with company and contact read/write permissions. The token is sent to this backend over the local app connection and encrypted before storage. Never paste it into chat or commit it to Git.</small>
      <button className="apply-button" type="submit" disabled={loading || !token.trim()}>{loading ? "Checking token…" : "Connect HubSpot"}</button>
    </form>}
  </section>;
}
