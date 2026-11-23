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
      if (res.ok) return proc;
    } catch {}
    await sleep(400);
  }
  throw new Error('Chrome failed to start on port 9222');
}

async function captureView({ name, url, width, height, mobile, outputFile }) {
  console.log(`\nCapturing: ${name} (${width}x${height}, mobile=${mobile}) -> ${url}`);
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

    await client.send('Page.navigate', { url });
    await sleep(4000); // Wait for WASM & React

    const domInfo = await client.send('Runtime.evaluate', {
      expression: `({
        title: document.title,
        heading: document.querySelector('h1')?.textContent,
        bannerHeading: document.querySelector('h3')?.textContent,
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean),
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      })`,
      returnByValue: true,
    });

    console.log('DOM info:', domInfo.result?.value);

    const { data } = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });

    const buffer = Buffer.from(data, 'base64');
    const artifactPath = path.join(ARTIFACT_DIR, outputFile);
    fs.writeFileSync(artifactPath, buffer);
    console.log(`Saved screenshot to: ${artifactPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

    return domInfo.result?.value;
  } finally {
    client.close();
    await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`).catch(() => {});
  }
}

async function main() {
  const chromeProc = await startChrome();
  try {
    // 1. Fresh Aarav challenge on Desktop 1366x768
    await captureView({
      name: 'Fresh Aarav Challenge (Desktop 1366x768)',
      url: 'http://localhost:5173/?scenario=scenario-bedrock-student-scope-mwrs6sns',
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'audit-fresh-desktop-before.png',
    });

    // 2. Faulty Aarav Replay on Desktop 1366x768
    await captureView({
      name: 'Faulty Aarav Replay (Desktop 1366x768)',
      url: 'http://localhost:5173/?replay=f66578b25a30',
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'audit-faulty-desktop-before.png',
    });

    // 3. Corrected Replay on Phone 390x844
    await captureView({
      name: 'Corrected Replay (Phone 390x844)',
      url: 'http://localhost:5173/?replay=6589483ac532',
      width: 390,
      height: 844,
      mobile: true,
      outputFile: 'audit-corrected-phone-before.png',
    });

    // 4. Placement Drive on Desktop 1366x768
    await captureView({
      name: 'Placement Drive (Desktop 1366x768)',
      url: 'http://localhost:5173/?scenario=scenario-placement-drive-rohan',
      width: 1366,
      height: 768,
      mobile: false,
      outputFile: 'audit-placement-drive-before.png',
    });

    console.log('\nAudit captures completed successfully!');
  } finally {
    try { chromeProc.kill(); } catch {}
  }
}

main().catch(console.error);
