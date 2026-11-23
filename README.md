# QueryScope: Testing the Scope of SQL Updates

> **A college-level web application for reviewing SQL database changes against realistic edge cases before committing to production.**

---

## 🌐 Live Cloud Deployment

- **Live Web Application (CloudFront HTTPS):** [https://dlmstyklbxdtu.cloudfront.net/](https://dlmstyklbxdtu.cloudfront.net/)
- **Bedrock-Assisted Challenge (Aarav Patel · v1.1.0):** [https://dlmstyklbxdtu.cloudfront.net/?scenario=scenario-bedrock-student-scope-mwrs6sns](https://dlmstyklbxdtu.cloudfront.net/?scenario=scenario-bedrock-student-scope-mwrs6sns)
- **Aarav Patel — Faulty Replay:** [https://dlmstyklbxdtu.cloudfront.net/?replay=f66578b25a30](https://dlmstyklbxdtu.cloudfront.net/?replay=f66578b25a30)
- **Aarav Patel — Corrected Replay:** [https://dlmstyklbxdtu.cloudfront.net/?replay=6589483ac532](https://dlmstyklbxdtu.cloudfront.net/?replay=6589483ac532)
- **Legacy Faulty Replay (Cloud Quest):** [https://dlmstyklbxdtu.cloudfront.net/?replay=98859cee33a8](https://dlmstyklbxdtu.cloudfront.net/?replay=98859cee33a8)
- **Legacy Corrected Replay (Cloud Quest):** [https://dlmstyklbxdtu.cloudfront.net/?replay=8d79d8310125](https://dlmstyklbxdtu.cloudfront.net/?replay=8d79d8310125)
- **Placement Drive — Student Scope Replay:** [https://dlmstyklbxdtu.cloudfront.net/?replay=fa68a4cadb46](https://dlmstyklbxdtu.cloudfront.net/?replay=fa68a4cadb46)
- **Placement Drive — Session Scope Replay:** [https://dlmstyklbxdtu.cloudfront.net/?replay=7a14c9109cab](https://dlmstyklbxdtu.cloudfront.net/?replay=7a14c9109cab)
- **AWS API Gateway HTTP API Endpoint:** `https://2xinmh7vvj.execute-api.ap-south-1.amazonaws.com`
- **AWS Region:** `ap-south-1` (Mumbai)
- **Primary Stack:** `before-you-commit-stack` (Lambda runtime: `nodejs22.x`)

---

## 📖 One-Page Project Explanation

### 1. Product Trace: From Ticket to Replay
```
[ Ticket & Seed Rows ]
        │
        ▼
[ Candidate SQL (Developer) ] ───► [ SQL Validator (Grammar & Tokenizer) ]
                                              │
                                              ▼
                                   [ Web Worker (sql.js WASM) ]
                                   ┌───────────────────────────┐
                                   │ 1. In-memory SQLite DB    │
                                   │ 2. Seed + Reviewer Rows   │
                                   │ 3. Execute Candidate SQL  │
                                   │ 4. Snapshot Before/After  │
                                   └───────────────────────────┘
                                              │
                                              ▼
[ Share Replay ] ◄─────────────── [ Diff Engine (Full-Row Diff) ]
        │                                     │
   ┌────┴────────────────────────┐            ▼
   ▼                             ▼    [ Visual Evidence Banner ]
[ Cloud Replay (DynamoDB API) ] [ Local Hash (#localReplay=) ]  (Pass, Unintended Casualties, Preserved Rows)
```

1. **Ticket & Seed Rows:** The student receives a scenario (e.g. Aarav Patel's interview cancellation). Starter records contain Aarav's target 10:00 AM Amazon interview (`#204`) alongside unrelated control records.
2. **Web Worker & SQLite In-Memory Execution:** The app runs `sql.js` (SQLite compiled to WebAssembly) entirely inside a dedicated browser Web Worker with a 2500ms hard timeout. Every execution builds an isolated in-memory database containing seed rows and any reviewer test rows, executes the student's candidate query, and snapshots before-and-after states.
3. **Full-Row Diff Engine & Pedagogical Explanations:** The diff engine compares **all persisted columns** (`registration_id`, `student_id`, `student_name`, `event_name`, `session_date`, `status`). It classifies rows as `intended` (matches ticket target and expected status), `unintended` (affected records outside the ticket, unexpected column mutations, or unintended inserts/deletions), `missed` (target was untouched), `wrong_value` (target changed to an incorrect status), or `unchanged`. For every unintended change, it synthesizes an educational explanation based on the query predicate.
4. **Replay Generation & Persistence:** When a student or reviewer shares a review, the recipe is serialized. If AWS is reachable, it posts to API Gateway → Lambda → DynamoDB (`30-day TTL`). If offline, unconfigured, or cloud-rejected, it produces a self-contained `#localReplay=<base64url>` URL fragment (RFC 4648 URL-safe characters `-` and `_` without padding) that reproduces the review without any cloud infrastructure.

### 2. Role of AWS Components
- **Amazon CloudFront & S3:** Global low-latency CDN delivering the Single Page Application, CSS/JS bundles, and binary `sql-wasm.wasm` with correct MIME types and gzip/brotli compression.
- **Amazon API Gateway HTTP API:** Low-latency regional entrypoint with built-in CORS headers and request throttling (50 burst / 20 sustained rps).
- **AWS Lambda (`nodejs22.x`):** Serverless microservice running pure Node.js 22 with structured JSON observability (no PII or raw SQL in logs), validating incoming payload sizes (32KB cap), integer safety, null object protection, and recipe schemas.
- **Amazon DynamoDB:** Pay-per-request NoSQL store for replay recipes. Automatically enforces 30-day data retention via native DynamoDB TTL (`ttl` attribute) and client-read validation.
- **Amazon Bedrock (`apac.amazon.nova-micro-v1:0` in `ap-south-1`):** Offline instructor authoring tool. Bedrock assists in generating scenario copy, realistic student context, and reviewer edge cases, passing through a strict offline playability gate before publication. Bedrock is never called on student runtime requests.

### 3. Why `registration_id` is the Robust Selector
- **`student_scope` Trap:** A query filtering solely by `student_id = 'STU-404'` passes on the initial seed data because Aarav only has one booking. However, when the reviewer adds Aarav's second booking (`#188`, Facebook Interview), the same query unintentionally cancels both bookings because both belong to Aarav.
- **`session_scope` Trap:** A query filtering solely by `event_name = 'Google Interview' AND session_date = '2024-11-25 10:00'` passes on seed data with one attendee (Rohan Verma #204). But when another student (Divya Sharma #209) registers for the same interview slot, the query cancels everyone in the session because they share the slot, not because they share an identity.
- **Primary Key Safety:** Scoping by `WHERE registration_id = 204` (or combining candidate keys defensively `WHERE registration_id = 204 AND student_id = 'STU-404'`) isolates the atomic record, preventing regressions regardless of newly added rows.

### 4. Replay Expiration, Scenario Versioning, and Classroom Grading Limits
- **30-Day TTL:** DynamoDB automatically expires recipes after 30 days. The Lambda handler rejects expired replays with HTTP 410 Gone, while the frontend gracefully provides local `#localReplay=` links.
- **Immutable Scenario Registry:** Scenarios are version-tagged (e.g., `1.0.0`, `1.1.0`). Replays store `scenarioVersion` and will never silently switch exercises or re-interpret historical queries.
- **Classroom Grading Limits:** In-browser grading verifies query correctness against the active test suite (starter + edge cases). It detects non-status column modifications, missing rows, and unintended mutations, but does not substitute for transactional concurrency control or production schema migrations.

---

## 🎓 Pedagogical Explanations & Priority Release Improvements

During release verification, three critical pedagogical and operational improvements were finalized:

1. **Pedagogically Accurate SQL Explanations (`src/engine/diffEngine.ts`):**
   - **Student Scope (Aarav Patel):** When a query filters by `student_id`, both bookings belong to Aarav. Explanation: *"Both bookings match Aarav’s student ID, so filtering by student ID selected both."*
   - **Session Scope (Rohan Verma & Divya Sharma):** When a query filters by `event_name` and `session_date`, Rohan and Divya are **different students** with distinct student IDs. Explanation: *"Rohan’s #204 and Divya Sharma’s #209 belong to different students who share the same Google Interview event and time. The event-and-time condition matched both."* The UI never claims both belong to the same student or blames a student ID filter.
   - **Custom SQL Fallback:** When students write custom queries, the engine provides direct factual before-and-after evidence.
   - **Target Misses & Wrong Status:** The result banner renders visual cards for missed targets (`scheduled → scheduled`) and wrong-value mutations (`scheduled → confirmed` when `cancelled` was requested).

2. **Reliable Replay Sharing (`src/api/replayApi.ts` & `backend/src/handler.ts`):**
   - **Explicit Outcome States:** Sharing explicitly differentiates `'cloud'`, `'local'`, and `'failure'`.
   - **URL-Safe Base64:** Encodes URL hash fragments with `-` and `_` and strips `=` padding. Decoders normalize legacy `+`, `-`, `_`, and spaces (recovering from browser `URLSearchParams` conversion).
   - **No Broken Fallbacks:** If a cloud save is rejected (HTTP 400/413), the app shows the server's rejection reason and never points students to the homepage.
   - **Cloud ID Validation:** Cloud persistence validates that returned IDs are 12-character hexadecimal hashes.
   - **Lambda Null Body Protection:** Hardened against `null` JSON bodies (`JSON.parse("null")`), cleanly returning HTTP 400 instead of HTTP 500 TypeError.

3. **Recoverable & Versioned Instructor Publishing (`scripts/authorChallenge.mjs`):**
   - **Partial-Write Recovery:** Detects existing scenario files missing from `src/scenarios/index.ts` and atomically registers them without re-prompting or erroring.
   - **Conflict Detection:** Prevents overwriting already published scenario files if the digest or content differs.
   - **Multi-Exercise Playability Gate:** Validates every exercise in a scenario against its specific `targetExpectedStatus` across starter pass, reviewer trap, and defensive fix.

---

## ⏱️ 90-Second Classroom Viva Demo Script

| Timestamp | Speaker (Instructor / TA) | Visual Action on Projector |
| :--- | :--- | :--- |
| **00:00 - 00:20** | *"Welcome to QueryScope. Here is ticket PLC-204: Cancel Aarav Patel’s 10:00 AM Amazon Interview booking, while preserving their other bookings."* | Open `http://localhost:5173/`. Projector shows Ticket Card and candidate SQL: `WHERE student_id = 'STU-404'`. |
| **00:20 - 00:35** | *"Notice the candidate SQL filters by student_id. On this starter database, it appears to work: 'Passed on starter data · 1 registration changed'."* | Click **Preview changes**. Point to green status banner and the diff table showing booking #204 moving from `scheduled` → `cancelled`. |
| **00:35 - 00:55** | *"Now let's act as a reviewer. What happens if Aarav booked another interview later in the day? Let's click 'Test another booking'."* | Click **"Test another booking"**, then click **"Use supplied example"** (#188 Facebook Interview). Candidate query re-executes. |
| **00:55 - 01:15** | *"Look at the red banner: '2 registrations changed · 1 outside the ticket'. The query unintentionally wiped out Aarav’s 2:00 PM Facebook interview! The explanation makes it clear: 'Both bookings match Aarav’s student ID, so filtering by student ID selected both'."* | Highlight the red alert box, the unintended card on #188, and the requested change card on #204. |
| **01:15 - 01:30** | *"Now watch the student fix it: change the WHERE clause to `WHERE registration_id = 204;`. Click Preview changes. Now we see 'Passed on these test cases': #204 is cancelled and #188 is preserved. Click 'Share replay' to produce an instant replay link!"* | Edit query to `WHERE registration_id = 204;`. Click **Preview changes**. Green banner appears showing 1 changed, #188 preserved. Click **Share replay** to display link! |

---

## 📋 Three-Student Classroom Pilot Card

Use this observation sheet during lab sessions or peer code reviews:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                   BEFORE YOU COMMIT — CLASSROOM PILOT OBSERVATION CARD      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Student Name / ID:                                     Date:                │
│ Scenario Tested: [ ] Aarav Patel (Placement)   [ ] Rohan & Divya (Session)  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. INITIAL QUERY ATTEMPT (Starter Data)                                     │
│    SQL Written: ___________________________________________________________ │
│    Initial Outcome: [ ] Passed on Starter Data   [ ] Syntax Error           │
│    Did the student filter by student_id, session, or registration_id first? │
│    Finding: _______________________________________________________________ │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. REVIEWER CHALLENGE (Edge Case Injection)                                 │
│    Reviewer Row Added: ID #_______ Event: _________________________________ │
│    Outcome Observed: [ ] Unintended Regression Detected (Banner Red)        │
│    Rows Changed: _______ (Expected: 2) | Unintended: _______ (Expected: 1) │
│    Pedagogical Explanation Observed:                                        │
│    [ ] Aarav Student Scope ("Both bookings match Aarav's student ID...")    │
│    [ ] Rohan Session Scope ("Rohan and Divya belong to different...")       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. DEFENSIVE FIX & REPLAY SHARING                                           │
│    Refined SQL: ___________________________________________________________ │
│    Final Outcome: [ ] Passed on These Test Cases (Preserved Reviewer Row)   │
│    Share Link Generated: [ ] Cloud Replay [ ] Local Hash (#localReplay=)    │
│    Replay Reproduced on Partner Device? [ ] Yes  [ ] No                     │
│    Finding: _______________________________________________________________ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Consequential Engineering Choices

1. **SQL Execution Stays in the Browser (Client-Side WASM SQLite):**
   - **Zero Compute Risk:** Running arbitrary SQL on a backend server invites resource exhaustion, Denial-of-Service, multi-tenant state leaks, and execution latency.
   - **Local Web Worker Isolation:** Using `sql.js` in a browser Web Worker creates a fresh in-memory SQLite database in under **2 milliseconds**, isolated from the UI thread with a strict **2500ms hard timeout**. Edits are completely disposable.
   - **Cost & Zero Maintenance:** Students and faculty can practice infinite query variations with zero server compute bills.

2. **DynamoDB Stores Only Replay Recipes (Data, Not Compute):**
   - The cloud database stores lightweight recipes (scenario version, synthetic reviewer rows, candidate SQL text).
   - Pay-Per-Request (on-demand) billing means \$0 base cost.
   - Native DynamoDB TTL is enabled on `ttl` attribute (30-day retention) with expiration enforced on reads.
   - Privacy-safe: No real student PII, credentials, or production connection strings ever leave the browser.

3. **Explicit SQLite UPDATE Grammar & SQL Validator:**
   - Enforces a single statement adhering strictly to the `UPDATE registrations SET status = ... WHERE ...` grammar.
   - Preserves literal string values (`'cancelled'`) and quoted identifiers (`"status"`, `[status]`) completely intact without mangling or lowercasing.
   - Rejects multiple statements (`DROP TABLE`, chained queries), schema alterations (`ALTER TABLE`), deletions, or attempts to overwrite primary keys or student IDs.

4. **Self-Contained Local Replay Fallback (`#localReplay=`):**
   - If cloud connectivity is lost or AWS sharing fails, the app falls back to a self-contained URL-safe Base64 URL fragment (`#localReplay=...`) while reporting the exact network status. The app never produces a broken link.

5. **Separation of Bedrock Instructor Authoring from Student Runtime:**
   - LLMs should never sit on the critical path of student grading or SQL evaluation.
   - Bedrock (`apac.amazon.nova-micro-v1:0` in `ap-south-1`) acts strictly as an offline instructional design assistant: drafting relatable campus context, student names, and reviewer hints.
   - Hard relational integrity, starter/solution queries, and target IDs are generated from trusted templates and verified through an automated 3-step in-memory SQLite Playability Gate before code generation.
   - Students load statically validated challenges and replays with 0ms LLM latency and \$0 Bedrock cost at runtime.

6. **UI/UX Designed for Projectors & Student Laptops:**
   - **Warm Off-White Canvas & High Contrast:** `#FAF9F6` canvas, dark ink typography (`#1A1A2E`), and subtle borders (`#E5E2DC`) for readability across bright classrooms and student screens.
   - **Dedicated Projector Mode:** One-click toggle in the header enlarges typography (30px banner headline, 20px record titles, 18px expected callouts) for back-of-the-classroom visibility.
   - **Semantic Color Discipline:** Deep teal (`#0D7377`) for primary actions, dark slate editor (`#1E1E2E`) for code comfort, and red (`#DC2626`) strictly reserved for unintended regressions and mutations.
   - **Noise Reduction Disclosure:** Control/unchanged records are collapsed under an expandable disclosure ("Show N unchanged records"), keeping immediate student attention on mutated records.
   - **Responsive Hybrid:** Clean 2-column workspace for laptop screens (1366×768); stacked card layout on mobile (390px) avoiding horizontal table cutoff.

---

## 🤖 Bedrock Instructor Authoring Tool (Two-Stage Preview & Approval)

Instructors draft and preview fresh challenges using Amazon Bedrock, which saves a local draft JSON. Approval consumes that exact reviewed draft locally without requiring Bedrock:

```bash
# Stage 1: Preview a new challenge draft with Bedrock (saves to .drafts/<id>.json)
npm run author-challenge -- --exercise student-scope --setting "IIT Bombay Placement Season"

# Stage 2: Approve and publish the exact reviewed draft (works 100% offline, zero Bedrock needed)
npm run author-challenge -- --approve --draft <draft-id-or-path> --digest <sha256-hex>
```

### The 3-Step SQLite Playability Gate:
Before a generated scenario can be approved, it must automatically pass three in-memory SQLite checks across all defined exercises:
1. **Initial Seed Pass:** Starter query on initial seed rows modifies only the target registration (`#204`).
2. **Reviewer Trap Detection:** Reviewer edge case triggers a regression (2 rows modified, 1 unintended change).
3. **Defensive Fix Pass:** Solution query modifies only the target registration (`#204`) and preserves all other rows.

---

## 🚀 Quickstart & Local Development

Run the starter app locally with standard npm commands:

```bash
# 1. Install dependencies
npm install

# 2. Start local development server (serves local SQLite WASM automatically)
npm run dev

# 3. Run automated unit and integration tests (73 tests across 9 suites)
npm test

# 4. Run linter (oxlint)
npm run lint

# 5. Build production bundles (frontend Vite build + backend Lambda build)
npm run build
cd backend && npm run build && cd ..

# 6. Run end-to-end browser verification suite (19 assertions & 4 screenshots)
node scripts/verifyFlows.mjs
```

Open `http://localhost:5173/` in your browser.

---

## 🧪 Automated Testing

### Test Suite Coverage (73 passing tests across 9 test suites):

```bash
npm test
```

1. **`sqlValidator.test.ts` (14 tests):** SQLite grammar validation, quotes preservation, comments stripping, and rejection of forbidden statements (`DELETE`, `INSERT`, multiple statements).
2. **`diffEngineContract.test.ts` (8 tests):** SQLite UPDATE contract, row classification, student-scope explanation (Aarav), session-scope explanation (Rohan & Divya), and factual evidence fallback.
3. **`replays.test.ts` (10 tests):** Schema validation, duplicate ID rejection, seed collision checks, safe-integer verification, and scenario version resolution.
4. **`replayFallback.test.ts` (6 tests):** URL hash fragment `#localReplay=` generation and decoding, URL-safe Base64 (`-`, `_`), space recovery, rejection handling without homepage fallback, and invalid replayId rejection.
5. **`placementDrive.test.ts` (7 tests):** Placement Drive scenario validation, session-scope vs student-scope presets, and absence of unsupported columns.
6. **`engine.test.ts` (8 tests):** In-memory SQLite execution, diff calculation, zero-row updates, wrong value detection, and timeout recovery.
7. **`reviewUi.test.tsx` (6 tests):** UI contract tests for unintended booking detection, preserved reviewer rows, stale query indicators, and Rohan & Divya session-scope rendering.
8. **`authoringApproval.test.ts` (6 tests):** Offline instructor challenge approval, SHA-256 draft digest verification, scenario registry partial-write recovery, conflicting content rejection, and multi-exercise playability validation.
9. **`lambdaHandler.test.ts` (8 tests):** Serverless Lambda handler tests covering save, read, payload size limit (32KB cap), JSON null body safety (HTTP 400), 404 not found, 410 expired TTL, and test double isolation.

### End-to-End Browser Verification (`scripts/verifyFlows.mjs` — 19 assertions):
- **Flow 1:** Aarav starter challenge, starter pass banner, Test Another Booking activation, and unintended change detection on #188 with Aarav student ID explanation.
- **Flow 2:** Custom reviewer booking creation, preserving student SQL in editor.
- **Flow 3:** Corrected query fix (`WHERE registration_id = 204;`), stale query indicator, test case pass banner, preserved booking card, and share replay modal.
- **Flow 4:** Keyboard accessibility (Tab navigation, Enter activation, Escape key dialog dismissal).
- **Flow 5:** Corrected replay on mobile viewport (390×844) with zero horizontal overflow, visible preserved cards, and mobile exercise selector.
- **Flow 6:** Rohan Verma & Divya Sharma session-scope explanation asserting event and time explanation and verifying that student ID filtering is **never** claimed.
- **Flow 7:** Projector Mode high-contrast typography scaling (30px banner headline, 20px title).
- **Flow 8:** Error resilience against malformed/expired replay IDs and Start Fresh challenge recovery button.
- **Flow 9:** Clean reopening and execution of generated replay URLs in isolated tabs.

---

## 📸 Verified Classroom Evidence

The four required classroom screenshots are saved at both the project root and the artifact directory:

| Screenshot | Description | Project Root Path | Artifact Directory Path |
| :--- | :--- | :--- | :--- |
| **Aarav Faulty Desktop** | Desktop (1366×768) showing #188 unintended card with student ID explanation and #204 requested change | [aarav-faulty-desktop.png](file:///d:/Mini%20Project/aarav-faulty-desktop.png) | [aarav-faulty-desktop.png](file:///C:/Users/chand/.gemini/antigravity/brain/e9088c07-8249-466b-8144-69d220fe2b53/aarav-faulty-desktop.png) |
| **Aarav Corrected Mobile** | Phone (390×844) showing #204 cancelled, #188 preserved, and 0px horizontal overflow | [aarav-corrected-mobile.png](file:///d:/Mini%20Project/aarav-corrected-mobile.png) | [aarav-corrected-mobile.png](file:///C:/Users/chand/.gemini/antigravity/brain/e9088c07-8249-466b-8144-69d220fe2b53/aarav-corrected-mobile.png) |
| **Rohan & Divya Explanation** | Desktop showing session-scope explanation (*"share the same Google Interview event and time"*) with no student ID text | [rohan-divya-explanation.png](file:///d:/Mini%20Project/rohan-divya-explanation.png) | [rohan-divya-explanation.png](file:///C:/Users/chand/.gemini/antigravity/brain/e9088c07-8249-466b-8144-69d220fe2b53/rohan-divya-explanation.png) |
| **Projector Mode** | Desktop in Projector Mode showing high-contrast typography (30px headline, 20px title) | [projector-mode.png](file:///d:/Mini%20Project/projector-mode.png) | [projector-mode.png](file:///C:/Users/chand/.gemini/antigravity/brain/e9088c07-8249-466b-8144-69d220fe2b53/projector-mode.png) |

---

## ☁️ AWS Cloud Deployment (SAM / CloudFormation)

The infrastructure is provisioned using AWS CloudFormation / SAM with least-privilege IAM and zero always-on compute.

### Prerequisites:
- AWS CLI configured with credentials in target region (default `ap-south-1`).
- Node.js 22+

### Deployment Commands:

```bash
# 1. Build backend Lambda bundle
cd backend
npm install
npm run build
cd ..

# 2. Build and package frontend
npm run build

# 3. Update Lambda function code and configuration
Compress-Archive -Path backend/dist/index.mjs -DestinationPath backend/dist/index.zip -Force
aws lambda update-function-configuration --function-name before-you-commit-stack-ReplaysFunction-t3B6YZGdCblb --runtime nodejs22.x --region ap-south-1
aws lambda update-function-code --function-name before-you-commit-stack-ReplaysFunction-t3B6YZGdCblb --zip-file fileb://backend/dist/index.zip --region ap-south-1

# 4. Sync frontend assets to S3 and invalidate CloudFront
aws s3 sync dist s3://before-you-commit-app-135100771834-ap-south-1 --delete
aws s3 cp dist/sql-wasm-browser.wasm s3://before-you-commit-app-135100771834-ap-south-1/sql-wasm-browser.wasm --content-type "application/wasm"
aws s3 cp dist/sql-wasm.wasm s3://before-you-commit-app-135100771834-ap-south-1/sql-wasm.wasm --content-type "application/wasm"
aws cloudfront create-invalidation --distribution-id E3FO5MLX80MIDM --paths "/*"
```

---

## 🧹 Teardown & Clean-up

To avoid unnecessary costs, delete all provisioned AWS resources:

```bash
# 1. Empty the S3 frontend bucket
aws s3 rm s3://before-you-commit-app-135100771834-ap-south-1 --recursive

# 2. Delete the CloudFormation stack (deletes CloudFront, API Gateway, Lambda, DynamoDB, IAM roles)
aws cloudformation delete-stack --stack-name before-you-commit-stack --region ap-south-1
```
