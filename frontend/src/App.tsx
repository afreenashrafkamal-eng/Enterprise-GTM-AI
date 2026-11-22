import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import "./App.css";
import IcpSection from "./IcpSection";

const API_URL = "http://127.0.0.1:8000";
const DEFAULT_ORGANIZATION_ID = "1aa01042-099a-4dcd-915e-8e4f29a368f9";

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

const emptyForm: ProfileForm = {
  website: "",
  company_description: "",
  industry: "",
  products_services: "",
  target_market: "",
  company_size: "",
};

function App() {
  const [organizationId, setOrganizationId] = useState(DEFAULT_ORGANIZATION_ID);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [profileId, setProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("Loading your company profile…");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(
    null,
  );

  const loadProfile = useCallback(async () => {
    if (!organizationId.trim()) {
      setNotice("Enter an organization ID to load a profile.");
      return;
    }

    setLoading(true);
    setNotice("Loading your company profile…");

    try {
      const response = await fetch(
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
    void loadProfile();
  }, [loadProfile]);

  function updateField(field: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function researchCompany() {
    if (!organizationId.trim()) {
      setResearchError("Enter an organization ID before starting research.");
      return;
    }

    setResearching(true);
    setResearchError("");
    setResearchResult(null);

    try {
      const response = await fetch(
        `${API_URL}/organizations/${organizationId.trim()}/company-profile/research`,
        { method: "POST" },
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
      setNotice("Enter an organization ID before saving.");
      return;
    }

    setSaving(true);
    setNotice("Saving your company profile…");

    try {
      const response = await fetch(
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

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
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

        <div className="workspace-label">WORKSPACE</div>

        <button
          className="nav-item active research-nav"
          type="button"
          onClick={() => scrollToSection("company-profile")}
        >
          <span className="nav-icon">◎</span>
          Company profile
        </button>

        <button
          className="nav-item research-nav"
          type="button"
          onClick={() => scrollToSection("research-panel")}
        >
          <span className="nav-icon">✧</span>
          AI research
        </button>

        <button
          className="nav-item research-nav"
          type="button"
          onClick={() => scrollToSection("ideal-customer")}
        >
          <span className="nav-icon">◎</span>
          Ideal customer
        </button>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <span>Local development</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span>
            Workspace <span className="crumb">/</span> Company profile
          </span>
          <span className="local-badge">
            <span /> Private local app
          </span>
        </header>

        <section className="page">
          <div className="eyebrow">
            <span /> COMPANY ONBOARDING
          </div>
          <h1>Tell us about your company</h1>
          <p className="intro">
            Give your GTM workspace the context it needs to understand your
            business and help your team find the right opportunities.
          </p>

          <div className="progress-row">
            <div className="progress-track">
              <div />
            </div>
            <span>
              Step 1 of 3 <b>·</b> Company profile
            </span>
          </div>

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
                  onChange={(event) => setOrganizationId(event.target.value)}
                  placeholder="Paste your organization ID"
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
                <p className="notice" role="status">{notice}</p>
                <button className="save-button" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save company profile"}
                  {!saving && <span>→</span>}
                </button>
              </div>
            </form>
          </div>

          <IcpSection organizationId={organizationId} />

          <p className="privacy-note">
            Your profiles are saved to your local development database.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;