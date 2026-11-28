import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { apiFetch, API_URL } from "./api";
import { createXlsx, workbookToRows } from "./xlsx";

type QualificationStatus = "new" | "qualified" | "disqualified";

type AccountForm = {
  company_name: string;
  website: string;
  industry: string;
  employee_range: string;
  location: string;
  notes: string;
  outreach_reason: string;
  evidence_url: string;
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
  outreach_reason: "",
  evidence_url: "",
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
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<TargetAccount[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
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
      const response = await apiFetch(
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

  useEffect(() => {
    setForm(emptyForm);
    setEditingAccountId(null);
  }, [organizationId]);

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
      const endpoint = `${API_URL}/organizations/${organizationId.trim()}/target-accounts`;
      const response = await apiFetch(
        editingAccountId ? `${endpoint}/${editingAccountId}` : endpoint,
        {
          method: editingAccountId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            company_name: form.company_name.trim(),
            website: form.website.trim() || null,
            industry: form.industry.trim() || null,
            employee_range: form.employee_range.trim() || null,
            location: form.location.trim() || null,
            notes: form.notes.trim() || null,
            outreach_reason: form.outreach_reason.trim() || null,
            evidence_url: form.evidence_url.trim() || null,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setForm(emptyForm);
      const wasEditing = editingAccountId !== null;
      setEditingAccountId(null);
      await loadAccounts();
      setNotice(wasEditing
        ? `${data.company_name} was updated.`
        : `${data.company_name} was added to your target list.`);
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
      const isExcel = /\.xlsx$/i.test(file.name);
      const rows = isExcel
        ? workbookToRows(await file.arrayBuffer())
        : parseCsv(await file.text());
      const fileType = isExcel ? "Excel workbook" : "CSV";

      if (rows.length < 2) {
        throw new Error(`The ${fileType} needs a header row and at least one company row.`);
      }

      const headers = rows[0].map((header, index) =>
        (index === 0 ? header.replace(/^\uFEFF/, "") : header)
          .trim()
          .toLowerCase(),
      );

      const companyNameIndex = headers.indexOf("company_name");
      if (companyNameIndex === -1) {
        throw new Error(`The ${fileType} must include a "company_name" column.`);
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
            outreach_reason: valueAt("outreach_reason"),
            evidence_url: valueAt("evidence_url"),
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
          : "Could not read that company list file.",
      );
    } finally {
      event.currentTarget.value = "";
    }
  }

  function downloadCsvTemplate() {
    const template = [
      "company_name,website,industry,employee_range,location,notes,outreach_reason,evidence_url",
      "Northstar Software,,Enterprise SaaS,100-500,United States,Sample target company,,",
    ].join("\r\n");

    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "target_companies_template.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadExcelTemplate() {
    const templateRows = [
      ["company_name", "website", "industry", "employee_range", "location", "notes", "outreach_reason", "evidence_url"],
      ["Northstar Software", "", "Enterprise SaaS", "100-500", "United States", "Sample target company", "", ""],
    ];
    const url = URL.createObjectURL(createXlsx(templateRows));
    const link = document.createElement("a");
    link.href = url;
    link.download = "target_companies_template.xlsx";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function exportWorkspace(format: "csv" | "xlsx") {
    if (!organizationId.trim()) return;
    setExporting(true);
    setError("");
    setCsvMessage("");
    try {
      const contactLists = await Promise.all(accounts.map(async (account) => {
        const response = await apiFetch(
          `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts/${encodeURIComponent(account.id)}/contacts`,
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail ?? `Could not export contacts for ${account.company_name}.`);
        return { account, contacts: Array.isArray(data) ? data as {
          first_name: string; last_name: string | null; job_title: string | null;
          email: string | null; phone: string | null; linkedin_url: string | null;
          source_url: string | null; email_status: string; qualification_status: string;
          do_not_contact: boolean;
        }[] : [] };
      }));
      const headers = [
        "company_name", "website", "industry", "employee_range", "location", "qualification_status",
        "notes", "outreach_reason", "evidence_url", "contact_first_name", "contact_last_name",
        "contact_job_title", "contact_email", "contact_email_status", "contact_phone",
        "contact_linkedin_url", "contact_source_url", "contact_qualification_status", "contact_do_not_contact",
      ];
      const csvCell = (value: unknown) => {
        let text = value == null ? "" : String(value);
        if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
        return `"${text.replaceAll('"', '""')}"`;
      };
      const rows = contactLists.flatMap(({ account, contacts }) => (contacts.length ? contacts : [null]).map((contact) => [
        account.company_name, account.website, account.industry, account.employee_range, account.location,
        account.qualification_status, account.notes, account.outreach_reason, account.evidence_url,
        contact?.first_name, contact?.last_name, contact?.job_title, contact?.email, contact?.email_status,
        contact?.phone, contact?.linkedin_url, contact?.source_url, contact?.qualification_status, contact?.do_not_contact,
      ]));
      const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      const blob = format === "xlsx"
        ? createXlsx([headers, ...rows], "Companies and contacts")
        : new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `target_companies_and_contacts.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setCsvMessage(`Exported ${accounts.length} companies and their saved contacts as ${format.toUpperCase()}. Email status and source links are included.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not export client data.");
    } finally {
      setExporting(false);
    }
  }

  async function importCsvAccounts() {
    if (!organizationId.trim()) {
      setError("Create a workspace before importing target companies.");
      return;
    }

    if (csvRows.length === 0) {
      setError("Choose a valid CSV or Excel file before importing.");
      return;
    }

    setImporting(true);
    setError("");

    let imported = 0;
    let failed = 0;

    for (const account of csvRows) {
      try {
        const response = await apiFetch(
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
              outreach_reason: account.outreach_reason.trim() || null,
              evidence_url: account.evidence_url.trim() || null,
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
      const response = await apiFetch(
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

  function editAccount(account: TargetAccount) {
    setForm({
      company_name: account.company_name,
      website: account.website ?? "",
      industry: account.industry ?? "",
      employee_range: account.employee_range ?? "",
      location: account.location ?? "",
      notes: account.notes ?? "",
      outreach_reason: account.outreach_reason ?? "",
      evidence_url: account.evidence_url ?? "",
    });
    setEditingAccountId(account.id);
    setNotice(`Editing ${account.company_name}. Save your changes when ready.`);
    document.getElementById("target-accounts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setForm(emptyForm);
    setEditingAccountId(null);
    setNotice("Changes discarded.");
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
          <p>Add companies you may want to research and qualify for outreach. Record a current account reason and its public source to reuse them in pilot drafts.</p>
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

          <div className="field full-width">
            <label htmlFor="target-company-outreach-reason">Current reason this account may be relevant</label>
            <textarea
              id="target-company-outreach-reason"
              rows={3}
              value={form.outreach_reason}
              onChange={(event) => updateField("outreach_reason", event.target.value)}
              maxLength={2000}
              placeholder="Summarize a recent, specific public fact that connects this account to your offer."
            />
          </div>

          <div className="field full-width">
            <label htmlFor="target-company-evidence-url">Public source for that reason</label>
            <input
              id="target-company-evidence-url"
              type="url"
              value={form.evidence_url}
              onChange={(event) => updateField("evidence_url", event.target.value)}
              maxLength={2000}
              placeholder="https://example.com/company-update"
            />
          </div>
        </div>

        <div className="form-footer">
          <p className="notice" role="status">
            {notice}
          </p>
          <button className="save-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : editingAccountId ? "Save company changes" : "Add target company"}
          </button>
          {editingAccountId && <button className="load-button" type="button" onClick={cancelEdit}>Cancel edit</button>}
        </div>
      </form>

      <div className="org-field csv-import-area">
        <label htmlFor="target-company-csv">Import companies from CSV or Excel</label>
        <div className="org-row">
          <input
            id="target-company-csv"
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
            CSV template
          </button>
          <button
            className="load-button"
            type="button"
            onClick={downloadExcelTemplate}
            disabled={importing}
          >
            Excel template
          </button>
          <button
            className="load-button"
            type="button"
            onClick={() => void exportWorkspace("csv")}
            disabled={exporting || importing || !organizationId.trim()}
          >
            {exporting ? "Preparing export…" : "Export CSV"}
          </button>
          <button
            className="load-button"
            type="button"
            onClick={() => void exportWorkspace("xlsx")}
            disabled={exporting || importing || !organizationId.trim()}
          >
            {exporting ? "Preparing export…" : "Export Excel"}
          </button>
        </div>
        <span className="field-hint">
          CSV and .xlsx files need a company_name column. Other supported columns: website,
          industry, employee_range, location, notes, outreach_reason, evidence_url. Up to 100 companies per import.
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
                {account.outreach_reason && <p><strong>Outreach reason:</strong> {account.outreach_reason}</p>}
                {account.evidence_url && <a href={account.evidence_url} target="_blank" rel="noreferrer">View evidence source</a>}
              </div>

              <div className="target-account-actions">
                <button className="load-button" type="button" onClick={() => editAccount(account)}>Edit details</button>
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
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
