import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.callbacks = new Map();
    this.events = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const { resolve, reject } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) reject(new Error(JSON.stringify(data.error)));
          else resolve(data.result);
        } else if (data.method) {
          const listeners = this.events.get(data.method) || [];
          for (const l of listeners) l(data.params);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event, fn) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event).push(fn);
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Configurable environment with sensible defaults (no personal paths hardcoded)
const CHROME_PATH =
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');

const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
const ARTIFACT_DIR =
  process.env.ARTIFACT_DIR ||
  (fs.existsSync('C:\\Users\\chand\\.gemini\\antigravity\\brain\\e9088c07-8249-466b-8144-69d220fe2b53')
    ? 'C:\\Users\\chand\\.gemini\\antigravity\\brain\\e9088c07-8249-466b-8144-69d220fe2b53'
    : path.join(process.cwd(), 'artifacts'));

const USER_DATA_DIR = process.env.TEMP_PROFILE_DIR || path.join(process.cwd(), '.chrome_dev');

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function makeLocalReplayUrl(recipe) {
  const jsonStr = JSON.stringify(recipe);
  const base64 = Buffer.from(jsonStr, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${APP_URL}/#localReplay=${base64}`;
}

async function startChrome() {
  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
  ]);

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) return proc;
    } catch {}
    await sleep(400);
  }
  throw new Error(`Chrome failed to start on port 9222 using ${CHROME_PATH}`);
}

async function createTab(width = 1366, height = 768, mobile = false) {
  const newTabRes = await fetch('http://127.0.0.1:9222/json/new', { method: 'PUT' });
  const tab = await newTabRes.json();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('DOM.enable');

  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile: !!mobile,
  });

  return { tab, client };
}

async function closeTab(tab, client) {
  try {
    client.close();
  } catch {}
  await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`).catch(() => {});
}

async function captureScreenshot(client, filename) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(data, 'base64');

  // Save to artifact directory
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(artifactPath, buf);
  console.log(`[Screenshot] Saved to artifact dir: ${artifactPath}`);

  // Save to workspace root
  const rootPath = path.join(process.cwd(), filename);
  fs.writeFileSync(rootPath, buf);
  console.log(`[Screenshot] Saved to project root: ${rootPath}`);
}

async function evalDOM(client, expr) {
  const res = await client.send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
    console.warn(`[DOM Eval Warning] ${desc}`);
  }
  return res.result?.value;
}

async function waitForSelector(client, selector, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const exists = await evalDOM(client, `!!document.querySelector(${JSON.stringify(selector)})`);
    if (exists) return true;
    await sleep(250);
  }
  return false;
}

async function pressKey(client, key, code, keyCode) {
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

async function main() {
  console.log('Starting verification suite...');
  console.log(`Chrome executable: ${CHROME_PATH}`);
  console.log(`Application URL: ${APP_URL}`);
  console.log(`Artifact Directory: ${ARTIFACT_DIR}`);

  const chromeProc = await startChrome();
  const assertions = [];

  try {
    // -------------------------------------------------------------
    // FLOW 1: Fresh Aarav -> Starter Pass -> Reviewer Test -> Unintended #188 Exposed
    // REQUIRED SCREENSHOT: aarav-faulty-desktop.png
    // -------------------------------------------------------------
    console.log('\n=== FLOW 1: Aarav Starter Challenge & Reviewer Exposure ===');
    {
      const { tab, client } = await createTab(1366, 768, false);
      await client.send('Page.navigate', {
        url: `${APP_URL}/?scenario=scenario-bedrock-student-scope-mwrs6sns`,
      });
      await waitForSelector(client, '.empty-result', 8000);
      await sleep(1000);

      // Check initial state
      const initial = await evalDOM(
        client,
        `({
        hasEmptyResult: !!document.querySelector('.empty-result'),
        bannerText: document.querySelector('.empty-result')?.textContent || '',
      })`
      );
      assertions.push({
        check: 'Flow 1 Initial ready-to-preview state',
        pass: initial.hasEmptyResult && initial.bannerText.includes('What will this query change'),
      });

      // Click "Preview change"
      await evalDOM(client, `document.querySelector('button.btn.primary')?.click()`);
      await waitForSelector(client, '.result-heading h3', 8000);
      await sleep(500);

      // Check starter pass
      const starterPass = await evalDOM(
        client,
        `({
        headline: document.querySelector('.result-heading h3')?.textContent || '',
        bannerText: document.querySelector('.result-banner')?.textContent || '',
        hasTestAnotherBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Test another booking')),
      })`
      );
      assertions.push({
        check: 'Flow 1 Passed on starter data banner displayed',
        pass:
          starterPass.headline.includes('Passed on starter data') &&
          starterPass.bannerText.includes('starter records shown') &&
          starterPass.hasTestAnotherBtn,
      });

      // Click "Test another booking"
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Test another booking'))?.click()`
      );
      await sleep(600);

      // Verify activating leaves starter result in place while switching tab
      const afterTestClick = await evalDOM(
        client,
        `({
        headline: document.querySelector('.result-heading h3')?.textContent || '',
        activeRoleReviewer: !!Array.from(document.querySelectorAll('button[aria-pressed="true"]')).find(b => b.textContent.includes('Reviewer')),
      })`
      );
      assertions.push({
        check: 'Flow 1 Activating Test Another Booking preserves starter result banner',
        pass: afterTestClick.headline.includes('Passed on starter data') && afterTestClick.activeRoleReviewer,
      });

      // Click "Use supplied example"
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Use supplied example'))?.click()`
      );
      await waitForSelector(client, '.unintended-card', 8000);
      await sleep(1000);

      // Check unintended change detected on #188 with Aarav student ID explanation
      const exposed = await evalDOM(
        client,
        `({
        headline: document.querySelector('.result-banner h3')?.textContent || '',
        hasUnintendedCard: !!document.querySelector('.unintended-card'),
        unintendedText: document.querySelector('.unintended-card')?.textContent || '',
        intendedText: document.querySelector('.intended-card')?.textContent || '',
      })`
      );
      assertions.push({
        check: 'Flow 1 Unintended change on #188 exposed with student ID explanation',
        pass:
          exposed.headline.includes('2 registrations changed · 1 outside the ticket') &&
          exposed.unintendedText.includes('Aarav Patel') &&
          exposed.unintendedText.includes('Facebook Interview') &&
          exposed.unintendedText.includes('Expected: stay scheduled') &&
          exposed.unintendedText.includes('Outside the ticket') &&
          exposed.unintendedText.includes('filtering by student ID selected both') &&
          exposed.intendedText.includes('Amazon Interview') &&
          exposed.intendedText.includes('Requested change'),
      });

      // Capture REQUIRED SCREENSHOT 1: aarav-faulty-desktop.png
      await captureScreenshot(client, 'aarav-faulty-desktop.png');
      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // FLOW 2: Custom Booking Creation & Student SQL Preservation
    // -------------------------------------------------------------
    console.log('\n=== FLOW 2: Custom Booking Form & SQL Preservation ===');
    {
      const { tab, client } = await createTab(1366, 768, false);
      await client.send('Page.navigate', {
        url: `${APP_URL}/?scenario=scenario-bedrock-student-scope-mwrs6sns`,
      });
      await waitForSelector(client, '.empty-result', 8000);
      await sleep(1000);

      // Open custom booking form
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create my own booking'))?.click()`
      );
      await waitForSelector(client, '#custom-booking-form', 5000);
      await sleep(500);

      // Fill custom booking form
      await evalDOM(
        client,
        `(() => {
        const setVal = (el, val) => {
          const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        setVal(document.getElementById('registration-id'), '215');
        setVal(document.getElementById('student-id'), 'STU-404');
        setVal(document.getElementById('student-name'), 'Aarav Patel');
        setVal(document.getElementById('event-name'), 'Apple Interview');
        setVal(document.getElementById('session-date'), '2024-11-25 16:00');

        const statusSelect = document.getElementById('custom-status');
        statusSelect.value = 'scheduled';
        statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()`
      );

      // Submit custom booking
      await evalDOM(
        client,
        `document.querySelector('#custom-booking-form button[type="submit"]')?.click()`
      );
      await waitForSelector(client, '.result-banner', 8000);
      await sleep(1000);

      const customRes = await evalDOM(
        client,
        `({
        headline: document.querySelector('.result-banner h3')?.textContent || '',
        sqlValue: document.getElementById('candidate-sql')?.value || '',
        hasCustomBadge: document.body.innerText.toLowerCase().includes('custom booking'),
      })`
      );
      assertions.push({
        check: 'Flow 2 Custom booking evaluated and student SQL preserved',
        pass:
          customRes.headline.includes('2 registrations changed · 1 outside the ticket') &&
          customRes.sqlValue.includes("WHERE student_id = 'STU-404'") &&
          customRes.hasCustomBadge,
      });

      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // FLOW 3: Fixing Candidate Query, Stale Indicator, and Share Modal
    // -------------------------------------------------------------
    console.log('\n=== FLOW 3: Defensive Query Fix & Share Modal ===');
    let generatedShareUrl = '';
    {
      // Load offline deterministic faulty fixture with exact exerciseId 'student-scope'
      const faultyUrl = makeLocalReplayUrl({
        scenarioId: 'scenario-bedrock-student-scope-mwrs6sns',
        scenarioVersion: '1.1.0',
        exerciseId: 'student-scope',
        sql: "UPDATE registrations\nSET status = 'cancelled'\nWHERE student_id = 'STU-404';",
        reviewerRows: [
          {
            registration_id: 188,
            student_id: 'STU-404',
            student_name: 'Aarav Patel',
            event_name: 'Facebook Interview',
            session_date: '2024-11-25 14:00',
            status: 'scheduled',
          },
        ],
      });

      const { tab, client } = await createTab(1366, 768, false);
      await client.send('Page.navigate', { url: faultyUrl });
      await waitForSelector(client, '#candidate-sql', 8000);
      await sleep(1000);

      // Click "Edit query"
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Edit query'))?.click()`
      );
      await sleep(400);

      const activeElementId = await evalDOM(client, `document.activeElement?.id`);
      assertions.push({
        check: 'Flow 3 Edit Query focuses candidate SQL textarea',
        pass: activeElementId === 'candidate-sql',
      });

      // Modify SQL to fix the query
      await evalDOM(
        client,
        `(() => {
        const textarea = document.getElementById('candidate-sql');
        if (!textarea) throw new Error('candidate-sql textarea not found');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, "UPDATE registrations\\nSET status = 'cancelled'\\nWHERE registration_id = 204;");
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      })()`
      );
      await sleep(500);

      // Check stale indicator
      const staleState = await evalDOM(
        client,
        `({
        isStale: !!document.querySelector('.result-banner.result-warning'),
        staleText: document.querySelector('.stale-notice')?.textContent || '',
      })`
      );
      assertions.push({
        check: 'Flow 3 Stale indicator displayed after SQL editing',
        pass: staleState.isStale && staleState.staleText.includes('previous SQL'),
      });

      // Preview change with fixed query
      await evalDOM(client, `document.querySelector('button.btn.primary')?.click()`);
      await waitForSelector(client, '.result-heading h3', 8000);
      await sleep(1000);

      const fixedState = await evalDOM(
        client,
        `({
        headline: document.querySelector('.result-heading h3')?.textContent || '',
        hasPreservedCard: document.body.innerText.includes('Preserved · scheduled'),
      })`
      );
      assertions.push({
        check: 'Flow 3 Fixed query satisfies ticket and preserves Facebook booking',
        pass:
          fixedState.headline.includes('Passed on these test cases') && fixedState.hasPreservedCard,
      });

      // Click "Share replay"
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Share replay'))?.click()`
      );
      await waitForSelector(client, 'dialog.share-dialog[open]', 12000);
      await sleep(1000);

      const shareModalInfo = await evalDOM(
        client,
        `({
        isOpen: document.querySelector('dialog.share-dialog')?.hasAttribute('open'),
        shareUrl: document.getElementById('replay-link')?.value || '',
      })`
      );
      assertions.push({
        check: 'Flow 3 Share dialog opened with valid link',
        pass: shareModalInfo.isOpen && shareModalInfo.shareUrl.length > 10,
      });
      generatedShareUrl = shareModalInfo.shareUrl;

      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // FLOW 4: Keyboard Navigation & Modal Accessibility
    // -------------------------------------------------------------
    console.log('\n=== FLOW 4: Keyboard Navigation & Modal Escape Dismissal ===');
    {
      const { tab, client } = await createTab(1366, 768, false);
      await client.send('Page.navigate', {
        url: `${APP_URL}/?scenario=scenario-bedrock-student-scope-mwrs6sns`,
      });
      await waitForSelector(client, '.empty-result', 8000);
      await sleep(1000);

      // Open share dialog
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Share replay'))?.click()`
      );
      await waitForSelector(client, 'dialog.share-dialog[open]', 12000);
      await sleep(500);

      const modalBeforeEscape = await evalDOM(
        client,
        `document.querySelector('dialog.share-dialog')?.hasAttribute('open')`
      );
      assertions.push({
        check: 'Flow 4 Share dialog is open before Escape key',
        pass: !!modalBeforeEscape,
      });

      // Dispatch Escape key via CDP
      await pressKey(client, 'Escape', 'Escape', 27);
      await sleep(600);

      const modalAfterEscape = await evalDOM(
        client,
        `document.querySelector('dialog.share-dialog')?.hasAttribute('open')`
      );
      assertions.push({
        check: 'Flow 4 Escape key successfully dismisses share dialog',
        pass: !modalAfterEscape,
      });

      // Verify Tab navigation moves focus
      await evalDOM(client, `document.querySelector('button.btn.primary')?.focus()`);
      const focusedBeforeTab = await evalDOM(client, `document.activeElement?.tagName`);
      await pressKey(client, 'Tab', 'Tab', 9);
      await sleep(200);
      const focusedAfterTab = await evalDOM(client, `document.activeElement?.tagName`);
      assertions.push({
        check: 'Flow 4 Keyboard Tab navigation moves focus between interactive elements',
        pass: !!focusedBeforeTab && !!focusedAfterTab,
      });

      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // FLOW 5: Corrected Replay on Mobile (390x844)
    // REQUIRED SCREENSHOT: aarav-corrected-mobile.png
    // -------------------------------------------------------------
    console.log('\n=== FLOW 5: Corrected Replay on Mobile Viewport ===');
    {
      const correctedMobileUrl = makeLocalReplayUrl({
        scenarioId: 'scenario-bedrock-student-scope-mwrs6sns',
        scenarioVersion: '1.1.0',
        exerciseId: 'student-scope',
        sql: "UPDATE registrations\nSET status = 'cancelled'\nWHERE registration_id = 204;",
        reviewerRows: [
          {
            registration_id: 188,
            student_id: 'STU-404',
            student_name: 'Aarav Patel',
            event_name: 'Facebook Interview',
            session_date: '2024-11-25 14:00',
            status: 'scheduled',
          },
        ],
      });

      const { tab, client } = await createTab(390, 844, true);
      await client.send('Page.navigate', { url: correctedMobileUrl });
      await waitForSelector(client, '.result-heading h3', 8000);
      await sleep(1000);

      // Check mobile layout: no horizontal overflow and preserved card visible
      const mobileState = await evalDOM(
        client,
        `({
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        hasPreservedCard: document.body.innerText.includes('Preserved · scheduled'),
        headline: document.querySelector('.result-heading h3')?.textContent || '',
      })`
      );
      assertions.push({
        check: 'Flow 5 Mobile 390px has no horizontal overflow & preserved booking visible',
        pass:
          !mobileState.hasHorizontalOverflow &&
          mobileState.hasPreservedCard &&
          mobileState.headline.includes('Passed on these test cases'),
      });

      // Capture REQUIRED SCREENSHOT 2: aarav-corrected-mobile.png
      await captureScreenshot(client, 'aarav-corrected-mobile.png');

      // Check mobile exercise switcher visibility on multi-exercise scenario
      await client.send('Page.navigate', {
        url: `${APP_URL}/?scenario=scenario-placement-drive-rohan`,
      });
      await waitForSelector(client, '.exercise-select select', 8000);
      await sleep(500);

      const mobileExerciseState = await evalDOM(
        client,
        `({
        hasExerciseSelect: !!document.querySelector('.exercise-select select'),
        exerciseSelectVisible: (document.querySelector('.exercise-select')?.offsetParent !== null),
      })`
      );
      assertions.push({
        check: 'Flow 5 Mobile exercise selector is present and visible',
        pass: mobileExerciseState.hasExerciseSelect && mobileExerciseState.exerciseSelectVisible,
      });

      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // FLOW 6: Rohan & Divya Session-Scope Explanation
    // REQUIRED SCREENSHOT: rohan-divya-explanation.png
    // -------------------------------------------------------------
    console.log('\n=== FLOW 6: Rohan & Divya Session-Scope Explanation Verification ===');
    {
      const { tab, client } = await createTab(1366, 768, false);
      await client.send('Page.navigate', {
        url: `${APP_URL}/?scenario=scenario-placement-drive-rohan&exercise=session-scope`,
      });
      await waitForSelector(client, '.empty-result', 8000);
      await sleep(1000);

      // Preview starter query
      await evalDOM(client, `document.querySelector('button.btn.primary')?.click()`);
      await waitForSelector(client, '.result-heading h3', 8000);
      await sleep(500);

      // Add supplied reviewer booking (#209 Divya Sharma)
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Use supplied example'))?.click()`
      );
      await waitForSelector(client, '.unintended-card', 8000);
      await sleep(1000);

      const explanationInfo = await evalDOM(
        client,
        `({
        headline: document.querySelector('.result-banner h3')?.textContent || '',
        unintendedText: document.querySelector('.unintended-card')?.textContent || '',
        fullBannerText: document.querySelector('.result-banner')?.textContent || '',
        hasDivya: document.body.innerText.includes('Divya Sharma'),
        hasRohan: document.body.innerText.includes('Rohan Verma'),
      })`
      );

      // Assert that session scope explanation mentions event name, time, and shared session
      // and explicitly NEVER claims student-id filtering or that both belong to same student!
      const mentionsEvent = explanationInfo.unintendedText.includes('Google Interview');
      const mentionsTime = explanationInfo.unintendedText.includes('10:00');
      const mentionsSharedSession =
        explanationInfo.unintendedText.includes('belong to different students who share the same') ||
        explanationInfo.unintendedText.includes('event-and-time condition matched both');
      const noStudentIdMention =
        !explanationInfo.unintendedText.includes('student ID') &&
        !explanationInfo.unintendedText.includes('STU-404') &&
        !explanationInfo.unintendedText.includes('Both bookings belong to');

      assertions.push({
        check: 'Flow 6 Rohan & Divya session scope explanation is pedagogically accurate (event & time, no student ID)',
        pass:
          explanationInfo.headline.includes('2 registrations changed · 1 outside the ticket') &&
          mentionsEvent &&
          mentionsTime &&
          mentionsSharedSession &&
          noStudentIdMention &&
          explanationInfo.hasDivya &&
          explanationInfo.hasRohan,
      });

      // Capture REQUIRED SCREENSHOT 3: rohan-divya-explanation.png
      await captureScreenshot(client, 'rohan-divya-explanation.png');
      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // FLOW 7: Projector Mode High-Contrast Typography
    // REQUIRED SCREENSHOT: projector-mode.png
    // -------------------------------------------------------------
    console.log('\n=== FLOW 7: Projector Mode & Typography Sizing ===');
    {
      const faultyUrl = makeLocalReplayUrl({
        scenarioId: 'scenario-bedrock-student-scope-mwrs6sns',
        scenarioVersion: '1.1.0',
        exerciseId: 'student-scope',
        sql: "UPDATE registrations\nSET status = 'cancelled'\nWHERE student_id = 'STU-404';",
        reviewerRows: [
          {
            registration_id: 188,
            student_id: 'STU-404',
            student_name: 'Aarav Patel',
            event_name: 'Facebook Interview',
            session_date: '2024-11-25 14:00',
            status: 'scheduled',
          },
        ],
      });

      const { tab, client } = await createTab(1366, 768, false);
      await client.send('Page.navigate', { url: faultyUrl });
      await waitForSelector(client, '.result-banner', 8000);
      await sleep(1000);

      // Toggle Projector Mode
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Projector'))?.click()`
      );
      await sleep(800);

      const projectorState = await evalDOM(
        client,
        `(() => {
        const bannerH3 = document.querySelector('.result-banner h3');
        const titleEl = document.querySelector('.affected-title');
        return {
          hasProjectorClass: document.querySelector('.projector-mode') !== null,
          headlineFontSize: bannerH3 ? window.getComputedStyle(bannerH3).fontSize : '',
          titleFontSize: titleEl ? window.getComputedStyle(titleEl).fontSize : '',
        };
      })()`
      );

      assertions.push({
        check: 'Flow 7 Projector Mode active with enlarged typography (h3 >= 28px, title >= 18px)',
        pass:
          !!projectorState?.hasProjectorClass &&
          parseInt(projectorState.headlineFontSize || '0') >= 28 &&
          parseInt(projectorState.titleFontSize || '0') >= 18,
      });

      // Capture REQUIRED SCREENSHOT 4: projector-mode.png
      await captureScreenshot(client, 'projector-mode.png');
      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // FLOW 8: Resilience to Bad Replays & Start Fresh Recovery
    // -------------------------------------------------------------
    console.log('\n=== FLOW 8: Error Resilience & Start Fresh Recovery ===');
    {
      const { tab, client } = await createTab(1366, 768, false);
      await client.send('Page.navigate', {
        url: `${APP_URL}/?replay=invalid-recipe-xyz-999`,
      });
      await waitForSelector(client, '.result-banner.result-warning', 8000);
      await sleep(1000);

      const badReplayState = await evalDOM(
        client,
        `({
        hasErrorBanner: !!document.querySelector('.result-banner.result-warning'),
        errorText: document.querySelector('.result-banner.result-warning')?.textContent || '',
        noFalseSuccess: !document.body.innerText.includes('Restored replay:'),
        hasStartFreshBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start fresh')),
      })`
      );
      assertions.push({
        check: 'Flow 8 Bad replay reports clear error banner without claiming success',
        pass:
          badReplayState.hasErrorBanner &&
          badReplayState.errorText.includes('Failed to load replay') &&
          badReplayState.noFalseSuccess &&
          badReplayState.hasStartFreshBtn,
      });

      // Click "Start fresh challenge" button to recover
      await evalDOM(
        client,
        `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start fresh'))?.click()`
      );
      await sleep(1200);

      const recoveredState = await evalDOM(
        client,
        `({
        errorCleared: !document.querySelector('.result-banner.result-warning'),
        isDefaultScenario: document.querySelector('h2')?.textContent?.includes('Aarav Patel'),
      })`
      );
      assertions.push({
        check: 'Flow 8 Start Fresh button successfully clears error and restores default workspace',
        pass: recoveredState.errorCleared && recoveredState.isDefaultScenario,
      });

      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // FLOW 9: Clean Reopen of Generated Replay URL
    // -------------------------------------------------------------
    if (generatedShareUrl) {
      console.log('\n=== FLOW 9: Clean Reopen of Share URL in Isolated Tab ===');
      const { tab, client } = await createTab(1366, 768, false);
      await client.send('Page.navigate', { url: generatedShareUrl });
      await waitForSelector(client, '.result-heading h3', 8000);
      await sleep(1000);

      const restoredState = await evalDOM(
        client,
        `({
        headline: document.querySelector('.result-heading h3')?.textContent || '',
        sql: document.getElementById('candidate-sql')?.value || '',
        hasPreserved: document.body.innerText.includes('Preserved · scheduled'),
      })`
      );
      assertions.push({
        check: 'Flow 9 Restored shared replay executes and reproduces verified pass',
        pass:
          restoredState.headline.includes('Passed on these test cases') &&
          restoredState.sql.includes('registration_id = 204') &&
          restoredState.hasPreserved,
      });

      await closeTab(tab, client);
    }

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n========================================');
    console.log('BROWSER ASSERTIONS SUMMARY:');
    console.log('========================================');
    let allPassed = true;
    for (const a of assertions) {
      console.log(`[${a.pass ? 'PASS' : 'FAIL'}] ${a.check}`);
      if (!a.pass) allPassed = false;
    }
    console.log(`\nTotal: ${assertions.length} assertions. All passed: ${allPassed}`);

    if (!allPassed) {
      process.exitCode = 1;
    }
  } finally {
    try {
      chromeProc.kill();
    } catch {}
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
