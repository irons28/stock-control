# Jira Integration

## What it does

When a Purchase Order (PO) is **received** in the stock-control system and that PO has a linked Jira issue key, the backend automatically:

1. **Adds a comment** to the Jira issue with a receipt summary (quantities received, products, receipt ID).
2. Optionally **transitions the Jira issue** to a configured status (e.g. "Done") when the PO is fully received.

Jira issue keys can also be linked to **Sales Orders** (SOs) for reference — no automatic comment is posted for SOs currently, but the key is stored and displayed in the UI.

## What it does NOT do

- It does **not** create Jira issues.
- It does **not** manage Jira projects or boards.
- It does **not** expose your Jira API token or email to the frontend or browser.
- It does **not** block goods receipt if Jira is unavailable — the receipt always succeeds.

---

## Environment variables

Set these on the **backend server** (not in the frontend). Never commit them to source control.

| Variable | Required | Description |
|---|---|---|
| `JIRA_ENABLED` | Yes | Set to `true` to enable the integration. Default: `false`. |
| `JIRA_BASE_URL` | Yes (when enabled) | Your Atlassian base URL, e.g. `https://yourcompany.atlassian.net` |
| `JIRA_EMAIL` | Yes (when enabled) | The email address of the Atlassian account used for API calls. |
| `JIRA_API_TOKEN` | Yes (when enabled) | The API token for that account (see below). |
| `JIRA_PROJECT_KEY` | No | Your Jira project key (e.g. `OPS`). Used in the Admin Integrations display only. |
| `JIRA_PO_RECEIVED_TRANSITION` | No | Name of the Jira transition to trigger when a PO is **fully** received (e.g. `Done`). Leave blank to skip transitions. |

---

## How to create an Atlassian API token

1. Log in to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token**.
3. Give it a label (e.g. `stock-control-integration`).
4. Copy the token immediately — it is only shown once.
5. Set it as `JIRA_API_TOKEN` in your server environment.

---

## Where to put credentials

**Local development:** create a `.env` file in the `backend/` directory (already in `.gitignore`):

```
JIRA_ENABLED=true
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=you@yourcompany.com
JIRA_API_TOKEN=your-token-here
JIRA_PROJECT_KEY=OPS
JIRA_PO_RECEIVED_TRANSITION=Done
```

**Production / staging:** set these as server environment variables or secrets (e.g. Heroku config vars, AWS Secrets Manager, Railway variables).

> ⚠️ **Never commit `.env` or any file containing `JIRA_API_TOKEN` to source control.**

A `.env.example` file in `backend/` lists all variables with placeholder values.

---

## How to test the connection

1. Log in as **Admin**.
2. Go to **Admin → Integrations**.
3. Click **Test Jira Connection**.

The test calls the Jira `/myself` endpoint using your configured credentials. Results:

| Result | Meaning |
|---|---|
| Connected | Credentials are valid, Jira is reachable. |
| Disabled | `JIRA_ENABLED` is `false` or not set. |
| Missing credentials | One or more required variables are not set. |
| Failed | Credentials may be wrong, or the Jira server is unreachable. |

The test result **never** includes your API token, email address, or authentication header.

---

## How PO receiving updates Jira

1. User receives goods against a PO in **Receive Goods**.
2. Backend checks whether the PO has a `jira_issue_key`.
3. If yes, and if `JIRA_ENABLED=true` and credentials are valid:
   - A comment is posted to the Jira issue with the receipt summary.
   - If `JIRA_PO_RECEIVED_TRANSITION` is set and the PO is now fully received, the issue is transitioned.
4. The receipt is saved regardless of whether the Jira call succeeds.
5. The UI shows a green success notice or an amber warning depending on the Jira result.

---

## Linking Jira issue keys in the UI

**Purchase Orders:**
- Open a PO detail in **Purchase Orders**.
- The **Jira Issue** row shows the linked key (or "Not linked").
- Admin/office users see a **Link issue** / **Edit** button.
- Enter a key in `ABC-123` format and click **Save**, or **Clear** to remove it.
- If `JIRA_BASE_URL` is configured, the key is a clickable link to the issue.

**Sales Orders:**
- Same UI, available on the SO detail panel.

---

## Troubleshooting

### Jira is disabled
**Symptom:** Admin → Integrations shows "Disabled".  
**Fix:** Set `JIRA_ENABLED=true` in your backend environment and restart the server.

### Missing credentials
**Symptom:** Status shows "Missing credentials".  
**Fix:** Set `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`.

### Invalid token
**Symptom:** Test connection returns HTTP 401.  
**Fix:** Regenerate the API token at [Atlassian account security](https://id.atlassian.com/manage-profile/security/api-tokens) and update `JIRA_API_TOKEN`.

### Invalid issue key
**Symptom:** Comment fails silently; logs show `404` from Jira.  
**Fix:** Verify the issue key format (`PROJECT-NNN`) and that the issue exists in your Jira project.

### Transition not found
**Symptom:** Comment succeeds but no transition; server log warns `Transition "Done" not found for OPS-42`.  
**Fix:** Check the exact transition name in Jira (case-insensitive match). Ensure the issue is in a state where the transition is available.

### Jira API failure during receipt
**Symptom:** Amber warning shown after receiving goods: "Jira could not be updated".  
**Fix:** Check server logs for details. The receipt is still saved — no stock data is lost. Fix Jira connectivity and the comment can be added manually.

---

## Security notes

- **Backend-only:** All Jira API calls are made exclusively from the Node.js backend. No Jira credentials are ever sent to the browser or included in the React bundle.
- **Token never in API responses:** The `/admin/integrations/status` and `/admin/integrations/jira/test` endpoints return only safe configuration values (enabled flag, base URL, project key). `JIRA_API_TOKEN` and `JIRA_EMAIL` are never included.
- **Issue key only:** The frontend stores and displays only the Jira issue key (e.g. `OPS-42`) — not titles, descriptions, or any data fetched from Jira.
- **Admin-gated:** The Integrations page and test connection endpoint require the `admin` role.
