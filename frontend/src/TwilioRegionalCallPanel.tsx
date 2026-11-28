import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_URL, apiFetch } from "./api";

type Contact = { id: string; phone: string | null; do_not_contact: boolean };
type Account = { id: string; company_name: string };
type CallGuide = { opening: string; reason_for_call: string; discovery_questions: string[]; value_bridge: string; objection_responses: { objection: string; response: string }[]; next_step_ask: string; voicemail: string; guardrails: string[] };
type Props = { organizationId: string; account?: Account; contact?: Contact; callGuide?: CallGuide | null; market: "US" | "MY" | "GB" };
type Status = { connected: boolean; provider: string; region: string; account_sid: string | null; agent_number: string | null; caller_id: string | null; live_stream_ready: boolean };
type Line = { id: string; speaker?: string; text: string; final: boolean };
type Suggestion = { suggested_reply: string; next_question: string; brief_reason: string; caution: string; conversation_stage: string; qualification_signal: string; recommended_action: string };

const MARKETS = [
  { code: "US", name: "United States" },
  { code: "MY", name: "Malaysia" },
  { code: "GB", name: "United Kingdom" },
];

function errorText(data: unknown, status: number) {
  if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string") return data.detail;
  return `The server returned ${status}.`;
}

export default function TwilioRegionalCallPanel({ organizationId, account, contact, callGuide, market: selectedMarketCode }: Props) {
  const [market, setMarket] = useState(selectedMarketCode);
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [agentNumber, setAgentNumber] = useState("");
  const [callerId, setCallerId] = useState("");
  const [outboundConfirmed, setOutboundConfirmed] = useState(false);
  const [liveAssistant, setLiveAssistant] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewerToken, setViewerToken] = useState("");
  const [callState, setCallState] = useState("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [autoCoach, setAutoCoach] = useState(false);
  const lastAutoCoachTurn = useRef("");

  useEffect(() => { setMarket(selectedMarketCode); }, [selectedMarketCode]);

  useEffect(() => {
    if (!organizationId.trim()) { setStatus(null); return; }
    let active = true;
    void apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/twilio/${market}/status`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorText(data, response.status));
        if (active) setStatus(data as Status);
      }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not read the Twilio setup."); });
    return () => { active = false; };
  }, [organizationId, market]);

  useEffect(() => {
    if (!viewerToken) return;
    const socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/calls/twilio/live?token=${encodeURIComponent(viewerToken)}`);
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { type?: string; status?: string; detail?: string; transcript_lines?: string[]; transcript?: string; delta?: string; item_id?: string; speaker?: string };
        if (event.type === "snapshot") {
          setLines((event.transcript_lines ?? []).map((text, index) => ({ id: `snapshot-${index}`, text, final: true })));
          setCallState(event.status ?? "waiting");
        } else if (event.type === "status") {
          setCallState(event.status ?? "listening");
          if (event.status === "error" && event.detail) setError(`Live assistant: ${event.detail}`);
        } else if (event.type === "conversation.item.input_audio_transcription.delta") {
          setLines((current) => {
            const id = event.item_id ?? "partial";
            const previous = current.find((line) => line.id === id);
            return [...current.filter((line) => line.id !== id), { id, speaker: event.speaker, text: (previous?.text ?? "") + (event.delta ?? ""), final: false }].slice(-40);
          });
        } else if (event.type === "conversation.item.input_audio_transcription.completed") {
          const id = event.item_id ?? `final-${Date.now()}`;
          setLines((current) => [...current.filter((line) => line.id !== id), { id, speaker: event.speaker, text: event.transcript ?? "", final: true }].slice(-40));
        }
      } catch { /* Ignore malformed stream events. */ }
    };
    socket.onerror = () => setError("The live caption connection was interrupted. The phone call may continue normally.");
    return () => socket.close();
  }, [viewerToken]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/twilio/${market}/connection`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_sid: accountSid, auth_token: authToken, agent_number: agentNumber, caller_id: callerId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorText(data, response.status));
      setStatus(data as Status); setAuthToken(""); setOpen(false);
      setNotice(`Twilio ${market} connection saved encrypted for this client workspace.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the Twilio setup."); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError("");
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/twilio/${market}/connection`, { method: "DELETE" });
      if (!response.ok) throw new Error(errorText(await response.json().catch(() => ({})), response.status));
      setStatus((current) => current ? { ...current, connected: false } : current);
      setNotice(`Twilio ${market} disconnected for this client.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not disconnect Twilio."); }
    finally { setBusy(false); }
  }

  async function dial() {
    if (!account || !contact || !outboundConfirmed || (liveAssistant && (!consent || !status?.live_stream_ready))) return;
    setBusy(true); setError(""); setNotice(""); setLines([]);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/phone/twilio/${market}/dial`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_account_id: account.id, target_contact_id: contact.id, outbound_call_confirmed: outboundConfirmed, live_assistant: liveAssistant, consent_confirmed: liveAssistant && consent }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorText(data, response.status));
      setViewerToken(typeof data.viewer_token === "string" ? data.viewer_token : ""); setCallState("calling"); setSuggestion(null); setAutoCoach(false); lastAutoCoachTurn.current = ""; setNotice(`${data.notice} Call reference: ${data.call_sid}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the call."); }
    finally { setBusy(false); }
  }

  async function stop() {
    if (viewerToken) {
      try { await apiFetch(`${API_URL}/calls/twilio/live/${encodeURIComponent(viewerToken)}`, { method: "DELETE" }); } catch { /* Clear local view even if the session already ended. */ }
    }
    setViewerToken(""); setCallState("stopped"); setLines([]); setSuggestion(null); setAutoCoach(false); lastAutoCoachTurn.current = ""; setConsent(false); setOutboundConfirmed(false); setLiveAssistant(false);
  }

  async function suggest(focusLine?: Line) {
    const latest = focusLine ?? lines.filter((line) => line.final && line.text.trim()).at(-1);
    if (!latest || !account || !contact) return;
    setSuggesting(true); setError(""); setSuggestion(null);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/calls/live-assist`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_account_id: account.id,
          target_contact_id: contact.id,
          prospect_said: latest.text,
          call_guide: callGuide ?? null,
          recent_transcript: lines.filter((line) => line.final && line.text.trim()).slice(-8).map((line) => ({
            speaker: line.speaker === "you" ? "you" : line.speaker === "other party" ? "prospect" : "unknown",
            text: line.text,
          })),
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorText(data, response.status));
      setSuggestion(data as Suggestion);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not prepare a reply suggestion."); }
    finally { setSuggesting(false); }
  }

  useEffect(() => {
    if (!viewerToken || !autoCoach || suggesting) return;
    const latestProspectTurn = [...lines].reverse().find((line) => line.final && line.speaker === "other party" && line.text.trim());
    if (!latestProspectTurn || lastAutoCoachTurn.current === latestProspectTurn.id) return;
    lastAutoCoachTurn.current = latestProspectTurn.id;
    const timer = window.setTimeout(() => void suggest(latestProspectTurn), 900);
    return () => window.clearTimeout(timer);
  }, [lines, autoCoach, viewerToken, suggesting]);

  const selectedMarket = MARKETS.find((item) => item.code === market)?.name ?? market;
  return <section className="phone-connector regional-twilio-connector">
    <div className="phone-connector-heading"><div><strong>Twilio international calling</strong><p>Twilio rings your phone, then connects the saved prospect. Live captions and AI assistance are optional.</p></div>
      <span className={`integration-pill ${status?.connected ? "connected" : ""}`}>{status?.connected ? `Twilio ${market} connected` : "Twilio not connected"}</span></div>
    <div className="selected-call-market">Selected market: <strong>{selectedMarket}</strong></div>
    {error && <div className="research-error" role="alert">{error}</div>}
    {notice && <div className="prospect-notice" role="status">{notice}</div>}
    {status?.connected && <div className="phone-configured"><span>{selectedMarket} · Your phone: {status.agent_number} · Caller ID: {status.caller_id}</span><div className="crm-actions"><button className="load-button" type="button" onClick={() => setOpen((value) => !value)}>Update setup</button><button className="load-button" type="button" onClick={() => void disconnect()} disabled={busy}>Disconnect</button></div></div>}
    {(!status?.connected || open) && <form className="crm-connect-form" onSubmit={(event) => void save(event)}>
      {!status?.connected && <strong className="provider-connect-prompt">Connect Twilio to enable the {selectedMarket} in-app call button</strong>}
      <label>Twilio Account SID<input value={accountSid} onChange={(event) => setAccountSid(event.target.value)} autoComplete="off" required /></label>
      <label>Twilio Auth Token<input type="password" value={authToken} onChange={(event) => setAuthToken(event.target.value)} autoComplete="new-password" required /></label>
      <label>Your phone to ring first<input type="tel" value={agentNumber} onChange={(event) => setAgentNumber(event.target.value)} placeholder="+919876543210" required /></label>
      <label>Twilio caller ID for {selectedMarket}<input type="tel" value={callerId} onChange={(event) => setCallerId(event.target.value)} placeholder={market === "US" ? "+12025550123" : market === "GB" ? "+442079460000" : "+60312345678"} required /></label>
      <small>Twilio checks the caller ID against this account before saving. Malaysia does not accept verified personal caller IDs for calls into Malaysia, so this market requires a Twilio-owned number; a local Malaysian number may also require local company documents and address proof. Credentials are encrypted and stored for this client only. Twilio call legs and live transcription may both incur usage charges.</small>
      <button className="apply-button" type="submit" disabled={busy}>{busy ? "Saving…" : `Save Twilio ${market} connection`}</button>
    </form>}
    {status?.connected && <div className="phone-call-actions">
      <div><strong>{account?.company_name ?? "Choose a saved prospect"}</strong><span>{contact?.phone ?? "This contact has no phone number"}</span></div>
      <label className="phone-consent"><input type="checkbox" checked={outboundConfirmed} onChange={(event) => setOutboundConfirmed(event.target.checked)} /> I am allowed to place this business call and will follow the target country's calling rules.</label>
      <label className="phone-consent"><input type="checkbox" checked={liveAssistant} onChange={(event) => { setLiveAssistant(event.target.checked); setConsent(false); }} disabled={!status.live_stream_ready || Boolean(viewerToken)} /> Add optional live captions and AI call assistance (may incur extra OpenAI usage charges).</label>
      {!status.live_stream_ready && <small>Live assistance is unavailable until the secure audio connection and OpenAI key are configured. You can still place a regular call through Twilio.</small>}
      {liveAssistant && <label className="phone-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I have given the required notice and have permission to stream and transcribe this call.</label>}
      <small>Check the target country's calling and Do Not Call requirements before placing a marketing call. Audio is streamed only when the optional live-assistant box is checked.</small>
      <button className="apply-button" type="button" onClick={() => void dial()} disabled={busy || !account || !contact?.phone || contact.do_not_contact || !outboundConfirmed || (liveAssistant && !consent) || Boolean(viewerToken)}>{busy ? "Starting call…" : liveAssistant ? `Call through Twilio ${market} + live assistant` : `Call through Twilio ${market} (no assistant)`}</button>
      {viewerToken && <button className="load-button" type="button" onClick={() => void stop()}>Stop assistant and clear captions</button>}
      {viewerToken && <div className="live-transcript" aria-live="polite"><div className="live-transcript-heading"><b>Live captions</b><span>{callState === "waiting" ? "Waiting for you to answer" : callState === "listening" ? "Listening to both call tracks" : callState}</span></div>
        {lines.length === 0 ? <p>Captions appear after you answer and the prospect joins. They stay in temporary memory and are cleared when you stop the assistant.</p> : lines.map((line) => <p className={line.final ? "" : "partial"} key={line.id}><b>{line.speaker ?? "Call"}:</b> {line.text}</p>)}
        <label className="phone-consent"><input type="checkbox" checked={autoCoach} onChange={(event) => setAutoCoach(event.target.checked)} disabled={callState !== "listening"} /> Automatically coach me after each prospect turn</label>
        <button className="apply-button" type="button" onClick={() => void suggest()} disabled={suggesting || !lines.some((line) => line.final && line.text.trim())}>{suggesting ? "Preparing suggestion…" : autoCoach ? "Analyze conversation now" : "Suggest a reply from conversation"}</button>
        <small>{autoCoach ? "When the prospect finishes speaking, the latest conversation is sent for a short coaching suggestion. This can use OpenAI credits. Suggestions remain on screen for you to review; nothing is spoken automatically." : "Only the recent completed captions and this client's saved context are sent when you request a suggestion. OpenAI API use may be billed."}</small>
        {suggestion && <article className="live-call-suggestion"><div><b>Possible reply</b><p>{suggestion.suggested_reply}</p></div><div><b>Next question</b><p>{suggestion.next_question}</p></div><div><b>Call stage · next action</b><p>{suggestion.conversation_stage.replaceAll("_", " ")} · {suggestion.recommended_action.replaceAll("_", " ")}</p></div><div><b>Qualification signal</b><p>{suggestion.qualification_signal}</p></div><div><b>Why this fits</b><p>{suggestion.brief_reason}</p></div><div className="live-call-caution"><b>Review</b><p>{suggestion.caution}</p></div></article>}
      </div>}
    </div>}
  </section>;
}
