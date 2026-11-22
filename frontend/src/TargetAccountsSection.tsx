import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if (
      (character === "\n" || character === "\r") &&
      !insideQuotes
    ) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

export default function TargetAccountsSection({ organizationId }: Props) {
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [accounts, setAccounts] = useState<TargetAccount[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csvRows, setCsvRows] = useState<AccountForm[]>([]);
  const [csvMessage, setCsvMessage] = useState("");
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
          Array.isArray(data)
            ? `The server returned ${response.status}.`
            : data.detail ?? `The server returned ${response.status}.`,
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

  async function prepareCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setCsvRows([]);
    setCsvMessage("");
    setError("");

    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length < 2) {
        throw new Error("The CSV needs a header row and at least one company row.");
      }

      const headers = rows[0].map((header, index) =>
        (index === 0 ? header.replace(/^\uFEFF/, "") : header)
          .trim()
          .toLowerCase(),
      );

      const companyNameIndex = headers.indexOf("company_name");
      if (companyNameIndex === -1) {
        throw new Error('The CSV must include a "company_name" column.');
      }

      const fieldIndex = (field: keyof AccountForm) => headers.indexOf(field);

      const preparedRows = rows
        .slice(1)
        .map((values) => {
          const valueAt = (field: keyof AccountForm) => {
            const index = fieldIndex(field);
            return index >= 0 ? values[index] ?? "" : "";
          };

          return {
            company_name: valueAt("company_name"),
            website: valueAt("website"),
            industry: valueAt("industry"),
            employee_range: valueAt("employee_range"),
            location: valueAt("location"),
            notes: valueAt("notes"),
          };
        })
        .filter((account) => account.company_name.trim().length > 0);

      if (preparedRows.length === 0) {
        throw new Error("No rows with a company_name value were found.");
      }

      if (preparedRows.length > 100) {
        throw new Error("Please import 100 companies or fewer at a time.");
      }

      setCsvRows(preparedRows);
      setCsvMessage(
        `${preparedRows.length} companies ready to import. Rows without a company name were skipped.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not read that CSV file.",
      );
    } finally {
      event.currentTarget.value = "";
    }
  }

  function downloadCsvTemplate() {
    const template = [
      "company_name,website,industry,employee_range,location,notes",
      "Northstar Software,,Enterprise SaaS,100-500,United States,Sample target company",
    ].join("\r\n");

    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "target_companies_template.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importCsvAccounts() {
    if (!organizationId.trim()) {
      setError("Create a workspace before importing target companies.");
      return;
    }

    if (csvRows.length === 0) {
      setError("Choose a valid CSV file before importing.");
      return;
    }

    setImporting(true);
    setError("");

    let imported = 0;
    let failed = 0;

    for (const account of csvRows) {
      try {
        const response = await fetch(
          `${API_URL}/organizations/${organizationId.trim()}/target-accounts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...account,
              company_name: account.company_name.trim(),
              website: account.website.trim() || null,
              industry: account.industry.trim() || null,
              employee_range: account.employee_range.trim() || null,
              location: account.location.trim() || null,
              notes: account.notes.trim() || null,
            }),
          },
        );

        if (response.ok) {
          imported += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

    setCsvRows([]);
    await loadAccounts();

    setCsvMessage(
      failed === 0
        ? `${imported} companies imported successfully.`
        : `${imported} companies imported; ${failed} could not be imported.`,
    );
    setImporting(false);
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

      <div className="org-field csv-import-area">
        <label htmlFor="target-company-csv">Import companies from CSV</label>
        <div className="org-row">
          <input
            id="target-company-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void prepareCsv(event)}
          />
          <button
            className="load-button"
            type="button"
            onClick={() => void importCsvAccounts()}
            disabled={importing || csvRows.length === 0}
          >
            {importing
              ? "Importing…"
              : `Import ${csvRows.length || ""} companies`}
          </button>
          <button
            className="load-button"
            type="button"
            onClick={downloadCsvTemplate}
            disabled={importing}
          >
            Download template
          </button>
        </div>
        <span className="field-hint">
          CSV needs a company_name column. Other supported columns: website,
          industry, employee_range, location, notes. Up to 100 companies per import.
        </span>
        {csvMessage && (
          <span className="field-hint" role="status">
            {csvMessage}
          </span>
        )}
      </div>

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