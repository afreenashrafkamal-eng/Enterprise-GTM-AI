import { useState, type FormEvent } from "react";

const API_URL = "http://127.0.0.1:8000";
const ORGANIZATION_STORAGE_KEY = "enterprise-gtm-organization-id";

type CreateOrganizationResponse = {
  id: string;
};

export default function OrganizationSetup() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a workspace name.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });

      const data = (await response.json().catch(() => ({}))) as
        | CreateOrganizationResponse
        | { detail?: string };

      if (!response.ok) {
        const message =
          "detail" in data && typeof data.detail === "string"
            ? data.detail
            : `The server returned ${response.status}.`;
        throw new Error(message);
      }

      if (!("id" in data) || typeof data.id !== "string") {
        throw new Error("The server did not return an organization ID.");
      }

      localStorage.setItem(ORGANIZATION_STORAGE_KEY, data.id);
      window.location.reload();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create the workspace. Check that the backend is running.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form-card organization-setup">
      <div className="card-heading">
        <div>
          <h2>Create your workspace</h2>
          <p>A workspace keeps your company and ideal customer profiles together.</p>
        </div>
      </div>

      <form className="form-body" onSubmit={createOrganization}>
        <div className="field full-width">
          <label htmlFor="workspaceName">Workspace name</label>
          <input
            id="workspaceName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            placeholder="e.g. My GTM workspace"
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
            This creates a workspace in your local development database.
          </span>
          <button className="save-button" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </form>
    </section>
  );
}