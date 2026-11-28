import { useEffect, useState } from "react";
import { apiFetch, API_URL } from "./api";

export default function SignIn() {
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [dependencyInstalled, setDependencyInstalled] = useState(true);
  const [credentialsPresent, setCredentialsPresent] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAuthStatus() {
      try {
        const response = await apiFetch(`${API_URL}/auth/google/status`);
        if (!response.ok) throw new Error("Authentication status unavailable.");
        const data = (await response.json()) as {
          configured: boolean;
          dependency_installed: boolean;
          credentials_present: boolean;
        };
        if (active) {
          setGoogleConfigured(data.configured);
          setDependencyInstalled(data.dependency_installed);
          setCredentialsPresent(data.credentials_present);
        }
      } catch {
        if (active) {
          setBackendAvailable(false);
          setGoogleConfigured(false);
        }
      }
    }

    void loadAuthStatus();
    return () => {
      active = false;
    };
  }, []);

  const authError = new URLSearchParams(window.location.search).get("auth_error");
  const authErrors: Record<string, string> = {
        google_not_configured: "Google sign-in is not configured yet.",
        google_login_failed: "Google sign-in could not be completed. Please try again.",
        google_email_not_verified: "Use a Google account with a verified email address.",
        google_profile_unavailable: "Google did not return the profile details needed to sign in.",
      };
  const errorMessage = authError
    ? authErrors[authError] ?? "Sign-in could not be completed. Please try again."
    : "";

  return (
    <main className="signin-shell">
      <section className="signin-card">
        <div className="signin-brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>Enterprise GTM</strong>
            <span>AI workspace</span>
          </div>
        </div>
        <span className="signin-kicker">PRIVATE WORKSPACE</span>
        <h1>Sign in to continue</h1>
        <p className="signin-description">
          Use your Google account to open your company profile, target accounts,
          and sales workspace.
        </p>

        {errorMessage && <p className="signin-error" role="alert">{errorMessage}</p>}
        {!backendAvailable && (
          <p className="signin-error" role="alert">
            The backend is not reachable. Start the FastAPI server, then reload this page.
          </p>
        )}

        <a
          className={`google-signin-button ${googleConfigured ? "" : "disabled"}`}
          href={googleConfigured ? `${API_URL}/auth/google/login` : undefined}
          aria-disabled={!googleConfigured}
          onClick={(event) => {
            if (!googleConfigured) event.preventDefault();
          }}
        >
          <span className="google-mark" aria-hidden="true">G</span>
          Continue with Google
        </a>

        {googleConfigured === false && backendAvailable && (
          <div className="signin-setup-note">
            <strong>{dependencyInstalled ? "Finish Google setup" : "Install the auth dependency"}</strong>
            {!dependencyInstalled ? (
              <span>
                From the project root, run
                <code>.venv\Scripts\python.exe -m pip install -r backend\requirements.txt</code>,
                then restart the backend.
              </span>
            ) : !credentialsPresent ? (
              <span>
                Add your Google OAuth client ID and secret to the project’s local
                <code>.env</code> file, then restart the backend.
              </span>
            ) : (
              <span>Restart the backend to load the Google sign-in settings.</span>
            )}
            <span>
              The authorized redirect URI must be
              <code>http://127.0.0.1:8000/auth/google/callback</code>.
            </span>
          </div>
        )}

        <span className="signin-footer">Your workspace data stays in the configured local database.</span>
      </section>
    </main>
  );
}
