import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, API_URL } from "./api";
const ORGANIZATION_STORAGE_KEY = "enterprise-gtm-organization-id";
const LOCAL_TEST_WORKSPACES = new Set(["micro1", "SummitOps Cloud", "Northstar ERP"]);

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
  const [deletingId, setDeletingId] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrganizations() {
      try {
        const response = await apiFetch(`${API_URL}/organizations`);
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

    const workspaceName = name.trim();
    if (!workspaceName) {
      setError("Enter a workspace name.");
      return;
    }

    setSaving(true);

    try {
      const response = await apiFetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName }),
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

  async function deleteTestWorkspace(organization: Organization) {
    const accepted = window.confirm(
      `Permanently delete the test workspace “${organization.name}” and its saved profiles, prospects, contacts, research, call/email history, and integrations? My Agency and the other retained workspaces will be kept. This cannot be undone.`,
    );
    if (!accepted) return;

    setError("");
    setDeleteNotice("");
    setDeletingId(organization.id);
    try {
      const response = await apiFetch(`${API_URL}/organizations/${encodeURIComponent(organization.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_name: organization.name }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(data.detail ?? `The server returned ${response.status}.`);
      }

      setOrganizations((current) => current.filter((item) => item.id !== organization.id));
      setDeleteNotice(`${organization.name} and its linked workspace data were deleted.`);
      if (localStorage.getItem(ORGANIZATION_STORAGE_KEY) === organization.id) {
        const agency = organizations.find((item) => item.name === "My Agency" && item.id !== organization.id);
        const nextId = agency?.id ?? organizations.find((item) => item.id !== organization.id)?.id ?? "";
        if (nextId) localStorage.setItem(ORGANIZATION_STORAGE_KEY, nextId);
        else localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
        setSelectedId(nextId);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not remove that test workspace.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section className="form-card organization-setup">
      <div className="card-heading">
        <div>
          <h2>Agency and client workspaces</h2>
          <p>Choose your own agency workspace or a client workspace before researching or contacting prospects.</p>
        </div>
      </div>

      <div className="org-field">
        <label htmlFor="clientOrganization">Active workspace</label>
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

      {organizations.some((organization) => LOCAL_TEST_WORKSPACES.has(organization.name)) && (
        <div className="org-field workspace-cleanup">
          <strong>Remove test workspaces</strong>
          <p>Only the three identified demo workspaces can be removed here. Their linked workspace data is permanently deleted.</p>
          <div className="workspace-cleanup-list">
            {organizations.filter((organization) => LOCAL_TEST_WORKSPACES.has(organization.name)).map((organization) => (
              <div className="workspace-cleanup-row" key={organization.id}>
                <span>{organization.name}</span>
                <button type="button" className="workspace-delete-button" disabled={Boolean(deletingId)} onClick={() => void deleteTestWorkspace(organization)}>
                  {deletingId === organization.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {deleteNotice && <p className="workspace-delete-notice" role="status">{deleteNotice}</p>}

      <form className="form-body" onSubmit={createClient}>
        <div className="field full-width">
          <label htmlFor="clientName">Add an agency or client workspace</label>
          <input
            id="clientName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            placeholder="e.g. My Agency or Northstar ERP"
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
            Keep your agency work separate from every client’s profile, ICP, and prospect list.
          </span>
          <button className="save-button" type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add workspace"}
          </button>
        </div>
      </form>
    </section>
  );
}
