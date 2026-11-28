import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { API_URL, apiFetch } from "./api";

type ProviderId = "apollo" | "lusha" | "zoominfo";
type ProviderState = { connected: boolean; verified: boolean; connected_at: string | null; used_in_search: boolean };
type SourceStatus = Record<ProviderId, ProviderState>;

const emptyState = (): SourceStatus => ({
  apollo: { connected: false, verified: false, connected_at: null, used_in_search: false },
  lusha: { connected: false, verified: false, connected_at: null, used_in_search: false },
  zoominfo: { connected: false, verified: false, connected_at: null, used_in_search: false },
});

function detail(data: unknown, status: number) {
  if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string") return data.detail;
  return `The server returned ${status}.`;
}

export default function ProspectDataSources({ organizationId }: { organizationId: string }) {
  const [status, setStatus] = useState<SourceStatus>(emptyState);
  const [loading, setLoading] = useState(false);
  const [providerBusy, setProviderBusy] = useState<ProviderId | "">("");
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ apollo: "", lusha: "", zoominfo: "" });
  const [zoomClientId, setZoomClientId] = useState("");
  const [zoomClientSecret, setZoomClientSecret] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!organizationId.trim()) { setStatus(emptyState()); return; }
    setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/integrations/prospect-data/status`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(detail(data, response.status));
      setStatus({ ...emptyState(), ...(data.providers ?? {}) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load data-provider connections.");
    } finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function connect(event: FormEvent<HTMLFormElement>, provider: ProviderId) {
    event.preventDefault(); setProviderBusy(provider); setError(""); setNotice("");
    const body = provider === "zoominfo"
      ? { client_id: zoomClientId.trim(), client_secret: zoomClientSecret.trim() }
      : { api_key: keys[provider].trim() };
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/integrations/prospect-data/${provider}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(detail(data, response.status));
      setKeys((current) => ({ ...current, [provider]: "" }));
      if (provider === "zoominfo") { setZoomClientId(""); setZoomClientSecret(""); }
      setNotice(provider === "lusha"
        ? "Lusha credentials were encrypted and saved. They are not yet used in AI prospect searches."
        : `${providerLabel(provider)} connection verified and saved. It is not yet used in AI prospect searches.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not connect ${providerLabel(provider)}.`);
    } finally { setProviderBusy(""); }
  }

  async function disconnect(provider: ProviderId) {
    setProviderBusy(provider); setError(""); setNotice("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/integrations/prospect-data/${provider}`, { method: "DELETE" });
      if (!response.ok) throw new Error(detail(await response.json().catch(() => ({})), response.status));
      setNotice(`${providerLabel(provider)} was disconnected from this client workspace.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not disconnect ${providerLabel(provider)}.`);
    } finally { setProviderBusy(""); }
  }

  return <section id="prospect-data-sources" className="prospect-provider-panel" aria-label="Connect prospecting data providers">
    <div className="data-source-heading"><div><strong>Connect prospecting tools</strong><span>Connections are kept separate for each agency or client workspace.</span></div><span className="research-kicker">PROVIDER SETUP</span></div>
    {error && <div className="research-error" role="alert">{error}</div>}
    {notice && <div className="prospect-notice" role="status">{notice}</div>}
    <div className="prospect-provider-grid">
      <ProviderCard title="Apollo" description="Connect an Apollo API key. The connection is checked against Apollo before it is saved." status={status.apollo} busy={providerBusy === "apollo"} loading={loading} link="https://developer.apollo.io/" linkLabel="Open Apollo developer settings" onDisconnect={() => void disconnect("apollo")}>
        {!status.apollo.connected && <form className="provider-connect-form" onSubmit={(event) => void connect(event, "apollo")}><label>Apollo API key<input type="password" autoComplete="off" value={keys.apollo} onChange={(event) => setKeys((current) => ({ ...current, apollo: event.target.value }))} maxLength={2000} required placeholder="Paste API key" /></label><button className="apply-button" type="submit" disabled={loading || providerBusy !== "" || !keys.apollo.trim()}>{providerBusy === "apollo" ? "Checking…" : "Connect Apollo"}</button></form>}
      </ProviderCard>
      <ProviderCard title="Lusha" description="Save your Lusha API key. It will be checked when a Lusha prospecting request is added." status={status.lusha} busy={providerBusy === "lusha"} loading={loading} link="https://dashboard.lusha.com/enrich/api" linkLabel="Open Lusha API settings" onDisconnect={() => void disconnect("lusha")}>
        {!status.lusha.connected && <form className="provider-connect-form" onSubmit={(event) => void connect(event, "lusha")}><label>Lusha API key<input type="password" autoComplete="off" value={keys.lusha} onChange={(event) => setKeys((current) => ({ ...current, lusha: event.target.value }))} maxLength={2000} required placeholder="Paste API key" /></label><button className="apply-button" type="submit" disabled={loading || providerBusy !== "" || !keys.lusha.trim()}>{providerBusy === "lusha" ? "Saving…" : "Save Lusha key"}</button></form>}
      </ProviderCard>
      <ProviderCard title="ZoomInfo" description="Connect a ZoomInfo OAuth application. Client credentials are checked before they are saved." status={status.zoominfo} busy={providerBusy === "zoominfo"} loading={loading} link="https://developer.zoominfo.com/" linkLabel="Open ZoomInfo developer portal" onDisconnect={() => void disconnect("zoominfo")}>
        {!status.zoominfo.connected && <form className="provider-connect-form" onSubmit={(event) => void connect(event, "zoominfo")}><label>Client ID<input type="text" autoComplete="off" value={zoomClientId} onChange={(event) => setZoomClientId(event.target.value)} maxLength={500} required placeholder="OAuth client ID" /></label><label>Client secret<input type="password" autoComplete="new-password" value={zoomClientSecret} onChange={(event) => setZoomClientSecret(event.target.value)} maxLength={2000} required placeholder="OAuth client secret" /></label><button className="apply-button" type="submit" disabled={loading || providerBusy !== "" || !zoomClientId.trim() || !zoomClientSecret.trim()}>{providerBusy === "zoominfo" ? "Checking…" : "Connect ZoomInfo"}</button></form>}
      </ProviderCard>
      <div className="prospect-provider-card">
        <div className="provider-card-heading"><div><span className="data-source-state">Manual sign-in</span><h3>LinkedIn Sales Navigator</h3></div></div>
        <p>Open Sales Navigator to research and verify people manually. Automated profile scraping is not supported.</p>
        <a className="load-button provider-link" href="https://www.linkedin.com/sales/" target="_blank" rel="noreferrer">Sign in to Sales Navigator ↗</a>
      </div>
      <div className="prospect-provider-card">
        <div className="provider-card-heading"><div><span className="data-source-state">Open source</span><h3>Crawl4AI</h3></div></div>
        <p>Can extract public company pages locally. It does not provide a ready-made contact database or verified emails.</p>
        <a className="load-button provider-link" href="https://github.com/unclecode/crawl4ai" target="_blank" rel="noreferrer">View Crawl4AI ↗</a>
      </div>
    </div>
    <p className="provider-disclosure">Provider credentials are encrypted in this workspace. These connections are currently saved for setup only; AI searches still use OpenAI public-web research. Commercial provider data can be shown to clients only when your provider agreement permits it.</p>
  </section>;
}

function providerLabel(provider: ProviderId) { return provider === "zoominfo" ? "ZoomInfo" : provider[0].toUpperCase() + provider.slice(1); }

function ProviderCard({ title, description, status, busy, loading, link, linkLabel, onDisconnect, children }: {
  title: string; description: string; status: ProviderState; busy: boolean; loading: boolean;
  link: string; linkLabel: string; onDisconnect: () => void; children: ReactNode;
}) {
  const connected = status.connected;
  const state = connected ? (status.verified ? "Connection verified" : "Key saved · not verified") : "Not connected";
  return <div className="prospect-provider-card">
    <div className="provider-card-heading"><div><span className={`data-source-state ${connected ? "connected" : ""}`}>{loading ? "Checking…" : state}</span><h3>{title}</h3></div>{connected && <button className="load-button" type="button" onClick={onDisconnect} disabled={busy || loading}>{busy ? "Removing…" : "Disconnect"}</button>}</div>
    <p>{description}</p>
    <a className="provider-signup-link" href={link} target="_blank" rel="noreferrer">{linkLabel} ↗</a>
    {connected ? <small className="provider-search-state">{status.used_in_search ? "Enabled in AI searches." : "Saved securely; not yet used by AI searches."}</small> : children}
  </div>;
}
