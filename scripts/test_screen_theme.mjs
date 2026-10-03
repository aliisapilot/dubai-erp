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
const cases = [
  ['gold-action', 'bg-amber-500 text-slate-950'],
  ['card', 'bg-white text-slate-900 border border-slate-200'],
  ['header', 'bg-slate-50 text-slate-700'],
  ['footer', 'bg-slate-50/50 text-slate-600'],
  ['pill', 'bg-slate-100 text-slate-700'],
  ['hover-action', 'bg-slate-100 text-slate-700 hover:bg-slate-900 hover:text-white'],
  ['disabled-row', 'bg-slate-100/50 text-slate-500'],
  ['success', 'bg-emerald-50/50 text-emerald-800 border border-emerald-200'],
  ['warning', 'bg-amber-50 text-amber-800 border border-amber-200'],
  ['danger', 'bg-red-50 text-red-700 border border-red-200'],
  ['info', 'bg-blue-50/50 text-blue-800 border border-blue-200'],
];
const documents = ['print-document', 'document-sheet', 'dynamic-document-pages', 'dynamic-document-page', 'print-page', 'erp-document-surface'];
const markup = cases.map(([id, classes]) => `<div id="${id}" class="${classes}">${id}</div>`).join('');
fs.writeFileSync(fixture, `<!doctype html><html><head><style>${css}</style></head><body>
<section id="theme" class="erp-screen-theme">${markup}
<input id="month" type="month"><input id="disabled-input" type="text" disabled class="disabled:bg-slate-100">
<select id="select"><option>Example</option></select><textarea id="textarea"></textarea>
${documents.map((name, i) => `<div class="${name} bg-white text-slate-900" id="doc-root-${i}"><div id="doc-child-${i}" class="bg-slate-50 text-slate-700 border border-slate-200">Document</div><input id="doc-input-${i}" type="text" class="bg-white text-slate-900"></div>`).join('')}
</section><div id="outside" class="bg-white text-slate-900">Outside desktop theme</div>
</body></html>`);
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
  for (let n = 0; n < 100; n++) { if (await evaluate('document.readyState === "complete" && !!document.getElementById("theme")')) break; await pause(100); }
  const snapshot = `Object.fromEntries([...document.querySelectorAll('[id]')].filter(el => el.id !== 'theme').map(el => { const s = getComputedStyle(el); return [el.id, {background:s.backgroundColor, color:s.color, border:s.borderColor, scheme:s.colorScheme}]; }))`;
  await evaluate(`document.getElementById('theme').classList.remove('erp-screen-theme')`);
  const baseline = await evaluate(snapshot);
  await evaluate(`document.getElementById('theme').classList.add('erp-screen-theme')`);
  const screen = await evaluate(snapshot);
  assert.deepEqual(screen['gold-action'], baseline['gold-action'], 'Solid gold buttons must preserve contrasting navy labels');
  assert.equal(screen.card.background, 'rgb(17, 24, 39)');
  assert.equal(screen.card.color, 'rgb(248, 250, 252)');
  assert.equal(screen.header.background, 'rgb(13, 21, 38)');
  assert.notEqual(screen.footer.background, baseline.footer.background);
  assert.equal(screen.pill.background, 'rgb(13, 21, 38)');
  for (const id of ['success', 'warning', 'danger', 'info', 'disabled-row']) assert.notDeepEqual(screen[id], baseline[id], id);
  for (const id of ['month', 'disabled-input', 'select', 'textarea']) { assert.equal(screen[id].background, 'rgb(13, 21, 38)', id); assert.equal(screen[id].scheme, 'dark', id); }
  assert.equal(screen['disabled-input'].color, 'rgb(148, 163, 184)');
  assert.deepEqual(screen.outside, baseline.outside, 'Public/mobile surfaces must retain their styles');
  for (let i = 0; i < documents.length; i++) for (const kind of ['root', 'child', 'input']) assert.deepEqual(screen[`doc-${kind}-${i}`], baseline[`doc-${kind}-${i}`], `${documents[i]} ${kind} must retain its styles`);
  const bounds = await evaluate("(() => { const r = document.getElementById('hover-action').getBoundingClientRect(); return {x:r.x + 2, y:r.y + 2}; })()");
  await command('Input.dispatchMouseEvent', {type:'mouseMoved', ...bounds});
  const hovered = await evaluate(snapshot);
  assert.notEqual(hovered['hover-action'].background, screen['hover-action'].background, 'Dark action hover must remain visible');
  assert.equal(hovered['hover-action'].color, 'rgb(255, 255, 255)', 'Hover label must stay white');
  await command('Input.dispatchMouseEvent', {type:'mouseMoved', x:0, y:0});
  // Actual print-media rendering must be identical with or without theme scope.
  await command('Emulation.setEmulatedMedia', {media: 'print'});
  const print = await evaluate(snapshot);
  await evaluate(`document.getElementById('theme').classList.remove('erp-screen-theme')`);
  assert.deepEqual(print, await evaluate(snapshot), 'Theme must have no effect on print');
  console.log('PASS shipped CSS: navy cards/table/opacity/pills/disabled controls, semantic accents, all document roots and descendants, public isolation, and unchanged print media');
} finally {
  if (socket) socket.close();
  browser.kill();
  await pause(500);
  // temp was created by this test under the platform temporary directory.
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep), 'Cleanup must stay in the temporary directory');
  fs.rmSync(temp, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
}
