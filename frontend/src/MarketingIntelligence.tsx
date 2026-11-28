import { useEffect, useState, type FormEvent } from "react";
import { API_URL, apiFetch } from "./api";

type Source = { title: string; url: string };
type Report = {
  id: string;
  prompt: string;
  created_at: string;
  filters: { industry?: string; country?: string; state_or_province?: string; city?: string };
  executive_summary: string;
  market_opportunity: string;
  demand_signals: { signal: string; evidence: string; date: string; geography: string; source_url: string; confidence: string }[];
  ideal_customer_segments: { segment: string; likely_buyer: string; fit_reason: string; priority: string }[];
  competitors: { name: string; offer: string; positioning: string; potential_gap: string; source_url: string }[];
  positioning_opportunities: string[];
  campaign_angles: string[];
  recommended_actions: string[];
  sources: Source[];
  input_tokens: number;
  output_tokens: number;
  web_search_calls: number;
  usage_model: string | null;
};
type HistoryItem = { id: string; prompt: string; created_at: string; executive_summary: string };
type Props = { organizationId: string; onStartProspecting: (prompt: string) => void };

const starterPrompt = "Research where this business can win more customers. Find current demand and buying signals, underserved customer segments, competitors and positioning gaps. Recommend practical positioning, marketing campaign angles, and next steps grounded in public sources.";

function safeUrl(url: string) { return /^https?:\/\//i.test(url) ? url : ""; }

function message(data: unknown, status: number) {
  return typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string"
    ? data.detail : `The server returned ${status}.`;
}

export default function MarketingIntelligence({ organizationId, onStartProspecting }: Props) {
  const [prompt, setPrompt] = useState(starterPrompt);
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [stateOrProvince, setStateOrProvince] = useState("");
  const [city, setCity] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedReport, setSelectedReport] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setReport(null); setSelectedReport(""); setHistory([]); setError(""); setNotice("");
    if (!organizationId.trim()) return () => { active = false; };
    setLoadingHistory(true);
    void apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/marketing-intelligence`)
      .then(async (response) => {
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(message(data, response.status));
        if (active) setHistory(Array.isArray(data) ? data as HistoryItem[] : []);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load saved intelligence briefs."); })
      .finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, [organizationId]);

  async function refreshHistory() {
    const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/marketing-intelligence`);
    const data = await response.json().catch(() => []);
    if (response.ok) setHistory(Array.isArray(data) ? data as HistoryItem[] : []);
  }

  async function research(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId.trim()) { setError("Choose or create a workspace before researching."); return; }
    setBusy(true); setError(""); setNotice(""); setReport(null);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/marketing-intelligence/research`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, industry, country, state_or_province: stateOrProvince, city }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(message(data, response.status));
      setReport(data as Report); setSelectedReport(data.id as string);
      setNotice("Intelligence brief saved to this workspace. No messages were sent and no client records were changed.");
      await refreshHistory();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Research could not be completed."); }
    finally { setBusy(false); }
  }

  async function openReport(id: string) {
    if (!id) { setSelectedReport(""); setReport(null); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/marketing-intelligence/${encodeURIComponent(id)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(message(data, response.status));
      const saved = data as Report;
      setSelectedReport(saved.id); setReport(saved); setPrompt(saved.prompt);
      setIndustry(saved.filters.industry ?? ""); setCountry(saved.filters.country ?? "");
      setStateOrProvince(saved.filters.state_or_province ?? ""); setCity(saved.filters.city ?? "");
      setNotice("Saved intelligence brief reopened without running new research.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open this saved brief."); }
    finally { setBusy(false); }
  }

  function useForProspecting() {
    if (!report) return;
    const segments = report.ideal_customer_segments.map((item) => `${item.segment} (${item.likely_buyer}; ${item.fit_reason})`).join("\n- ");
    const angles = report.campaign_angles.join("\n- ");
    const signals = report.demand_signals.map((item) => `${item.signal}: ${item.evidence} [${item.source_url}]`).join("\n- ");
    const prospectPrompt = `Use this selected client's saved offer and ICP to find real companies for outbound prospecting. Prioritize these market-intelligence segments:\n- ${segments || "Reassess the best-fit segments from the saved profile"}\n\nRelevant demand signals to look for at each company:\n- ${signals || "Find current, company-specific evidence"}\n\nCampaign positioning angles to consider:\n- ${angles || report.market_opportunity}\n\nFind company-specific evidence, current signals, and relevant decision-makers in the selected geography. Treat this brief as research context, verify every prospect-specific claim from current sources, and never infer contact emails.`;
    onStartProspecting(prospectPrompt);
  }

  return <section className="form-card marketing-intelligence" id="marketing-intelligence">
    <div className="card-heading"><div><span className="research-kicker">MARKET + DEMAND RESEARCH</span><h2>AI marketing intelligence</h2><p>Find where this workspace can win: demand signals, customer segments, competitors, positioning gaps, and practical campaign angles.</p></div></div>
    <div className="client-context-note"><strong>Researching for the selected workspace</strong><span>The brief uses this workspace’s saved company offer and ideal-customer profile. Your agency and each client retain separate research histories.</span></div>
    <div className="saved-search-row"><label htmlFor="intelligence-history">Saved intelligence briefs</label><select id="intelligence-history" value={selectedReport} onChange={(event) => void openReport(event.target.value)} disabled={loadingHistory || busy || history.length === 0}><option value="">{loadingHistory ? "Loading saved briefs…" : history.length ? "Choose a saved brief" : "No saved briefs yet"}</option>{history.map((item) => <option value={item.id} key={item.id}>{new Date(item.created_at).toLocaleString()} · {item.prompt.slice(0, 65)}</option>)}</select></div>
    <form className="intelligence-form" onSubmit={(event) => void research(event)}>
      <label htmlFor="intelligence-prompt">What should the agent investigate?</label>
      <textarea id="intelligence-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={5000} required />
      <div className="form-grid">
        <div className="field"><label htmlFor="intelligence-industry">Industry focus <span>(optional)</span></label><input id="intelligence-industry" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="e.g. SAP services, cybersecurity" maxLength={200} /></div>
        <div className="field"><label htmlFor="intelligence-country">Country <span>(optional)</span></label><input id="intelligence-country" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="e.g. United States" maxLength={100} /></div>
        <div className="field"><label htmlFor="intelligence-state">State / province <span>(optional)</span></label><input id="intelligence-state" value={stateOrProvince} onChange={(event) => setStateOrProvince(event.target.value)} maxLength={100} /></div>
        <div className="field"><label htmlFor="intelligence-city">City <span>(optional)</span></label><input id="intelligence-city" value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} /></div>
      </div>
      <p className="research-disclosure">Uses public web research and may use OpenAI API credits. Findings are saved in this workspace. Source evidence and uncertainty are shown for review.</p>
      <button className="research-button" type="submit" disabled={busy || !prompt.trim()}>{busy ? "Researching market and demand…" : "Build intelligence brief"}{!busy && <span>✧</span>}</button>
    </form>
    {error && <div className="research-error" role="alert">{error}</div>}{notice && <div className="prospect-notice" role="status">{notice}</div>}
    {report && <div className="intelligence-report" aria-live="polite">
      <div className="prospect-results-heading"><div><span className="research-kicker">SAVED BRIEF · {new Date(report.created_at).toLocaleString()}</span><h3>Market intelligence</h3></div><button className="apply-button" type="button" onClick={useForProspecting}>Use this in prospecting →</button></div>
      <article className="intelligence-highlight"><h4>Executive summary</h4><p>{report.executive_summary}</p></article>
      <article className="intelligence-highlight"><h4>Market opportunity</h4><p>{report.market_opportunity}</p></article>
      <div className="intelligence-section"><h4>Demand signals</h4>{report.demand_signals.length ? report.demand_signals.map((item, index) => <article className="intelligence-item" key={`${item.signal}-${index}`}><div><strong>{item.signal}</strong><span>{item.confidence} confidence{item.date ? ` · ${item.date}` : ""}{item.geography ? ` · ${item.geography}` : ""}</span></div><p>{item.evidence}</p>{safeUrl(item.source_url) && <a href={safeUrl(item.source_url)} target="_blank" rel="noreferrer">Open signal source</a>}</article>) : <p>No sufficiently supported demand signals found.</p>}</div>
      <div className="intelligence-section"><h4>Ideal customer segments</h4>{report.ideal_customer_segments.map((item, index) => <article className="intelligence-item" key={`${item.segment}-${index}`}><div><strong>{item.segment}</strong><span>{item.priority} priority</span></div><p><b>Likely buyer:</b> {item.likely_buyer}</p><p>{item.fit_reason}</p></article>)}</div>
      <div className="intelligence-section"><h4>Competitors and positioning gaps</h4>{report.competitors.map((item, index) => <article className="intelligence-item" key={`${item.name}-${index}`}><strong>{item.name}</strong><p><b>Offer:</b> {item.offer}</p><p><b>Positioning:</b> {item.positioning}</p><p><b>Potential gap:</b> {item.potential_gap}</p>{safeUrl(item.source_url) && <a href={safeUrl(item.source_url)} target="_blank" rel="noreferrer">Source</a>}</article>)}</div>
      <div className="intelligence-columns"><div className="intelligence-section"><h4>Positioning opportunities</h4><ul>{report.positioning_opportunities.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div className="intelligence-section"><h4>Campaign angles</h4><ul>{report.campaign_angles.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>
      <div className="intelligence-section"><h4>Recommended actions</h4><ol>{report.recommended_actions.map((item, index) => <li key={index}>{item}</li>)}</ol></div>
      <div className="source-list"><strong>Research sources</strong>{report.sources.filter((source) => safeUrl(source.url)).map((source) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>
      <small className="intelligence-usage">Research usage: {report.input_tokens.toLocaleString()} input tokens · {report.output_tokens.toLocaleString()} output tokens · {report.web_search_calls} web searches · {report.usage_model ?? "model not reported"}. These are usage counts, not dollar cost.</small>
    </div>}
  </section>;
}
