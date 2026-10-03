import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

// Run after npm run build: exercise the shipped CSS, including utility order.
const chunks = path.join(process.cwd(), '.next/static/chunks');
const css = fs.readdirSync(chunks).filter(name => name.endsWith('.css'))
  .map(name => fs.readFileSync(path.join(chunks, name), 'utf8')).join('\n');
assert.ok(css.includes('erp-screen-theme'), 'Build the app before running this check');
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-screen-theme-'));
const profile = path.join(temp, 'profile');
const fixture = path.join(temp, 'fixture.html');
fs.writeFileSync(fixture, `<!doctype html><html><head><style>${css}</style></head><body>
<nav id="navbar">Navigation</nav><div data-print-root><main><div id="report" class="app-screen-content no-print">
<div id="controls" class="no-print"><button>Export</button></div><h1>Statement of Account</h1>
<table><thead><tr><th>Credit</th><th>Running balance</th></tr></thead><tbody>
<tr><td>5,899.00</td><td>-5,899.00 AED</td></tr><tr><td>18,000.00</td><td>-23,899.00 AED</td></tr>
<tr><td>300.00</td><td id="balance">-24,199.00 AED</td></tr></tbody></table>
</div></main></div></body></html>`);
const flags = ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`];
// Only opt out for this trusted local fixture when the host cannot start Chrome's sandbox.
if (process.env.ERP_CHROME_NO_SANDBOX === '1') flags.push('--no-sandbox', '--disable-software-rasterizer');
const browser = spawn(chrome, [...flags, pathToFileURL(fixture).href], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let n = 0; n < 100 && !fs.existsSync(portFile); n++) await pause(100);
  assert.ok(fs.existsSync(portFile), 'Chrome failed to start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  assert.ok(target, 'No fixture tab');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (!message.id) return; const task = pending.get(message.id); pending.delete(message.id); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); });
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params})); });
  const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, returnByValue: true }); assert.ok(!result.exceptionDetails, 'Fixture evaluation failed'); return result.result.value; };
  await command('Page.enable');
  for (let n=0; n<100; n++) { if(await evaluate('document.readyState === "complete" && !!document.getElementById("report")')) break; await pause(100); }
  await command('Emulation.setEmulatedMedia', {media:'print'});
  const visible = id => evaluate(`(() => {const e=document.getElementById('${id}');const s=getComputedStyle(e);return s.display!=='none' && s.visibility!=='hidden' && e.getBoundingClientRect().height>0;})()`);
  for(const active of [false,true]) {
    await evaluate(`document.body.classList.toggle('module-printing', ${active})`);
    assert.equal(await visible('report'),true,'Statement wrapper must print');
    assert.equal(await visible('balance'),true,'Closing balance must print');
    assert.equal(await visible('controls'),false,'Controls stay hidden');
    assert.equal(await visible('navbar'),false,'Navigation stays hidden');
  }
  await evaluate(`document.body.insertAdjacentHTML('beforeend','<div class="print-modal-container"><div class="print-document">A4 statement</div></div>')`);
  assert.equal(await visible('report'),false,'A4 modal hides background report');
  console.log('PASS print CSS: report and balance visible with page/browser printing; controls hidden; A4 modal isolated');

} finally {
  if (socket) socket.close();
  browser.kill();
  await pause(500);
  // temp was created by this test under the platform temporary directory.
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep), 'Cleanup must stay in the temporary directory');
  fs.rmSync(temp, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
}
