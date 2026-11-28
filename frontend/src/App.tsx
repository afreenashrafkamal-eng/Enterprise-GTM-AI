import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import "./App.css";
import IcpSection from "./IcpSection";
import OrganizationSetup from "./OrganizationSetup";
import TargetAccountsSection from "./TargetAccountsSection";
import CrmConnector from "./CrmConnector";
import TargetContactsSection from "./TargetContactsSection";
import OutboundStrategySection from "./OutboundStrategySection";
import ProspectAgent from "./ProspectAgent";
import MessagingChannelPanel from "./MessagingChannel";
import ReportsDashboard from "./ReportsDashboard";
import MarketingIntelligence from "./MarketingIntelligence";
import CallLogSection from "./CallLogSection";
import SignIn from "./SignIn";
import { apiFetch, API_URL } from "./api";
const ORGANIZATION_STORAGE_KEY = "enterprise-gtm-organization-id";

type ProfileForm = {
  website: string;
  company_description: string;
  industry: string;
  products_services: string;
  target_market: string;
  company_size: string;
};

type ResearchSource = {
  title: string;
  url: string;
};

type ResearchResult = {
  summary: string;
  suggested_profile: ProfileForm;
  sources: ResearchSource[];
};

type CurrentUser = {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
};

type WorkspacePage = "home" | "marketing-intelligence" | "prospecting" | "messaging" | "calling" | "company" | "crm" | "reports";
type MessagingChannel = "email" | "linkedin" | "whatsapp";

const emptyForm: ProfileForm = {
  website: "",
  company_description: "",
  industry: "",
  products_services: "",
  target_market: "",
  company_size: "",
};

function App() {
  const [organizationId, setOrganizationId] = useState(
    () => localStorage.getItem(ORGANIZATION_STORAGE_KEY) ?? "",
  );
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [profileId, setProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("Create or load a workspace to begin.");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(
    null,
  );
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activePage, setActivePage] = useState<WorkspacePage>("home");
  const [messagingChannel, setMessagingChannel] = useState<MessagingChannel>("email");
  const [prospectSeedPrompt, setProspectSeedPrompt] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const response = await apiFetch(`${API_URL}/auth/me`);
        if (!response.ok) {
          if (active) setCurrentUser(null);
          return;
        }

        const user = (await response.json()) as CurrentUser;
        const organizationsResponse = await apiFetch(`${API_URL}/organizations`);
        const organizations = organizationsResponse.ok
          ? ((await organizationsResponse.json()) as { id: string }[])
          : [];
        const savedOrganizationId = localStorage.getItem(
          ORGANIZATION_STORAGE_KEY,
        );
        const activeOrganizationId = organizations.some(
          (organization) => organization.id === savedOrganizationId,
        )
          ? savedOrganizationId ?? ""
          : organizations[0]?.id ?? "";

        if (!active) return;
        if (activeOrganizationId) {
          localStorage.setItem(ORGANIZATION_STORAGE_KEY, activeOrganizationId);
        } else {
          localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
        }
        setOrganizationId(activeOrganizationId);
        setCurrentUser(user);
      } catch {
        if (active) setCurrentUser(null);
      } finally {
        if (active) setAuthLoading(false);
      }
    }

    void loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!organizationId.trim()) {
      setNotice("Create a workspace or enter an organization ID to load a profile.");
      return;
    }

    setLoading(true);
    setNotice("Loading your company profile…");

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${organizationId.trim()}/company-profile`,
      );

      if (response.status === 404) {
        setForm(emptyForm);
        setProfileId("");
        setNotice("No saved profile found. Enter your company details below.");
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setForm({
        website: data.website ?? "",
        company_description: data.company_description ?? "",
        industry: data.industry ?? "",
        products_services: data.products_services ?? "",
        target_market: data.target_market ?? "",
        company_size: data.company_size ?? "",
      });
      setProfileId(data.id ?? "");
      setResearchResult(null);
      setNotice("Saved company profile loaded.");
    } catch {
      setNotice(
        "Could not reach the backend. Check that it is running at 127.0.0.1:8000.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (currentUser) void loadProfile();
  }, [currentUser, loadProfile]);

  function updateField(field: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function signOut() {
    try {
      await apiFetch(`${API_URL}/auth/logout`, { method: "POST" });
    } catch {
      // Reloading still moves the app to the sign-in screen in Google-auth mode.
    } finally {
      window.location.reload();
    }
  }

  async function researchCompany() {
    if (!organizationId.trim()) {
      setResearchError("Create a workspace or enter an organization ID first.");
      return;
    }

    setResearching(true);
    setResearchError("");
    setResearchResult(null);

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${organizationId.trim()}/company-profile/research`,
        { method: "POST", signal: AbortSignal.timeout(90000) },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setResearchResult(data);
    } catch (error) {
      setResearchError(
        error instanceof Error
          ? error.message
          : "Research could not be completed. Check the backend connection.",
      );
    } finally {
      setResearching(false);
    }
  }

  function applySuggestions() {
    if (!researchResult) return;

    setForm((current) => ({
      ...current,
      ...researchResult.suggested_profile,
    }));
    setNotice("Suggestions added to the form. Review and save when ready.");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId.trim()) {
      setNotice("Create a workspace or enter an organization ID before saving.");
      return;
    }

    setSaving(true);
    setNotice("Saving your company profile…");

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${organizationId.trim()}/company-profile`,
        {
          method: profileId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setProfileId(data.id ?? profileId);
      setNotice("Company profile saved successfully.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Could not save the profile. ${error.message}`
          : "Could not save the profile. Check the backend connection.",
      );
    } finally {
      setSaving(false);
    }
  }

  function pageClass(page: WorkspacePage) {
    return `workspace-page${activePage === page ? " is-visible" : ""}`;
  }

  function handleOrganizationIdChange(value: string) {
    setOrganizationId(value);

    if (value.trim()) {
      localStorage.setItem(ORGANIZATION_STORAGE_KEY, value.trim());
    } else {
      localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
    }
  }

  if (authLoading) {
    return <div className="auth-loading">Loading your GTM workspace…</div>;
  }

  if (!currentUser) {
    return <SignIn />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>Enterprise GTM</strong>
            <span>AI workspace</span>
          </div>
        </div>

        <div className="workspace-label">AGENCY WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Workspace pages">
        {([
          ["home", "Home", "⌂"],
          ["marketing-intelligence", "AI marketing intelligence", "⌕"],
          ["prospecting", "AI prospecting", "✧"],
          ["messaging", "Messaging automation", "✉"],
          ["calling", "Calling by market", "☎"],
          ["company", "Company & ICP", "◎"],
          ["crm", "CRM integrations", "▤"],
          ["reports", "Agency reports", "↗"],
        ] as [WorkspacePage, string, string][]).map(([page, label, icon]) => (
          <button
            key={page}
            className={`nav-item research-nav${activePage === page ? " active" : ""}`}
            type="button"
            aria-current={activePage === page ? "page" : undefined}
            onClick={() => { setActivePage(page); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </button>
        ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <span>{currentUser.email === "local-admin@localhost" ? "Local development" : "Google sign-in"}</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span>
            Agency workspace <span className="crumb">/</span> {activePage === "home" ? "Home" : activePage === "marketing-intelligence" ? "AI marketing intelligence" : activePage === "messaging" ? "Messaging automation" : activePage === "calling" ? "Calling by market" : activePage === "company" ? "Company & ICP" : activePage === "crm" ? "CRM integrations" : activePage === "reports" ? "Agency reports" : "AI prospecting"}
          </span>
          <div className="topbar-account">
            {currentUser.email === "local-admin@localhost" ? (
              <span className="local-badge"><span /> Local admin</span>
            ) : (
              <>
                <span className="local-badge"><span /> {currentUser.display_name ?? currentUser.email}</span>
                <button className="logout-button" type="button" onClick={() => void signOut()}>
                  Sign out
                </button>
              </>
            )}
          </div>
        </header>

        <section className="page">
          <div className={pageClass("home")}>
            <div className="eyebrow"><span /> AGENCY COMMAND CENTER</div>
            <h1>What would you like to work on?</h1>
            <p className="intro">Choose the agency or client workspace, then go straight to prospect research, reviewed outreach, calling, or performance.</p>
            <div className="home-workspaces"><OrganizationSetup /></div>
            <div className="home-section-heading"><div><span className="research-kicker">YOUR WORKSPACE</span><h2>Go to a work area</h2><p>Each client’s company profile, prospects, emails, and calls stay in its own workspace.</p></div></div>
            <div className="workspace-launch-grid">
              {([
                ["marketing-intelligence", "AI marketing intelligence", "Discover demand signals, customer segments, competitor gaps, and campaign opportunities for the agency or selected client.", "Build market brief", "⌕"],
                ["prospecting", "AI prospecting", "Research companies, buying signals, decision-makers, and public contact details for the selected client.", "Start prospecting", "✧"],
                ["messaging", "Messaging automation", "Manage personalized outreach by email, LinkedIn, or WhatsApp from one place.", "Open messaging", "✉"],
                ["calling", "Calling by market", "Open the call queue and select a provider for India, the US, the UK, Malaysia, or Gulf markets.", "Open calling", "☎"],
                ["company", "Company & ICP", "Set the agency or client offer, ideal customer, buyer roles, and exclusions.", "Manage profile", "◎"],
                ["crm", "CRM integrations", "Connect HubSpot and import or export client records.", "Open CRM", "▤"],
                ["reports", "Agency & client reports", "See the agency roll-up or review activity for each individual client.", "View reports", "↗"],
              ] as [WorkspacePage, string, string, string, string][]).map(([page, title, description, action, icon]) => (
                <button className="workspace-launch-card" key={page} type="button" onClick={() => { setActivePage(page); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <span className="workspace-launch-icon">{icon}</span><strong>{title}</strong><p>{description}</p><span className="workspace-launch-action">{action} <b>→</b></span>
                </button>
              ))}
            </div>
          </div>

          <div className={`${pageClass("prospecting")} ${activePage === "messaging" ? "is-visible" : ""}`}>
            {activePage === "messaging" ? <>
              <div className="eyebrow"><span /> OUTREACH CHANNELS</div>
              <h1>Messaging automation</h1>
              <p className="intro">Choose a channel. Email supports reviewed sending; LinkedIn and WhatsApp provide manual handoff until their official sending connections are configured.</p>
              <nav className="category-tabs" aria-label="Messaging channels" role="tablist">
                {([ ["email", "Email"], ["linkedin", "LinkedIn"], ["whatsapp", "WhatsApp"] ] as [MessagingChannel, string][]).map(([channel, label]) => (
                  <button key={channel} type="button" role="tab" aria-selected={messagingChannel === channel} className={messagingChannel === channel ? "active" : ""} onClick={() => setMessagingChannel(channel)}>{label}</button>
                ))}
              </nav>
              <div className={messagingChannel === "email" ? "channel-view" : "channel-view is-hidden"}>
                <h2>Email automation</h2>
                <p className="section-intro">Review researched drafts and confirm each message before sending.</p>
              </div>
            </> : <>
              <div className="eyebrow"><span /> PROSPECT RESEARCH</div>
              <h1>Find the right companies and decision-makers</h1>
              <p className="intro">Run signal-led research for the selected client, then qualify and save the accounts and contacts.</p>
              <nav className="category-tabs" aria-label="Prospecting categories">
                {([["prospect-agent", "AI research"], ["outbound-strategy", "Account-based marketing"], ["target-accounts", "Target companies"], ["decision-makers", "Decision-maker contacts"], ["prospect-data-sources", "Research sources"]] as [string, string][]).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{label}</button>
                ))}
              </nav>
            </>}
            <div className={activePage === "messaging" && messagingChannel !== "email" ? "channel-view is-hidden" : "channel-view"}>
              <ProspectAgent organizationId={organizationId} mode={activePage === "messaging" ? "email" : "prospecting"} onGoToProspecting={() => setActivePage("prospecting")} initialPrompt={prospectSeedPrompt} onInitialPromptApplied={() => setProspectSeedPrompt("")} />
            </div>
            {activePage === "messaging" && messagingChannel !== "email" && <MessagingChannelPanel organizationId={organizationId} channel={messagingChannel} />}
            <div className={activePage === "prospecting" ? "prospecting-support" : "prospecting-support is-hidden"}>
              <OutboundStrategySection organizationId={organizationId} />
              <TargetAccountsSection organizationId={organizationId} />
              <TargetContactsSection organizationId={organizationId} />
            </div>
          </div>

          <div className={pageClass("marketing-intelligence")}>
            <div className="eyebrow"><span /> MARKET OPPORTUNITY ENGINE</div>
            <h1>AI marketing intelligence</h1>
            <p className="intro">Find and qualify growth opportunities for your agency or research the market for an onboarded client. Use the resulting segments and signals to start prospecting in that same workspace.</p>
            <MarketingIntelligence organizationId={organizationId} onStartProspecting={(nextPrompt) => { setProspectSeedPrompt(nextPrompt); setActivePage("prospecting"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          </div>

          <div className={pageClass("company")}>
            <div className="eyebrow"><span /> COMPANY ONBOARDING</div>
            <h1>Company and ideal customer</h1>
            <p className="intro">Set up the agency profile or the selected client’s offer, ideal buyers, and target market.</p>

          <div className="form-card" id="company-profile">
            <div className="card-heading">
              <div>
                <h2>Company details</h2>
                <p>Start with the basics. You can update these details anytime.</p>
              </div>
              <span className="draft-badge">
                {profileId ? "SAVED PROFILE" : "DRAFT"}
              </span>
            </div>

            <div className="org-field">
              <label htmlFor="organizationId">Organization ID</label>
              <div className="org-row">
                <input
                  id="organizationId"
                  value={organizationId}
                  onChange={(event) =>
                    handleOrganizationIdChange(event.target.value)
                  }
                  placeholder="Create a workspace or paste an organization ID"
                />
                <button
                  className="load-button"
                  type="button"
                  onClick={() => void loadProfile()}
                  disabled={loading}
                >
                  {loading ? "Loading…" : "Load profile"}
                </button>
              </div>
              <span className="field-hint">
                This links the profile to your organization in the local database.
              </span>
            </div>

            <section className="research-panel" id="research-panel">
              <div className="research-copy">
                <span className="research-kicker">AI-ASSISTED RESEARCH</span>
                <h3>Enrich your company profile</h3>
                <p>
                  Research your product concept and market, then review
                  suggestions before applying them.
                </p>
                <p className="research-disclosure">
                  Research sends your saved profile details to OpenAI and uses
                  web search. API usage charges may apply.
                </p>
              </div>
              <button
                className="research-button"
                type="button"
                onClick={() => void researchCompany()}
                disabled={researching}
              >
                {researching ? "Researching…" : "Research with AI"}
                {!researching && <span>✧</span>}
              </button>
            </section>

            {researchError && (
              <div className="research-error" role="alert">
                {researchError}
              </div>
            )}

            {researchResult && (
              <section className="research-results" aria-live="polite">
                <div className="results-heading">
                  <div>
                    <span className="research-kicker">RESEARCH COMPLETE</span>
                    <h3>Review these suggestions</h3>
                  </div>
                  <button
                    className="apply-button"
                    type="button"
                    onClick={applySuggestions}
                  >
                    Apply suggestions
                  </button>
                </div>

                <p className="research-summary">{researchResult.summary}</p>

                <div className="suggestion-list">
                  {Object.entries(researchResult.suggested_profile).map(
                    ([field, value]) => (
                      <div className="suggestion-item" key={field}>
                        <strong>
                          {field
                            .replaceAll("_", " ")
                            .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                        </strong>
                        <span>{value || "No supported suggestion found."}</span>
                      </div>
                    ),
                  )}
                </div>

                {researchResult.sources.length > 0 && (
                  <div className="source-list">
                    <strong>Sources</strong>
                    {researchResult.sources.map((source) => (
                      <a
                        href={source.url}
                        key={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                )}
              </section>
            )}

            <form onSubmit={saveProfile}>
              <div className="form-grid">
                <div className="field full-width">
                  <label htmlFor="website">Company website</label>
                  <input
                    id="website"
                    type="url"
                    value={form.website}
                    onChange={(event) => updateField("website", event.target.value)}
                    placeholder="Optional — add a website when you have one"
                  />
                </div>

                <div className="field full-width">
                  <label htmlFor="company_description">Company description</label>
                  <textarea
                    id="company_description"
                    rows={4}
                    value={form.company_description}
                    onChange={(event) =>
                      updateField("company_description", event.target.value)
                    }
                    placeholder="What are you building? Who will it help?"
                  />
                </div>

                <div className="field">
                  <label htmlFor="industry">Industry</label>
                  <input
                    id="industry"
                    value={form.industry}
                    onChange={(event) => updateField("industry", event.target.value)}
                    placeholder="e.g. B2B SaaS / SalesTech"
                  />
                </div>

                <div className="field">
                  <label htmlFor="company_size">Company size</label>
                  <input
                    id="company_size"
                    value={form.company_size}
                    onChange={(event) =>
                      updateField("company_size", event.target.value)
                    }
                    placeholder="Optional"
                  />
                </div>

                <div className="field full-width">
                  <label htmlFor="products_services">Products and services</label>
                  <textarea
                    id="products_services"
                    rows={3}
                    value={form.products_services}
                    onChange={(event) =>
                      updateField("products_services", event.target.value)
                    }
                    placeholder="What will the product help customers do?"
                  />
                </div>

                <div className="field full-width">
                  <label htmlFor="target_market">Target market</label>
                  <textarea
                    id="target_market"
                    rows={3}
                    value={form.target_market}
                    onChange={(event) =>
                      updateField("target_market", event.target.value)
                    }
                    placeholder="Which companies or teams might use it?"
                  />
                </div>
              </div>

              <div className="form-footer">
                <p className="notice" role="status">
                  {notice}
                </p>
                <button className="save-button" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save company profile"}
                  {!saving && <span>→</span>}
                </button>
              </div>
            </form>
          </div>

          <IcpSection organizationId={organizationId} />
          </div>

          <div className={pageClass("crm")}>
            <div className="eyebrow"><span /> CLIENT DATA</div><h1>CRM integrations</h1><p className="intro">Connect a CRM for the selected client. Sourced decision-maker records are managed under AI prospecting.</p>
            <CrmConnector organizationId={organizationId} />
          </div>

          <div className={pageClass("calling")}>
            <div className="eyebrow"><span /> MANUAL OUTREACH</div><h1>Calling by market</h1><p className="intro">Choose a saved contact and the country-specific provider. Live call assistance is optional when the provider supports it.</p>
            <CallLogSection organizationId={organizationId} />
          </div>

          <div className={pageClass("reports")}>
            <div className="eyebrow"><span /> AGENCY + CLIENT VIEW</div><h1>Agency reports</h1><p className="intro">Compare activity across the agency, then inspect separate results and recommendations for each client.</p>
            <ReportsDashboard activeOrganizationId={organizationId} />
          </div>

          <p className="privacy-note">
            Your profiles are saved to your local development database.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
