import { useEffect, useState, type FormEvent } from "react";

const API_URL = "http://127.0.0.1:8000";
const ORGANIZATION_STORAGE_KEY = "enterprise-gtm-organization-id";

type Organization = {
  id: string;
  name: string;
};

type ApiError = {
  detail?: string;
};

export default function OrganizationSetup() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem(ORGANIZATION_STORAGE_KEY) ?? "",
  );
  const [name, setName] = useState("");
  const [loadingClients, setLoadingClients] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrganizations() {
      try {
        const response = await fetch(`${API_URL}/organizations`);
        const data = await response.json().catch(() => []);

        if (!response.ok) {
          throw new Error(`The server returned ${response.status}.`);
        }

        if (active) {
          setOrganizations(Array.isArray(data) ? data : []);
        }
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load clients. Check that the backend is running.",
          );
        }
      } finally {
        if (active) {
          setLoadingClients(false);
        }
      }
    }

    void loadOrganizations();

    return () => {
      active = false;
    };
  }, []);

  function switchClient(id: string) {
    if (!id) return;

    setSelectedId(id);
    localStorage.setItem(ORGANIZATION_STORAGE_KEY, id);

    if (id !== localStorage.getItem(ORGANIZATION_STORAGE_KEY)) {
      window.location.reload();
      return;
    }

    window.location.reload();
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const clientName = name.trim();
    if (!clientName) {
      setError("Enter a client name.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clientName }),
      });

      const data = (await response.json().catch(() => ({}))) as
        | Organization
        | ApiError;

      if (!response.ok) {
        throw new Error(
          "detail" in data && typeof data.detail === "string"
            ? data.detail
            : `The server returned ${response.status}.`,
        );
      }

      if (!("id" in data) || typeof data.id !== "string") {
        throw new Error("The server did not return a client ID.");
      }

      localStorage.setItem(ORGANIZATION_STORAGE_KEY, data.id);
      window.location.reload();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create the client. Check that the backend is running.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form-card organization-setup">
      <div className="card-heading">
        <div>
          <h2>Clients</h2>
          <p>Select a client or add a new one to manage its outbound work.</p>
        </div>
      </div>

      <div className="org-field">
        <label htmlFor="clientOrganization">Current client</label>
        <select
          id="clientOrganization"
          value={selectedId}
          onChange={(event) => switchClient(event.target.value)}
          disabled={loadingClients || organizations.length === 0}
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
          <option value="">
            {loadingClients ? "Loading clients…" : "Add your first client below"}
          </option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </div>

      <form className="form-body" onSubmit={createClient}>
        <div className="field full-width">
          <label htmlFor="clientName">Add a client</label>
          <input
            id="clientName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            placeholder="e.g. Northstar ERP"
            required
          />
        </div>

        {error && (
          <p className="organization-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-footer">
          <span className="field-hint">
            Each client’s profile, ICP, and target companies stay under its own
            organization.
          </span>
          <button className="save-button" type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add client"}
          </button>
        </div>
      </form>
    </section>
  );
}