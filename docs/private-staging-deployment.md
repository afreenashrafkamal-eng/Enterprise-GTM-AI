# Private staging deployment

This setup produces a shareable HTTPS preview on Render. It is for a short, owner-controlled evaluation only; it does not make the app production-ready for customer onboarding.

## Cost and data limits

- The Blueprint uses Render's free web service and free PostgreSQL plan. The web service sleeps after 15 minutes without traffic. The free database expires after 30 days and can later be deleted, so do not use it for real customer data.
- Keeping the basic web service and PostgreSQL database beyond the free trial currently starts around $13 USD/month ($7 service + $6 database), before AI API usage, email, telephony, storage, or usage overages. Confirm current provider prices before choosing paid resources.
- The Render Blueprint does not create hosted resources until the user signs in and submits it in Render. Do not approve a paid plan or upgrade without reviewing its price first.

## Before creating the staging link

1. Finish review of the local changes and commit only application source and required deployment files. Never commit `.env`, API keys, OAuth secrets, database dumps, logs, or the `backups/` directory.
2. Push the reviewed commit to the private GitHub repository. At present, the project has local modifications and untracked source files that are not on `origin/main`; a Git-connected host would otherwise deploy an older revision.
3. Create a Render account and import the repository's `render.yaml` Blueprint. Select the free plans for this demo. The Blueprint asks for Google OAuth client ID and secret and an OpenAI key; enter those only in Render's private configuration form. Do not paste them into chat or Git.
4. Keep the Google OAuth consent screen in testing mode and add only the intended Google account(s) as test users. After Render assigns the URL, add `https://<render-hostname>/auth/google/callback` as an authorized redirect URI for the OAuth client. The app uses the same host for the browser, API, and callback.
5. Deploy and verify login and workspace isolation with dummy data only. Do not load local database backups or actual prospect/client records into this free staging database.

## Remaining before client onboarding or a public SaaS launch

- Complete authorization and tenant-isolation review, invitation and role-based access controls, and account lifecycle flows.
- Review privacy, retention, backups, incident response, rate limits, and abuse controls.
- Set up a persistent paid database with backups before storing important data. Configure a production domain and OAuth consent process when ready.
- Review email and phone-provider compliance, consent, sender verification, regional calling rules, and the relevant provider/API spend.

The manifest deliberately uses one web service for the React app and FastAPI API so browser sessions and requests share the same origin. Google sign-in remains required in production. Local `.env` values are not included in the container build context.
