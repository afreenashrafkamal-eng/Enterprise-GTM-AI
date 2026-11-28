import { useEffect, useState, type FormEvent } from "react";
import { API_URL, apiFetch } from "./api";

type Account = { id: string; company_name: string };
type Contact = { id: string; phone: string | null; do_not_contact: boolean };
type Props = { organizationId: string; account?: Account; contact?: Contact };
type Market = { code: string; label: string; dial: string };
type Status = { connected: boolean; provider: string; region: string; agent_number: string | null; caller_id: string | null; live_stream_ready: boolean };
type DialResult = { call_id: string; status: string; notice: string };
const MARKETS: Market[] = [
  { code: "AE", label: "United Arab Emirates", dial: "+971" },
  { code: "SA", label: "Saudi Arabia", dial: "+966" },
  { code: "QA", label: "Qatar", dial: "+974" },
  { code: "BH", label: "Bahrain", dial: "+973" },
  { code: "KW", label: "Kuwait", dial: "+965" },
  { code: "OM", label: "Oman", dial: "+968" },
];
function errorText(data: unknown, status: number) {
  return typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string" ? data.detail : `The server returned ${status}.`;
}

export default function UnifonicGulfPanel({ organizationId, account, contact }: Props) {
  const [market, setMarket] = useState(MARKETS[0]);
  const [status, setStatus] = useState<Status | null>(null);
  const [appsId, setAppsId] = useState("");
  const [agentNumber, setAgentNumber] = useState("");
  const [callerId, setCallerId] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [lastCall, setLastCall] = useState<DialResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setStatus(null); setLastCall(null); setPermissionConfirmed(false); setError(""); setNotice("");
    void apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/unifonic/${market.code}/status`)
      .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(errorText(data, response.status)); if (active) { const next = data as Status; setStatus(next); if (next.connected) { setAgentNumber(next.agent_number ?? ""); setCallerId(next.caller_id ?? ""); } } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load the provider setup."); });
    return () => { active = false; };
  }, [organizationId, market.code]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/unifonic/${market.code}/connection`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apps_id: appsId, agent_number: agentNumber, caller_id: callerId }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(errorText(data, response.status));
      setStatus(data as Status); setAppsId(""); setNotice("Unifonic is connected for this client and country. Your access ID is stored encrypted.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the provider setup."); }
    finally { setBusy(false); }
  }

  async function startCall() {
    if (!account || !contact || !permissionConfirmed) return;
    setBusy(true); setError(""); setNotice(""); setLastCall(null);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/unifonic/${market.code}/dial`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_account_id: account.id, target_contact_id: contact.id, outbound_call_confirmed: permissionConfirmed }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(errorText(data, response.status));
      const created = data as DialResult; setLastCall(created); setNotice(created.notice);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the call."); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError("");
    try { const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/unifonic/${market.code}/connection`, { method: "DELETE" }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(errorText(data, response.status)); setStatus(null); setAppsId(""); setNotice("Unifonic has been disconnected for this client and country."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not disconnect Unifonic."); }
    finally { setBusy(false); }
  }

  return <section className="phone-connector unifonic-gulf-panel">
    <div className="phone-connector-heading"><div><strong>Gulf calling · Unifonic</strong><p>Place an ordinary phone call through Unifonic: it calls you and the selected prospect, then joins the answered call legs. No number masking setup is used.</p></div><span className={`integration-pill ${status?.connected ? "connected" : ""}`}>{status?.connected ? `${market.label} connected` : "Not connected"}</span></div>
    <div className="gulf-market-select"><label>Call market<select value={market.code} onChange={(event) => setMarket(MARKETS.find((item) => item.code === event.target.value) ?? MARKETS[0])}>{MARKETS.map((item) => <option key={item.code} value={item.code}>{item.label} ({item.dial})</option>)}</select></label><a href="https://www.unifonic.com/" target="_blank" rel="noreferrer">Open Unifonic</a><a href="https://docs.unifonic.com/articles/products-documentation/voice-04-outbound-calls/" target="_blank" rel="noreferrer">Outbound calling guide</a></div>
    {error && <div className="research-error" role="alert">{error}</div>}{notice && <div className="prospect-notice" role="status">{notice}</div>}
    {status?.connected && <div className="phone-configured"><span>Your phone: {status.agent_number} · Unifonic caller ID: {status.caller_id}</span><button className="load-button" type="button" onClick={() => void disconnect()} disabled={busy}>Disconnect this market</button></div>}
    {(!status?.connected || !status) && <form className="crm-connect-form" onSubmit={(event) => void save(event)}>
      {!status?.connected && <strong className="provider-connect-prompt">Connect Unifonic to enable Gulf in-app calling</strong>}
      <label>Unifonic Apps ID<input value={appsId} onChange={(event) => setAppsId(event.target.value)} autoComplete="off" required /></label>
      <label>Your phone number<input type="tel" value={agentNumber} onChange={(event) => setAgentNumber(event.target.value)} placeholder={`${market.dial}...`} required /></label>
      <label>Unifonic-enabled outbound caller ID<input type="tel" value={callerId} onChange={(event) => setCallerId(event.target.value)} placeholder="+..." required /></label>
      <small>Use your Unifonic Voice application ID, your phone number (it can be outside the Gulf), and a caller ID Unifonic allows for the selected destination. It does not have to be a new personal number, but Unifonic must allow it for outbound calls. No masking number is required. Credentials are encrypted separately for this client.</small>
      <button className="apply-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save Unifonic for this market"}</button>
    </form>}
    {status?.connected && <div className="gulf-bridge-actions"><div><strong>{account?.company_name ?? "Choose a saved prospect"}</strong><span>{contact?.phone ?? "Selected contact has no phone number"}</span></div>
      <label className="phone-consent"><input type="checkbox" checked={permissionConfirmed} onChange={(event) => setPermissionConfirmed(event.target.checked)} /> I am allowed to place this business call and will follow the target country's calling rules.</label>
      <small>Live assistant is not available on this Gulf calling connection. This regular call is not streamed or transcribed by the app.</small>
      <button className="apply-button" type="button" onClick={() => void startCall()} disabled={busy || !account || !contact?.phone || contact.do_not_contact || !permissionConfirmed}>{busy ? "Starting call…" : "Call through Unifonic (no assistant)"}</button>
      {lastCall && <small>Unifonic call reference: {lastCall.call_id} · Status: {lastCall.status}</small>}
    </div>}
  </section>;
}
