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
    this.ws.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ARTIFACT_DIR = 'C:\\Users\\chand\\.gemini\\antigravity\\brain\\e9088c07-8249-466b-8144-69d220fe2b53';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function startChrome() {
  console.log('Spawning headless Chrome...');
  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--user-data-dir=d:\\Mini Project\\.chrome_dev',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
  ]);

  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) {
        console.log('Chrome remote debugging is ready.');
        return proc;
      }
    } catch {}
    await sleep(400);
  }
  throw new Error('Chrome failed to start on port 9222');
}

async function runScenario({ name, url, width, height, mobile, actions, outputFile }) {
  console.log(`\n=== Running: ${name} ===`);
  console.log(`URL: ${url}`);
  console.log(`Viewport: ${width}x${height} (mobile=${mobile})`);

  // Create new tab
  const newTabRes = await fetch('http://127.0.0.1:9222/json/new', { method: 'PUT' });
  const tab = await newTabRes.json();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile: !!mobile,
    });

    console.log(`Navigating to ${url}...`);
    await client.send('Page.navigate', { url });

    // Wait for load event
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 8000); // max wait
      client.on('Page.loadEventFired', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    // Wait for SQLite wasm and React render
    console.log('Waiting 4s for SQLite WASM and React rendering...');
    await sleep(4000);

    // Custom actions if any
    if (actions) {
      await actions(client);
    }

    // Inspect DOM state
    const domInfo = await client.send('Runtime.evaluate', {
      expression: `({
        title: document.title,
        bodyBg: window.getComputedStyle(document.body).backgroundColor,
        bodyColor: window.getComputedStyle(document.body).color,
        h1: document.querySelector('h1')?.textContent,
        statusHeadline: document.querySelector('h3')?.textContent,
        statusBannerText: document.querySelector('.border.rounded-xl')?.textContent?.slice(0, 150),
        buttonCount: document.querySelectorAll('button').length,
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean),
        hasAffectedBooking: document.body.innerText.includes('Affected Booking'),
        changedRowCount: document.querySelectorAll('tbody tr').length
      })`,
      returnByValue: true,
    });

    console.log('DOM Evaluation:', domInfo.result?.value);

    // Capture screenshot
    const { data } = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });

    const buffer = Buffer.from(data, 'base64');
    const artifactPath = path.join(ARTIFACT_DIR, outputFile);
    fs.writeFileSync(artifactPath, buffer);
    console.log(`Saved screenshot to artifact: ${artifactPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

    // Also save in repo root for backup
    const repoPath = path.join(process.cwd(), outputFile);
    fs.writeFileSync(repoPath, buffer);

    return domInfo.result?.value;
  } finally {
    client.close();
    await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`).catch(() => {});
  }
}

async function main() {
  const chromeProc = await startChrome();
  const results = {};

  try {
    // 1. Fresh Aarav challenge on laptop (1366x768)
    results.freshLaptop = await runScenario({
      name: 'Fresh Challenge (Laptop 1366x768)',
      url: 'https://dlmstyklbxdtu.cloudfront.net/?scenario=scenario-bedrock-student-scope-mwrs6sns',
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'fresh-challenge-after.png',
    });

    // 2. Click "Test another booking" on fresh challenge
    results.testAnotherBooking = await runScenario({
      name: 'Test Another Booking Clicked (Laptop 1366x768)',
      url: 'https://dlmstyklbxdtu.cloudfront.net/?scenario=scenario-bedrock-student-scope-mwrs6sns',
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'test-another-booking-after.png',
      actions: async (client) => {
        console.log('Clicking "Test another booking" button...');
        const clickRes = await client.send('Runtime.evaluate', {
          expression: `(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Test another booking'));
            if (btn) {
              btn.click();
              return { clicked: true, text: btn.textContent };
            }
            return { clicked: false };
          })()`,
          returnByValue: true,
        });
        console.log('Click result:', clickRes.result?.value);
        console.log('Waiting 3s for re-run...');
        await sleep(3000);
      },
    });

    // 3. Faulty replay on laptop (1366x768)
    results.faultyLaptop = await runScenario({
      name: 'Faulty Replay (Laptop 1366x768)',
      url: 'https://dlmstyklbxdtu.cloudfront.net/?replay=f66578b25a30',
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'faulty-replay-after.png',
    });

    // 4. Corrected replay on phone (390x844)
    results.correctedPhone = await runScenario({
      name: 'Corrected Replay (Phone 390x844)',
      url: 'https://dlmstyklbxdtu.cloudfront.net/?replay=6589483ac532',
      width: 390,
      height: 844,
      mobile: true,
      outputFile: 'corrected-replay-phone-after.png',
    });

    // 5. Legacy Cloud Quest replay (1366x768)
    results.cloudQuest = await runScenario({
      name: 'Cloud Quest Legacy Replay (Laptop 1366x768)',
      url: 'https://dlmstyklbxdtu.cloudfront.net/?replay=98859cee33a8',
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'legacy-cloud-quest-after.png',
    });

    // 6. Placement Drive v1.1.0 verification (no "Room 3")
    results.placementDrive = await runScenario({
      name: 'Placement Drive v1.1.0 (Laptop 1366x768)',
      url: 'https://dlmstyklbxdtu.cloudfront.net/?scenario=placement-drive-v1.1.0',
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'placement-drive-v1-1-0.png',
    });

    // 7. Client-side local replay via hash fragment
    const localRecipe = {
      scenarioId: 'scenario-bedrock-student-scope-mwrs6sns',
      scenarioVersion: '1.1.0',
      exerciseId: 'student-scope',
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
      sql: "UPDATE registrations SET status = 'cancelled' WHERE registration_id = 204;",
    };
    const localHash = Buffer.from(JSON.stringify(localRecipe), 'utf-8').toString('base64url');
    results.localHash = await runScenario({
      name: 'Local Hash Fragment Replay (#localReplay=...) (Laptop 1366x768)',
      url: `https://dlmstyklbxdtu.cloudfront.net/#localReplay=${localHash}`,
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'local-hash-replay.png',
    });

    console.log('\n=== ALL SCENARIOS COMPLETED ===');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    try {
      chromeProc.kill();
    } catch {}
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
