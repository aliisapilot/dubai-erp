import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const loaded = new Map();
function load(file) {
  file = path.resolve(file);
  if (loaded.has(file)) return loaded.get(file);
  const exports = {};
  loaded.set(file, exports);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  new Function('exports', 'require', js)(exports, id => {
    if (id.startsWith('@/')) return load(path.resolve(id.slice(2)) + (id.includes('MeasurementTotals') ? '.tsx' : '.ts'));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id) + '.ts');
    return require(id);
  });
  return exports;
}
const {createDocumentPreviewCache} = load('lib/documentPreviewCache.ts');
let time = 0, requests = 0;
const cache = createDocumentPreviewCache(30, () => time);
const read = async () => { requests++; await new Promise(resolve => setTimeout(resolve, 25)); return {name:'Saved design'}; };
const coldStart = performance.now();
const [one, two] = await Promise.all([cache.load('company:a', read), cache.load('company:a', read)]);
const coldMs = performance.now() - coldStart;
assert.equal(requests, 1, 'Concurrent previews share one cloud request');
assert.deepEqual(one, two);
one.name = 'Edited draft';
const warmStart = performance.now();
assert.equal((await cache.load('company:a', read)).name, 'Saved design');
const warmMs = performance.now() - warmStart;
assert.equal(requests, 1, 'Warm preview performs no cloud read');
await cache.load('company:b', read);
assert.equal(requests, 2, 'Company/type scopes stay separate');
time = 31;
await cache.load('company:a', read);
assert.equal(requests, 3, 'Expired previews refresh');
await cache.load('company:a', read, true);
assert.equal(requests, 4, 'Retry forces a fresh read');
let complete;
const stale = cache.load('pending', () => new Promise(resolve => { complete = resolve; }));
cache.clear();
complete({name:'Old account'});
await stale;
assert.equal(cache.peek('pending'), undefined, 'Invalidation rejects late cache population');
await assert.rejects(cache.load('failed', async () => {throw new Error('offline');}), /offline/);
assert.equal(cache.peek('failed'), undefined, 'Failed reads are never cached');
await cache.load('failed', read);

const {createDocumentCloud} = load('lib/documentCloud.ts');
let cloudReads = 0;
const snapshot = {template: {id:'style', company_id:'co', document_type:'measurement_sheet', template_name:'Saved', version:1, layout_json:{documentType:'measurement_sheet', elements:[]}}, selection_version:1};
const cloud = createDocumentCloud({rpc: async name => {
  if (name === 'read_document_design') cloudReads++;
  return {data:structuredClone(snapshot), error:null};
}});
await cloud.loadPreview('co', 'measurement_sheet');
await cloud.loadPreview('co', 'measurement_sheet');
assert.equal(cloudReads, 1);
await cloud.load('co', 'measurement_sheet');
await cloud.load('co', 'measurement_sheet');
assert.equal(cloudReads, 3, 'Editor/conflict reads bypass preview cache');
await cloud.mutate('co', snapshot.template, 'select', 1);
assert.equal(cloud.peekPreview('co', 'measurement_sheet'), undefined, 'Selection change invalidates preview');
await cloud.loadPreview('co', 'measurement_sheet');
await cloud.save('co', 'measurement_sheet', snapshot.template.layout_json, {templateId:'style',version:1,selectionVersion:1}, 'Saved');
assert.equal(cloud.peekPreview('co', 'measurement_sheet'), undefined, 'Successful save invalidates preview');
cloud.clearPreviewCache();

const {measurementSummary, measurementSummaryHeight, fitMeasurementSummaryLayout} = load('lib/measurementPdfSummary.ts');
const document = {subtotal:7052.8, vat_amount:352.64, total_amount:7405.44, vat_rate:5,
  items:[{quantity:30,result_unit:'m',calculated_total:1410.56}]};
const rows = measurementSummary(document).rows;
assert.equal(rows[1].value, '1,410.560 m');
assert.equal(rows.find(row => row.kind === 'total').value, 'AED 7,405.44');
assert.equal(measurementSummary({...document, vat_amount:0, total_amount:7052.8}).rows.find(row => row.kind === 'vat').value, 'AED 0.00');
assert.equal(measurementSummary({...document, vat_rate:0}).rows.find(row => row.kind === 'vat').label, 'VAT (0%):');
assert.equal(measurementSummary({...document, vat_rate:10}).rows.find(row => row.kind === 'vat').label, 'VAT (10%):');
assert.equal(measurementSummary(document, true).rows.find(row => row.kind === 'total').value, 'AED 7,052.80');
const mixed = measurementSummary({...document,items:[...document.items,{quantity:2,result_unit:'m²',calculated_total:10.125}]});
assert.equal(mixed.rows.find(row => row.label === 'Total Square Metres:').value, '10.125 m²');
const totals = {id:'totals',type:'totals',visible:true,x:121,y:165,width:77,height:20,fontSize:10, padding:2,zIndex:2};
const layout = {documentType:'measurement_sheet',elements:[totals]};
const before = structuredClone(layout);
const fitted = fitMeasurementSummaryLayout(layout, document);
assert.deepEqual(layout,before, 'Saved geometry is never mutated');
assert.ok(fitted.elements[0].runtimeMinHeight > totals.height, 'Short summary boxes reserve readable height');
assert.equal(fitMeasurementSummaryLayout({...layout,documentType:'tax_invoice'},document).elements[0],totals);
const {calculateFollowerVerticalSpan} = load('lib/documentLayoutEngine.ts');
assert.ok(calculateFollowerVerticalSpan(fitted.elements,0.62,2) >= measurementSummaryHeight(totals,document), 'Dense fitting cannot shrink below summary content');

const {waitForDocumentImages} = load('lib/printAssets.ts');
class ImageMock extends EventTarget {
  complete = false;
  loading = 'lazy';
  async decode() {}
}
const image = new ImageMock();
const imageReady = waitForDocumentImages([image],100);
image.complete = true;
image.dispatchEvent(new Event('load'));
await imageReady;
assert.equal(image.loading,'eager');
await assert.rejects(waitForDocumentImages([new ImageMock()],5), /still loading/);
const completeImage = new ImageMock(); completeImage.complete = true;
await waitForDocumentImages([completeImage],5);

if (process.env.PDF_QA_DIR) {
  const React = require('react');
  const {renderToStaticMarkup} = require('react-dom/server');
  const MeasurementTotals = load('components/documents/MeasurementTotals.tsx').default;
  const css = fs.readdirSync('.next/static/chunks').filter(file => file.endsWith('.css')).map(file => fs.readFileSync(`.next/static/chunks/${file}`,'utf8')).join('\n');
  fs.mkdirSync(process.env.PDF_QA_DIR,{recursive:true});
  const summaryHtml = renderToStaticMarkup(React.createElement(MeasurementTotals,{element:totals,data:document,appearance:{padding:'2mm'},colors:{primary:'#0F172A',muted:'#64748B',border:'#CBD5E1',totalHighlight:'#F8F6ED'}}));
  fs.writeFileSync(path.join(process.env.PDF_QA_DIR,'measurement-summary.html'), `<!doctype html><html><head><style>${css}</style></head><body style="background:white;color:#0f172a;padding:20px"><div id="summary-box" style="width:77mm;height:${measurementSummaryHeight(totals,document)}mm">${summaryHtml}</div></body></html>`);
}
console.log(`PASS preview cache/scope/expiry/retry/invalidation/editor freshness, measurement formatting/zero VAT/layout preservation, and bounded image waits. Simulated 25ms cloud read: cold ${coldMs.toFixed(2)}ms; warm ${warmMs.toFixed(2)}ms; no repeat cloud request.`);
