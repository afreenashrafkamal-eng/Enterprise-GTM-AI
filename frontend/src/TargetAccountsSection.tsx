import { useCallback, useEffect, useState, type FormEvent } from "react";

const API_URL = "http://127.0.0.1:8000";

type QualificationStatus = "new" | "qualified" | "disqualified";

type AccountForm = {
  company_name: string;
  website: string;
  industry: string;
  employee_range: string;
  location: string;
  notes: string;
};

type TargetAccount = AccountForm & {
  id: string;
  organization_id: string;
  qualification_status: QualificationStatus;
  created_at: string;
  updated_at: string;
};

type Props = {
  organizationId: string;
};

const emptyForm: AccountForm = {
  company_name: "",
  website: "",
  industry: "",
  employee_range: "",
  location: "",
  notes: "",
};

export default function TargetAccountsSection({ organizationId }: Props) {
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [accounts, setAccounts] = useState<TargetAccount[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Create a workspace to begin.");

  const loadAccounts = useCallback(async () => {
    if (!organizationId.trim()) {
      setAccounts([]);
      setNotice("Create a workspace before adding target companies.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/organizations/${organizationId.trim()}/target-accounts`,
      );
      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(
          Array.isArray(data) ? `The server returned ${response.status}.` :
            data.detail ?? `The server returned ${response.status}.`,
        );
      }

      setAccounts(data as TargetAccount[]);
      setNotice("Target companies loaded.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load target companies. Check the backend connection.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  function updateField(field: keyof AccountForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId.trim()) {
      setError("Create a workspace before adding a target company.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/organizations/${organizationId.trim()}/target-accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            company_name: form.company_name.trim(),
            website: form.website.trim() || null,
            industry: form.industry.trim() || null,
            employee_range: form.employee_range.trim() || null,
            location: form.location.trim() || null,
            notes: form.notes.trim() || null,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setForm(emptyForm);
      await loadAccounts();
      setNotice(`${data.company_name} was added to your target list.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not add the target company.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    accountId: string,
    qualificationStatus: QualificationStatus,
  ) {
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/organizations/${organizationId.trim()}/target-accounts/${accountId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qualification_status: qualificationStatus }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setAccounts((current) =>
        current.map((account) =>
          account.id === accountId ? (data as TargetAccount) : account,
        ),
      );
      setNotice("Target company status updated.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update the target company.",
      );
    }
  }

  const visibleAccounts = accounts.filter((account) => {
    const searchText = search.trim().toLowerCase();
    const matchesSearch =
      !searchText ||
      [account.company_name, account.industry, account.location]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchText));

    const matchesStatus =
      !statusFilter || account.qualification_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <section className="form-card target-accounts-section" id="target-accounts">
      <div className="card-heading">
        <div>
          <h2>Target companies</h2>
          <p>Add companies you may want to research and qualify for outreach.</p>
        </div>
        <span className="draft-badge">{accounts.length} SAVED</span>
      </div>

      <form className="target-account-form" onSubmit={addAccount}>
        <div className="form-grid">
          <div className="field full-width">
            <label htmlFor="target-company-name">Company name</label>
            <input
              id="target-company-name"
              value={form.company_name}
              onChange={(event) => updateField("company_name", event.target.value)}
              maxLength={200}
              placeholder="e.g. Example Software"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="target-company-website">Website</label>
            <input
              id="target-company-website"
              type="url"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="field">
            <label htmlFor="target-company-industry">Industry</label>
            <input
              id="target-company-industry"
              value={form.industry}
              onChange={(event) => updateField("industry", event.target.value)}
              placeholder="e.g. B2B SaaS"
            />
          </div>

          <div className="field">
            <label htmlFor="target-company-size">Employee range</label>
            <input
              id="target-company-size"
              value={form.employee_range}
              onChange={(event) =>
                updateField("employee_range", event.target.value)
              }
              placeholder="e.g. 50–200"
            />
          </div>

          <div className="field">
            <label htmlFor="target-company-location">Location</label>
            <input
              id="target-company-location"
              value={form.location}
              onChange={(event) => updateField("location", event.target.value)}
              placeholder="e.g. United States"
            />
          </div>

          <div className="field full-width">
            <label htmlFor="target-company-notes">Notes</label>
            <textarea
              id="target-company-notes"
              rows={3}
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Why might this company fit your ideal customer profile?"
            />
          </div>
        </div>

        <div className="form-footer">
          <p className="notice" role="status">
            {notice}
          </p>
          <button className="save-button" type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add target company"}
          </button>
        </div>
      </form>

      {error && (
        <div className="research-error" role="alert">
          {error}
        </div>
      )}

      <div className="target-account-toolbar">
        <input
          aria-label="Search target companies"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by company, industry, or location"
        />
        <select
          aria-label="Filter by qualification status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="qualified">Qualified</option>
          <option value="disqualified">Disqualified</option>
        </select>
      </div>

      {loading ? (
        <p className="target-account-empty">Loading target companies…</p>
      ) : visibleAccounts.length === 0 ? (
        <p className="target-account-empty">
          No target companies yet. Add one above to start your list.
        </p>
      ) : (
        <div className="target-account-list">
          {visibleAccounts.map((account) => (
            <article className="target-account-row" key={account.id}>
              <div className="target-account-details">
                <h3>{account.company_name}</h3>
                <p>
                  {[account.industry, account.employee_range, account.location]
                    .filter(Boolean)
                    .join(" · ") || "No company details added yet"}
                </p>
                {account.website && <span>{account.website}</span>}
                {account.notes && <p>{account.notes}</p>}
              </div>

              <select
                aria-label={`Qualification status for ${account.company_name}`}
                value={account.qualification_status}
                onChange={(event) =>
                  void changeStatus(
                    account.id,
                    event.target.value as QualificationStatus,
                  )
                }
              >
                <option value="new">New</option>
                <option value="qualified">Qualified</option>
                <option value="disqualified">Disqualified</option>
              </select>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}