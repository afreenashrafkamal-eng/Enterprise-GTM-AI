# Enterprise GTM AI demo walkthrough

> Historical walkthrough: it references the `micro1` demo workspace, which was removed with its linked data on 2026-11-28. The current local database does not contain this sample, so the steps below are reference-only unless demo data is explicitly recreated.

## Before the demo

- Start PostgreSQL, then start the backend with `scripts/start-backend.cmd` and the frontend with `scripts/start-frontend.cmd`. Keep both windows open and open `http://127.0.0.1:5176`.
- Select the **micro1** client in the client picker.
- Use the saved local demo data. The profile and target-account records are in the development database.
- Keep the demo local. The workspace includes public company details and illustrative account-fit notes; no buying intent is verified.

## Four-minute walkthrough

### 1. Company profile

Show the saved micro1 profile: AI data infrastructure, expert-generated training data, model evaluation, agent evaluation, and robotics data. Explain that the profile was researched from Micro1's public site and reviewed before saving.

### 2. Ideal customer profile

Show the ICP for frontier AI labs, enterprise AI teams, and robotics developers. The buyer roles and pain points are working assumptions based on Micro1's public product areas. Revenue, company size, and geography filters are blank because they were not verified as qualification criteria.

### 3. Outbound strategy

Show the outbound strategy draft between the ICP and target-company list. Explain that it uses the saved company and ICP details to create a reviewable plan. In Target companies, use Edit details to add an account-specific reason and public source link. Click Refresh list in Account readiness review to see the evidence status, then select a small pilot of ICP-qualified accounts. Show that the email draft starts with the saved reason and source. Replace the bracketed placeholders before marking the draft reviewed; any later edit resets its status. It is not a market prediction and does not send outreach.

### 4. Target companies

Show Anthropic, Figure, and ServiceNow. They are marked **Qualified** for ICP fit only. Their notes state that no Micro1 relationship or buying intent has been verified.

### 5. Decision-maker contacts

Show Jared Kaplan for Anthropic and Jon Sigler for ServiceNow as role-aligned contacts. Show Brett Adcock for Figure as **New** because his public CEO role is less directly aligned with the saved buyer roles. All email statuses are **Not checked**.

### 6. AI research

Show the saved research result for Micro1 and explain that AI suggestions are reviewed before they are applied. Avoid rerunning research during a short demo because it uses the configured API and may incur charges.

## Close

This prototype supports company profiles, ICPs, an editable outbound strategy, target-company lists, qualification statuses, and decision-maker contacts. It does not send outreach, and the listed contacts do not have verified email addresses. Keep the app's local-prototype status clear during the demo.
