import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { apiFetch, API_URL } from "./api";

type IcpForm = {
  industries: string;
  employee_range: string;
  revenue_range: string;
  geographic_focus: string;
  buyer_titles: string;
  pain_points: string;
  excluded_segments: string;
};

const emptyProfile: IcpForm = {
  industries: "",
  employee_range: "",
  revenue_range: "",
  geographic_focus: "",
  buyer_titles: "",
  pain_points: "",
  excluded_segments: "",
};

type Props = {
  organizationId: string;
};

export default function IcpSection({ organizationId }: Props) {
  const [profile, setProfile] = useState<IcpForm>(emptyProfile);
  const [profileId, setProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading ideal customer profile…");

  const loadProfile = useCallback(async () => {
    if (!organizationId.trim()) {
      setMessage("Enter an organization ID above to load this profile.");
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${organizationId.trim()}/ideal-customer-profile`,
      );

      if (response.status === 404) {
        setProfile(emptyProfile);
        setProfileId("");
        setMessage("No ideal customer profile yet. Add your target details below.");
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setProfile({
        industries: data.industries ?? "",
        employee_range: data.employee_range ?? "",
        revenue_range: data.revenue_range ?? "",
        geographic_focus: data.geographic_focus ?? "",
        buyer_titles: data.buyer_titles ?? "",
        pain_points: data.pain_points ?? "",
        excluded_segments: data.excluded_segments ?? "",
      });
      setProfileId(data.id ?? "");
      setMessage("Saved ideal customer profile loaded.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not load the profile. ${error.message}`
          : "Could not reach the backend.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  function updateField(field: keyof IcpForm, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId.trim()) {
      setMessage("Enter an organization ID above before saving.");
      return;
    }

    setSaving(true);
    setMessage("Saving ideal customer profile…");

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${organizationId.trim()}/ideal-customer-profile`,
        {
          method: profileId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setProfileId(data.id ?? profileId);
      setMessage("Ideal customer profile saved successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not save the profile. ${error.message}`
          : "Could not save the profile. Check the backend connection.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="ideal-customer" className="form-card icp-card">
      <div className="card-heading">
        <div>
          <h2>Ideal customer profile</h2>
          <p>
            Describe the companies and decision-makers your outbound tool should
            focus on.
          </p>
        </div>
        <span className="draft-badge">
          {profileId ? "SAVED PROFILE" : "DRAFT"}
        </span>
      </div>

      <form onSubmit={saveProfile}>
        <div className="form-grid">
          <div className="field full-width">
            <label htmlFor="icp-industries">Target industries</label>
            <textarea
              id="icp-industries"
              rows={2}
              value={profile.industries}
              onChange={(event) => updateField("industries", event.target.value)}
              placeholder="e.g. B2B SaaS, enterprise software, IT services"
            />
          </div>

          <div className="field">
            <label htmlFor="icp-employees">Company size</label>
            <input
              id="icp-employees"
              value={profile.employee_range}
              onChange={(event) =>
                updateField("employee_range", event.target.value)
              }
              placeholder="e.g. 50–500 employees"
            />
          </div>

          <div className="field">
            <label htmlFor="icp-revenue">Annual revenue</label>
            <input
              id="icp-revenue"
              value={profile.revenue_range}
              onChange={(event) =>
                updateField("revenue_range", event.target.value)
              }
              placeholder="e.g. $10M–$250M"
            />
          </div>

          <div className="field full-width">
            <label htmlFor="icp-geography">Geographic focus</label>
            <input
              id="icp-geography"
              value={profile.geographic_focus}
              onChange={(event) =>
                updateField("geographic_focus", event.target.value)
              }
              placeholder="e.g. United States, Canada, United Kingdom"
            />
          </div>

          <div className="field full-width">
            <label htmlFor="icp-buyers">Buyer roles or job titles</label>
            <textarea
              id="icp-buyers"
              rows={2}
              value={profile.buyer_titles}
              onChange={(event) => updateField("buyer_titles", event.target.value)}
              placeholder="e.g. VP of Sales, Head of Growth, Revenue Operations"
            />
          </div>

          <div className="field full-width">
            <label htmlFor="icp-pain-points">Problems they need to solve</label>
            <textarea
              id="icp-pain-points"
              rows={3}
              value={profile.pain_points}
              onChange={(event) => updateField("pain_points", event.target.value)}
              placeholder="What makes outbound sales difficult for these teams?"
            />
          </div>

          <div className="field full-width">
            <label htmlFor="icp-exclusions">Companies to exclude</label>
            <textarea
              id="icp-exclusions"
              rows={2}
              value={profile.excluded_segments}
              onChange={(event) =>
                updateField("excluded_segments", event.target.value)
              }
              placeholder="e.g. B2C businesses, companies under 10 employees"
            />
          </div>
        </div>

        <div className="form-footer">
          <p className="notice" role="status">{message}</p>
          <div className="icp-actions">
            <button
              className="load-button"
              type="button"
              onClick={() => void loadProfile()}
              disabled={loading}
            >
              {loading ? "Loading…" : "Reload"}
            </button>
            <button className="save-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save ideal customer"}
              {!saving && <span>→</span>}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
