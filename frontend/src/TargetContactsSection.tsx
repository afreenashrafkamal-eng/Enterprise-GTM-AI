import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

const API_URL = "http://127.0.0.1:8000";

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

  const loadAccounts = useCallback(async () => {
    if (!organizationId.trim()) {
      setAccounts([]);
      setAccountId("");
      return;
    }

    setLoadingAccounts(true);
    setError("");

    try {
      const response = await fetch(
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
      const response = await fetch(
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
      const response = await fetch(
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
    field: "email_status" | "qualification_status",
    value: EmailStatus | QualificationStatus,
  ) {
    setError("");

    try {
      const response = await fetch(
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
                <h3>
                  {[contact.first_name, contact.last_name]
                    .filter(Boolean)
                    .join(" ")}
                </h3>
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
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}