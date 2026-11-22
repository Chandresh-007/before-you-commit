# Before You Commit — Database Change Review Workspace

> **A college-level web application for reviewing SQL database changes against realistic edge cases before committing to production.**

---

## 🌐 Live Cloud Deployment

- **Live Web Application (CloudFront HTTPS):** [https://dlmstyklbxdtu.cloudfront.net/](https://dlmstyklbxdtu.cloudfront.net/)
- **Verified Sample Replay URL:** [https://dlmstyklbxdtu.cloudfront.net/?replay=4946d13fa482](https://dlmstyklbxdtu.cloudfront.net/?replay=4946d13fa482)
- **AWS API Gateway HTTP API Endpoint:** `https://2xinmh7vvj.execute-api.ap-south-1.amazonaws.com`
- **AWS Region:** `ap-south-1` (Mumbai)
- **Primary Stack:** `before-you-commit-stack`

---

## 🎯 The Core Demonstration & Scenario

### The Change Request (Ticket: `REG-104-CANCEL`)
*“Cancel Ananya’s November Cloud Quest registration. Preserve her previous attendance.”*

### The Problem
A student developer writes SQL against the starter dataset:
```sql
UPDATE registrations
SET status = 'cancelled'
WHERE student_id = 'STU-402';
```
On the starter table, Ananya only has one registration (`#104`, November Cloud Quest). The query executes, modifies only `#104`, and appears to satisfy the ticket.

### The Reviewer Edge Case
A reviewer clicks **"+ Add Previous Attendance"**, injecting Ananya’s completed October session (`#87`, completed). Replaying the unchanged candidate query immediately triggers a regression:
- **Registration #104:** `registered` → `cancelled` (Intended)
- **Registration #87:** `completed` → `cancelled` (**Unintended Regression!** Overwrote previous completed attendance)

The app displays the high-contrast projector headline:
> **`2 registrations changed · 1 outside the ticket`**

### The Defensive Fix
The developer edits the SQL to target the candidate primary key:
```sql
UPDATE registrations
SET status = 'cancelled'
WHERE registration_id = 104;
```
Replaying results in a verified pass:
- **Registration #104:** `registered` → `cancelled` (Intended)
- **Registration #87:** `completed` (Unchanged, OK)
> **`1 registration changed · Ticket satisfied`**

---

## ⚡ Consequential Engineering Choices

1. **SQL Execution Stays in the Browser (Client-Side WASM SQLite):**
   - **Zero Compute Risk:** Running arbitrary SQL in the cloud invites resource exhaustion, Denial-of-Service, multi-tenant state leaks, and execution latency.
   - **Local Web Worker Isolation:** Using `sql.js` in a browser Web Worker creates a fresh in-memory SQLite database in under **2 milliseconds**, isolated from the UI thread with a strict **2500ms hard timeout**. Edits are completely disposable.
   - **Cost & Zero Maintenance:** Students and faculty can practice infinite query variations with zero server compute bills.

2. **DynamoDB Stores Only Replay Recipes (Data, Not State):**
   - The cloud database stores lightweight recipes (scenario version, synthetic reviewer rows, candidate SQL text).
   - Pay-Per-Request (on-demand) billing means \$0 base cost.
   - TTL is enabled on `ttl` attribute (30-day retention) with expiration enforced on reads.
   - Privacy-safe: No real student PII, credentials, or production connection strings ever leave the browser.

3. **Strict AST / SQL Parsing Guard:**
   - Enforces exactly one `UPDATE` statement targeting `registrations`.
   - Restricts modifications exclusively to the `status` column.
   - Rejects multiple statements (`DROP TABLE`, chained queries), schema alterations, or attempts to overwrite student IDs.

4. **Self-Contained Local Replay Fallback:**
   - If cloud connectivity is lost or AWS sharing is unconfigured, the app falls back to local base64 URL parameters (`?localReplay=...`) while reporting the exact network error. The app never produces a fake success link.

---

## 🚀 Quickstart & Local Development

Run the starter app locally with one documented command:

```bash
# 1. Install dependencies
npm install

# 2. Start local development server (serves local SQLite WASM automatically)
npm run dev
```

Open `http://localhost:5173/` in your browser.

---

## 🧪 Automated Testing

Run the automated test suite covering all phase-gate verification criteria:

```bash
npm test
```

### Test Suite Coverage:
1. **Initial Pass:** Starter query updates registration 104 and satisfies ticket on initial dataset.
2. **Reviewer Regression:** Exposes 2 changed rows (1 unintended) when October row 87 is added.
3. **Corrected Pass:** Scoped primary key query preserves past attendance and passes.
4. **Zero Row Update:** Non-matching `WHERE` clause detects missed change.
5. **Wrong Value Detection:** Catches invalid status values (e.g. `dropped` instead of `cancelled`).
6. **Syntax Error Handling:** Recovers cleanly from malformed SQL with descriptive error messages.
7. **Constraint Validation:** Rejects multiple statements, `DELETE`, and unauthorized column mutations.

---

## 🏗️ Production Build & Verification

```bash
# Compile TypeScript and bundle frontend with WASM assets
npm run build

# Preview production build locally
npm run preview
```

---

## ☁️ AWS Cloud Deployment (SAM / CloudFormation)

The infrastructure is provisioned using AWS CloudFormation / SAM with least-privilege IAM and zero always-on compute.

### Prerequisites:
- AWS CLI configured with credentials in target region (default `ap-south-1`).
- Node.js 20+

### Deployment Commands:

```bash
# 1. Create S3 deployment artifact bucket (if not already created)
aws s3 mb s3://before-you-commit-artifacts-<ACCOUNT_ID>-ap-south-1 --region ap-south-1

# 2. Package Lambda and SAM CloudFormation template
aws cloudformation package \
  --template-file template.yaml \
  --output-template-file packaged.yaml \
  --s3-bucket before-you-commit-artifacts-<ACCOUNT_ID>-ap-south-1 \
  --region ap-south-1

# 3. Deploy the managed infrastructure stack
aws cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name before-you-commit-stack \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --region ap-south-1

# 4. Build and sync frontend assets to the created S3 bucket
npm run build
aws s3 sync dist s3://before-you-commit-app-<ACCOUNT_ID>-ap-south-1 --delete
aws s3 cp dist/sql-wasm-browser.wasm s3://before-you-commit-app-<ACCOUNT_ID>-ap-south-1/sql-wasm-browser.wasm --content-type "application/wasm"
aws s3 cp dist/sql-wasm.wasm s3://before-you-commit-app-<ACCOUNT_ID>-ap-south-1/sql-wasm.wasm --content-type "application/wasm"
```

---

## 🧹 Teardown & Clean-up

To avoid unnecessary costs, delete all provisioned AWS resources:

```bash
# 1. Empty the S3 frontend bucket
aws s3 rm s3://before-you-commit-app-<ACCOUNT_ID>-ap-south-1 --recursive

# 2. Delete the CloudFormation stack (deletes CloudFront, API Gateway, Lambda, DynamoDB, IAM roles)
aws cloudformation delete-stack --stack-name before-you-commit-stack --region ap-south-1

# 3. Empty and delete the packaging artifact bucket
aws s3 rb s3://before-you-commit-artifacts-<ACCOUNT_ID>-ap-south-1 --force
```
