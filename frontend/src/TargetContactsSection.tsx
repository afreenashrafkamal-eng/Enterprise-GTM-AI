import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { apiFetch, API_URL } from "./api";
import ContactChannelActions from "./ContactChannelActions";

type QualificationStatus = "new" | "qualified" | "disqualified";
type EmailStatus = "not_checked" | "verified" | "invalid";

type TargetAccount = {
  id: string;
  company_name: string;
};

type TargetContact = {
  id: string;
  target_account_id: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  source_url: string | null;
  email_status: EmailStatus;
  qualification_status: QualificationStatus;
  do_not_contact: boolean;
};

type ContactForm = {
  first_name: string;
  last_name: string;
  job_title: string;
  email: string;
  phone: string;
  linkedin_url: string;
  source_url: string;
};

type ContactCsvRow = ContactForm & {
  company_name: string;
  email_status: EmailStatus;
  qualification_status: QualificationStatus;
  do_not_contact: boolean;
};

type Props = {
  organizationId: string;
};

const emptyForm: ContactForm = {
  first_name: "",
  last_name: "",
  job_title: "",
  email: "",
  phone: "",
  linkedin_url: "",
  source_url: "",
};

function apiErrorMessage(data: unknown, statusCode: number) {
  if (
    typeof data === "object" &&
    data !== null &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }

  return `The server returned ${statusCode}.`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

export default function TargetContactsSection({ organizationId }: Props) {
  const [accounts, setAccounts] = useState<TargetAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [contacts, setContacts] = useState<TargetContact[]>([]);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [csvRows, setCsvRows] = useState<ContactCsvRow[]>([]);
  const [csvMessage, setCsvMessage] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!organizationId.trim()) {
      setAccounts([]);
      setAccountId("");
      return;
    }

    setLoadingAccounts(true);
    setError("");

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts`,
      );
      const data: unknown = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(apiErrorMessage(data, response.status));
      }

      const loadedAccounts = Array.isArray(data)
        ? (data as TargetAccount[])
        : [];

      setAccounts(loadedAccounts);
      setAccountId((currentId) =>
        loadedAccounts.some((account) => account.id === currentId)
          ? currentId
          : loadedAccounts[0]?.id ?? "",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load target companies.",
      );
    } finally {
      setLoadingAccounts(false);
    }
  }, [organizationId]);

  const loadContacts = useCallback(async () => {
    if (!organizationId.trim() || !accountId) {
      setContacts([]);
      return;
    }

    setLoadingContacts(true);
    setError("");

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts/${encodeURIComponent(accountId)}/contacts`,
      );
      const data: unknown = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(apiErrorMessage(data, response.status));
      }

      setContacts(Array.isArray(data) ? (data as TargetContact[]) : []);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load decision-maker contacts.",
      );
    } finally {
      setLoadingContacts(false);
    }
  }, [organizationId, accountId]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  function updateField(field: keyof ContactForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId.trim() || !accountId) {
      setError("Choose a target company before adding a contact.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts/${encodeURIComponent(accountId)}/contacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim() || null,
            job_title: form.job_title.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            linkedin_url: form.linkedin_url.trim() || null,
            source_url: form.source_url.trim() || null,
          }),
        },
      );

      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, response.status));
      }

      setForm(emptyForm);
      await loadContacts();
      setNotice("Decision-maker contact added.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not add this contact.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateContactStatus(
    contactId: string,
    field: "email_status" | "qualification_status" | "do_not_contact",
    value: EmailStatus | QualificationStatus | boolean,
  ) {
    setError("");

    try {
      const response = await apiFetch(
        `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}/target-accounts/${encodeURIComponent(accountId)}/contacts/${encodeURIComponent(contactId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      );

      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, response.status));
      }

      const updatedContact = data as TargetContact;
      setContacts((current) =>
        current.map((contact) =>
          contact.id === contactId ? updatedContact : contact,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update the contact.",
      );
    }
  }

  async function prepareContactCsv(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setCsvRows([]); setCsvMessage(""); setError("");
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("Choose a CSV with a header and at least one contact row.");
      const headers = rows[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim().toLowerCase());
      const valueAt = (values: string[], ...names: string[]) => {
        const index = names.map((name) => headers.indexOf(name)).find((item) => item >= 0);
        return index === undefined ? "" : values[index] ?? "";
      };
      const prepared = rows.slice(1).map((values): ContactCsvRow => {
        const emailStatus = valueAt(values, "contact_email_status", "email_status").toLowerCase();
        const leadStatus = valueAt(values, "contact_qualification_status", "qualification_status").toLowerCase();
        const dnc = valueAt(values, "contact_do_not_contact", "do_not_contact").toLowerCase();
        return {
          company_name: valueAt(values, "company_name"),
          first_name: valueAt(values, "contact_first_name", "first_name"),
          last_name: valueAt(values, "contact_last_name", "last_name"),
          job_title: valueAt(values, "contact_job_title", "job_title"),
          email: valueAt(values, "contact_email", "email"),
          phone: valueAt(values, "contact_phone", "phone"),
          linkedin_url: valueAt(values, "contact_linkedin_url", "linkedin_url"),
          source_url: valueAt(values, "contact_source_url", "source_url"),
          email_status: (["not_checked", "verified", "invalid"].includes(emailStatus) ? emailStatus : "not_checked") as EmailStatus,
          qualification_status: (["new", "qualified", "disqualified"].includes(leadStatus) ? leadStatus : "new") as QualificationStatus,
          do_not_contact: ["true", "yes", "1"].includes(dnc),
        };
      }).filter((contact) => contact.company_name.trim() && contact.first_name.trim());
      if (prepared.length === 0) throw new Error("Rows need both company_name and contact_first_name.");
      if (prepared.length > 100) throw new Error("Please import 100 contacts or fewer at a time.");
      setCsvRows(prepared);
      setCsvMessage(`${prepared.length} contacts ready. Company names must already exist in this workspace.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that CSV.");
    } finally {
      input.value = "";
    }
  }

  async function importContactCsv() {
    if (!organizationId.trim() || !csvRows.length) return;
    setImportingCsv(true); setError("");
    let imported = 0;
    let skipped = 0;
    const failures: string[] = [];
    const organizationPath = `${API_URL}/organizations/${encodeURIComponent(organizationId.trim())}`;
    try {
      const existingContacts = await Promise.all(accounts.map(async (account) => {
        const response = await apiFetch(`${organizationPath}/target-accounts/${encodeURIComponent(account.id)}/contacts`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiErrorMessage(data, response.status));
        return { account, contacts: Array.isArray(data) ? data as TargetContact[] : [] };
      }));
      const companyByName = new Map(accounts.map((account) => [account.company_name.trim().toLowerCase(), account]));
      const knownPeople = new Map(existingContacts.map(({ account, contacts }) => [account.id, new Set(contacts.map((contact) =>
        (contact.email?.trim().toLowerCase() || `${contact.first_name} ${contact.last_name ?? ""}|${contact.job_title ?? ""}`).toLowerCase(),
      ))]));
      for (const row of csvRows) {
        const account = companyByName.get(row.company_name.trim().toLowerCase());
        if (!account) { skipped += 1; continue; }
        const identity = (row.email.trim().toLowerCase() || `${row.first_name} ${row.last_name}|${row.job_title}`).toLowerCase();
        const known = knownPeople.get(account.id) ?? new Set<string>();
        if (known.has(identity)) { skipped += 1; continue; }
        const response = await apiFetch(`${organizationPath}/target-accounts/${encodeURIComponent(account.id)}/contacts`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { failures.push(`${row.first_name} ${row.last_name}: ${apiErrorMessage(data, response.status)}`); continue; }
        known.add(identity); knownPeople.set(account.id, known); imported += 1;
      }
      setCsvMessage(`Imported ${imported}; skipped ${skipped} unmatched or duplicate contacts.`);
      await loadContacts();
      if (failures.length) setError(failures.slice(0, 4).join(" "));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import contacts.");
    } finally { setImportingCsv(false); }
  }

  const selectedAccount = accounts.find((account) => account.id === accountId);

  return (
    <section className="form-card target-accounts-section" id="decision-makers">
      <div className="card-heading">
        <div>
          <h2>Decision-maker contacts</h2>
          <p>Add and qualify contacts linked to your target companies.</p>
        </div>
        <span className="draft-badge">{contacts.length} SAVED</span>
      </div>

      <div className="org-field">
        <label htmlFor="contactTargetCompany">Target company</label>
        <select
          id="contactTargetCompany"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          disabled={loadingAccounts || accounts.length === 0}
          style={{
            width: "100%",
            height: "39px",
            padding: "0 11px",
            border: "1px solid #dfe5e9",
            borderRadius: "7px",
            background: "#fff",
            color: "#26343e",
            fontSize: "12px",
          }}
        >
          {accounts.length === 0 ? (
            <option value="">
              {loadingAccounts ? "Loading companies…" : "Add a target company first"}
            </option>
          ) : (
            accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.company_name}
              </option>
            ))
          )}
        </select>
      </div>

      {selectedAccount && (
        <form className="target-account-form" onSubmit={addContact}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="contactFirstName">First name</label>
              <input
                id="contactFirstName"
                value={form.first_name}
                onChange={(event) => updateField("first_name", event.target.value)}
                maxLength={100}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="contactLastName">Last name</label>
              <input
                id="contactLastName"
                value={form.last_name}
                onChange={(event) => updateField("last_name", event.target.value)}
                maxLength={100}
              />
            </div>

            <div className="field full-width">
              <label htmlFor="contactJobTitle">Job title / buyer role</label>
              <input
                id="contactJobTitle"
                value={form.job_title}
                onChange={(event) => updateField("job_title", event.target.value)}
                maxLength={200}
                placeholder="e.g. VP of Sales"
              />
            </div>

            <div className="field">
              <label htmlFor="contactEmail">Work email</label>
              <input
                id="contactEmail"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                maxLength={255}
              />
            </div>

            <div className="field">
              <label htmlFor="contactPhone">Phone</label>
              <input
                id="contactPhone"
                type="tel"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                maxLength={50}
              />
            </div>

            <div className="field">
              <label htmlFor="contactLinkedIn">LinkedIn profile</label>
              <input
                id="contactLinkedIn"
                type="url"
                value={form.linkedin_url}
                onChange={(event) => updateField("linkedin_url", event.target.value)}
                maxLength={500}
                placeholder="https://linkedin.com/in/…"
              />
            </div>

            <div className="field">
              <label htmlFor="contactSource">Source / evidence URL</label>
              <input
                id="contactSource"
                type="url"
                value={form.source_url}
                onChange={(event) => updateField("source_url", event.target.value)}
                maxLength={1000}
                placeholder="Where you found this contact"
              />
            </div>
          </div>

          <div className="form-footer">
            <p className="notice" role="status">
              {notice || `Adding contact for ${selectedAccount.company_name}.`}
            </p>
            <button className="save-button" type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add contact"}
            </button>
          </div>
        </form>
      )}

      <div className="org-field csv-import-area">
        <label htmlFor="target-contact-csv">Import contacts from CRM CSV</label>
        <div className="org-row">
          <input id="target-contact-csv" type="file" accept=".csv,text/csv" onChange={(event) => void prepareContactCsv(event)} />
          <button className="load-button" type="button" onClick={() => void importContactCsv()} disabled={importingCsv || csvRows.length === 0 || accounts.length === 0}>
            {importingCsv ? "Importing…" : `Import ${csvRows.length || ""} contacts`}
          </button>
        </div>
        <span className="field-hint">Use the companies-and-contacts export or a CSV with company_name and contact_first_name. Other supported fields: contact_last_name, contact_job_title, contact_email, contact_phone, contact_linkedin_url, contact_source_url, contact_email_status, contact_qualification_status, contact_do_not_contact. Companies must already exist in this workspace; duplicates are skipped.</span>
        {csvMessage && <span className="field-hint" role="status">{csvMessage}</span>}
      </div>

      {error && (
        <div className="research-error" role="alert">
          {error}
        </div>
      )}

      {loadingContacts ? (
        <p className="target-account-empty">Loading contacts…</p>
      ) : contacts.length === 0 ? (
        <p className="target-account-empty">
          No contacts for this company yet.
        </p>
      ) : (
        <div className="target-account-list">
          {contacts.map((contact) => (
            <article className="target-account-row" key={contact.id}>
              <div className="target-account-details">
                <div className="contact-name-row">
                  <h3>{[contact.first_name, contact.last_name].filter(Boolean).join(" ")}</h3>
                  <ContactChannelActions email={contact.email} emailStatus={contact.email_status} phone={contact.phone} linkedinUrl={contact.linkedin_url} doNotContact={contact.do_not_contact} />
                </div>
                <p>{contact.job_title || "Buyer role not added"}</p>
                {contact.email && <span>{contact.email}</span>}
                {contact.phone && <span>{contact.phone}</span>}
                {contact.linkedin_url && (
                  <a href={contact.linkedin_url} target="_blank" rel="noreferrer">
                    LinkedIn profile
                  </a>
                )}
                {contact.source_url && (
                  <a href={contact.source_url} target="_blank" rel="noreferrer">
                    Contact source
                  </a>
                )}
              </div>

              <div className="target-account-contact-status">
                <label>
                  Email
                  <select
                    value={contact.email_status}
                    onChange={(event) =>
                      void updateContactStatus(
                        contact.id,
                        "email_status",
                        event.target.value as EmailStatus,
                      )
                    }
                  >
                    <option value="not_checked">Not checked</option>
                    <option value="verified">Verified</option>
                    <option value="invalid">Invalid</option>
                  </select>
                </label>

                <label>
                  Lead status
                  <select
                    value={contact.qualification_status}
                    onChange={(event) =>
                      void updateContactStatus(
                        contact.id,
                        "qualification_status",
                        event.target.value as QualificationStatus,
                      )
                    }
                  >
                    <option value="new">New</option>
                    <option value="qualified">Qualified</option>
                    <option value="disqualified">Disqualified</option>
                  </select>
                </label>

                <label>
                  Contact permission
                  <select
                    value={contact.do_not_contact ? "do_not_contact" : "allowed"}
                    onChange={(event) =>
                      void updateContactStatus(
                        contact.id,
                        "do_not_contact",
                        event.target.value === "do_not_contact",
                      )
                    }
                  >
                    <option value="allowed">Contact allowed</option>
                    <option value="do_not_contact">Do not contact</option>
                  </select>
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
