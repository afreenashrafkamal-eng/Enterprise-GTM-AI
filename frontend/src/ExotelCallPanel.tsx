import { useEffect, useState, type FormEvent } from "react";
import { API_URL, apiFetch } from "./api";

type Contact = { id: string; phone: string | null; do_not_contact: boolean };
type Account = { id: string; company_name: string };
type CallGuide = { opening: string; reason_for_call: string; discovery_questions: string[]; value_bridge: string; objection_responses: { objection: string; response: string }[]; next_step_ask: string; voicemail: string; guardrails: string[] };
type CallSuggestion = { suggested_reply: string; next_question: string; brief_reason: string; caution: string; conversation_stage: string; qualification_signal: string; recommended_action: string };
type Props = { organizationId: string; account?: Account; contact?: Contact; callGuide?: CallGuide | null };
type Status = { connected: boolean; provider: string; account_sid: string | null; agent_number: string | null; caller_id: string | null; live_stream_ready: boolean };
type TranscriptLine = { id: string; text: string; final: boolean };

const REGIONAL_PHONE_PROVIDERS = [
  {
    market: "United States",
    provider: "Twilio Programmable Voice",
    why: "Supports local voice numbers and live audio streaming for the call assistant. This account can now be connected in the call panel below.",
    signup: "https://www.twilio.com/try-twilio",
    guidance: "https://www.twilio.com/en-us/guidelines/us/voice",
    status: "Connectable in app",
  },
  {
    market: "Gulf markets",
    provider: "Unifonic Voice",
    why: "The app can place an ordinary outbound Unifonic call to your phone and a saved prospect, then join the answered legs. No Number Masking application is used. Live headset assistance is not available on this Gulf adapter.",
    signup: "https://www.unifonic.com/",
    guidance: "https://docs.unifonic.com/articles/products-documentation/voice-04-outbound-calls/",
    status: "Outbound calling in app",
  },
  {
    market: "Malaysia",
    provider: "Twilio Programmable Voice",
    why: "The call adapter is ready. Malaysia does not accept verified personal caller IDs for local outbound calls; use a Twilio-owned number. Local Malaysian numbers have separate registration and address requirements.",
    signup: "https://www.twilio.com/try-twilio",
    guidance: "https://www.twilio.com/en-us/guidelines/my/voice",
    numberGuidance: "https://www.twilio.com/en-us/guidelines/my/regulatory",
    status: "Connectable in app",
  },
  {
    market: "United Kingdom",
    provider: "Twilio Programmable Voice",
    why: "Voice API and live audio streaming fit the assistant. Use a valid, dialable caller ID that meets UK rules.",
    signup: "https://www.twilio.com/try-twilio",
    guidance: "https://www.twilio.com/en-us/guidelines/gb/voice",
    status: "Connectable in app",
  },
];

function getError(data: unknown, status: number) {
  if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string") return data.detail;
  return `The server returned ${status}.`;
}

export default function ExotelCallPanel({ organizationId, account, contact, callGuide }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [accountSid, setAccountSid] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [agentNumber, setAgentNumber] = useState("");
  const [callerId, setCallerId] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [outboundConfirmed, setOutboundConfirmed] = useState(false);
  const [liveAssistant, setLiveAssistant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewerToken, setViewerToken] = useState("");
  const [callState, setCallState] = useState("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [liveSuggestion, setLiveSuggestion] = useState<CallSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!organizationId.trim()) { setStatus(null); return; }
    let active = true;
    void apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/exotel/status`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(getError(data, response.status));
        if (active) setStatus(data as Status);
      }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not read the phone setup."); });
    return () => { active = false; };
  }, [organizationId]);

  useEffect(() => {
    if (!viewerToken) return;
    const socketUrl = `${API_URL.replace(/^http/, "ws")}/calls/exotel/live?token=${encodeURIComponent(viewerToken)}`;
    const socket = new WebSocket(socketUrl);
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { type?: string; status?: string; detail?: string; transcript_lines?: string[]; transcript?: string; delta?: string; item_id?: string };
        if (event.type === "snapshot") {
          setTranscript((event.transcript_lines ?? []).map((text, index) => ({ id: `snapshot-${index}`, text, final: true })));
          setCallState(event.status ?? "waiting");
        } else if (event.type === "status") {
          setCallState(event.status ?? "listening");
          if (event.status === "error" && event.detail) setError(`Live assistant: ${event.detail}`);
        } else if (event.type === "conversation.item.input_audio_transcription.delta") {
          setTranscript((current) => {
            const id = event.item_id ?? "partial";
            const without = current.filter((line) => line.id !== id);
            const prior = current.find((line) => line.id === id)?.text ?? "";
            return [...without, { id, text: prior + (event.delta ?? ""), final: false }].slice(-40);
          });
        } else if (event.type === "conversation.item.input_audio_transcription.completed") {
          const id = event.item_id ?? `final-${Date.now()}`;
          setTranscript((current) => [...current.filter((line) => line.id !== id), { id, text: event.transcript ?? "", final: true }].slice(-40));
        }
      } catch { /* Ignore malformed stream events. */ }
    };
    socket.onerror = () => setError("The live transcript connection was interrupted. The phone call can continue normally.");
    return () => socket.close();
  }, [viewerToken]);

  async function saveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/exotel/connection`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_sid: accountSid, api_key: apiKey, api_token: apiToken, agent_number: agentNumber, caller_id: callerId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getError(data, response.status));
      setStatus(data as Status); setApiKey(""); setApiToken(""); setSetupOpen(false);
      setNotice("Exotel credentials saved encrypted for this client workspace.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the provider setup."); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/exotel/connection`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getError(data, response.status));
      setStatus((current) => current ? { ...current, connected: false } : current); setNotice("Exotel disconnected for this client.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not disconnect Exotel."); }
    finally { setBusy(false); }
  }

  async function startCall() {
    if (!account || !contact || !outboundConfirmed || (liveAssistant && (!consentConfirmed || !status?.live_stream_ready))) return;
    setBusy(true); setError(""); setNotice(""); setTranscript([]);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/exotel/dial`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_account_id: account.id, target_contact_id: contact.id, outbound_call_confirmed: outboundConfirmed, live_assistant: liveAssistant, consent_confirmed: liveAssistant && consentConfirmed }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getError(data, response.status));
      setViewerToken(typeof data.viewer_token === "string" ? data.viewer_token : ""); setCallState("calling"); setLiveSuggestion(null); setNotice(`${data.notice} Call reference: ${data.call_sid}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the call."); }
    finally { setBusy(false); }
  }

  async function suggestFromCaption() {
    const latest = transcript.filter((line) => line.final && line.text.trim()).at(-1);
    if (!latest || !account || !contact) return;
    setSuggesting(true); setError(""); setLiveSuggestion(null);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/calls/live-assist`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_account_id: account.id, target_contact_id: contact.id, prospect_said: latest.text, call_guide: callGuide ?? null, recent_transcript: transcript.filter((line) => line.final && line.text.trim()).slice(-8).map((line) => ({ speaker: "unknown", text: line.text })) }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getError(data, response.status));
      setLiveSuggestion(data as CallSuggestion);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not prepare a response suggestion."); }
    finally { setSuggesting(false); }
  }

  async function stopAssistant() {
    const token = viewerToken;
    if (token) {
      try {
        await apiFetch(`${API_URL}/calls/exotel/live/${encodeURIComponent(token)}`, { method: "DELETE" });
      } catch { /* The browser transcript is still cleared locally. */ }
    }
    setViewerToken(""); setCallState("stopped"); setTranscript([]); setLiveSuggestion(null); setConsentConfirmed(false); setOutboundConfirmed(false); setLiveAssistant(false);
  }

  return <section className="phone-connector">
    <div className="phone-connector-heading"><div><strong>India calling · Exotel</strong><p>Exotel rings your phone, then connects the saved prospect. Turn on live captions and AI assistance only when you want them.</p></div>
      <span className={`integration-pill ${status?.connected ? "connected" : ""}`}>{status?.connected ? "Exotel connected" : "Not connected"}</span></div>
    <details className="regional-phone-options">
      <summary>Provider options for priority markets</summary>
      <p className="regional-phone-intro">Twilio can be connected below for the US, Malaysia, or UK. Unifonic can call your phone and a prospect for Gulf markets from the separate Gulf calling section below. You need a Voice application and provider-enabled outbound caller ID; this is separate from Number Masking. Local route availability, documentation, and rates still need confirmation for your account and selected country.</p>
      <div className="regional-phone-grid">{REGIONAL_PHONE_PROVIDERS.map((item) => <article className="regional-phone-card" key={item.market}>
        <div className="regional-phone-card-heading"><strong>{item.market}</strong><span>{item.status}</span></div>
        <b>{item.provider}</b><p>{item.why}</p>
        <div><a href={item.signup} target="_blank" rel="noreferrer">Provider account</a><a href={item.guidance} target="_blank" rel="noreferrer">Calling requirements</a>{"numberGuidance" in item && <a href={item.numberGuidance} target="_blank" rel="noreferrer">Number eligibility</a>}</div>
      </article>)}</div>
    </details>
    {error && <div className="research-error" role="alert">{error}</div>}
    {notice && <div className="prospect-notice" role="status">{notice}</div>}
    {status?.connected && <div className="phone-configured"><span>Agent phone: {status.agent_number} · Caller ID: {status.caller_id}</span><div className="crm-actions"><button className="load-button" type="button" onClick={() => setSetupOpen((value) => !value)}>Update setup</button><button className="load-button" type="button" onClick={() => void disconnect()} disabled={busy}>Disconnect</button></div></div>}
    {(!status?.connected || setupOpen) && <form className="crm-connect-form" onSubmit={(event) => void saveConnection(event)}>
      {!status?.connected && <strong className="provider-connect-prompt">Connect Exotel to enable the India in-app call button</strong>}
      <label>Exotel account ID<input value={accountSid} onChange={(event) => setAccountSid(event.target.value)} autoComplete="off" required /></label>
      <label>Exotel API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" required /></label>
      <label>Exotel API token<input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} autoComplete="new-password" required /></label>
      <label>Your phone number<input type="tel" value={agentNumber} onChange={(event) => setAgentNumber(event.target.value)} placeholder="+919876543210" required /></label>
      <label>Exotel caller ID / ExoPhone<input value={callerId} onChange={(event) => setCallerId(event.target.value)} required /></label>
      <small>Credentials are encrypted and scoped to this client. Exotel billing and live transcription charges may apply. Live audio needs a secure public WebSocket address configured for the app.</small>
      <button className="apply-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save Exotel connection"}</button>
    </form>}
    {status?.connected && <div className="phone-call-actions">
      <div><strong>{account?.company_name ?? "Choose a saved prospect"}</strong><span>{contact?.phone ?? "This contact has no phone number"}</span></div>
      <label className="phone-consent"><input type="checkbox" checked={outboundConfirmed} onChange={(event) => setOutboundConfirmed(event.target.checked)} /> I am allowed to place this business call and will follow the target country's calling rules.</label>
      <label className="phone-consent"><input type="checkbox" checked={liveAssistant} onChange={(event) => { setLiveAssistant(event.target.checked); setConsentConfirmed(false); }} disabled={!status.live_stream_ready || Boolean(viewerToken)} /> Add optional live captions and AI call assistance (may incur extra OpenAI usage charges).</label>
      {!status.live_stream_ready && <small>Live assistance is unavailable until the secure audio connection and OpenAI key are configured. You can still place a regular call through Exotel.</small>}
      {liveAssistant && <label className="phone-consent"><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} /> I have given the required notice and have permission to stream and transcribe this call.</label>}
      <small>Check the target country's calling and Do Not Call requirements before placing a marketing call. Audio is streamed only when the optional live-assistant box is checked.</small>
      <button className="apply-button" type="button" onClick={() => void startCall()} disabled={busy || !account || !contact?.phone || contact.do_not_contact || !outboundConfirmed || (liveAssistant && !consentConfirmed) || Boolean(viewerToken)}>{busy ? "Starting call…" : liveAssistant ? "Call through Exotel + live assistant" : "Call through Exotel (no assistant)"}</button>
      {viewerToken && <button className="load-button" type="button" onClick={() => void stopAssistant()}>Stop live assistant and clear live text</button>}
      {viewerToken && <div className="live-transcript" aria-live="polite"><div className="live-transcript-heading"><b>Live transcript</b><span>{callState === "waiting" ? "Waiting for the prospect to answer" : callState === "listening" ? "Listening" : callState}</span></div>
        {transcript.length === 0 ? <p>Captions will appear after the call connects. Text is held temporarily in memory and cleared when you close the assistant view.</p> : transcript.map((line) => <p className={line.final ? "" : "partial"} key={line.id}>{line.text}</p>)}
        <button className="apply-button" type="button" onClick={() => void suggestFromCaption()} disabled={suggesting || !transcript.some((line) => line.final && line.text.trim())}>{suggesting ? "Preparing suggestion…" : "Suggest a reply from latest caption"}</button>
        <small>Only the latest completed caption and this client's saved context are sent to OpenAI when you request a suggestion. API usage may be charged.</small>
        {liveSuggestion && <article className="live-call-suggestion"><div><b>Possible reply</b><p>{liveSuggestion.suggested_reply}</p></div><div><b>Next question</b><p>{liveSuggestion.next_question}</p></div><div><b>Call stage · next action</b><p>{liveSuggestion.conversation_stage.replaceAll("_", " ")} · {liveSuggestion.recommended_action.replaceAll("_", " ")}</p></div><div><b>Qualification signal</b><p>{liveSuggestion.qualification_signal}</p></div><div><b>Why this fits</b><p>{liveSuggestion.brief_reason}</p></div><div className="live-call-caution"><b>Review</b><p>{liveSuggestion.caution}</p></div></article>}
      </div>}
    </div>}
  </section>;
}
