import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('lib/print.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture() {
  let modal=null, blocked=false, prints=0, timers=0;
  const alerts=[];
  class Element {
    isConnected=true;
    sheet=true;
    querySelector(selector) {return selector.includes('blocked') ? (blocked ? {} : null) : (this.sheet ? {} : null);}
    querySelectorAll() {return [];}
  }
  const classes=new Set();
  const media=new EventTarget();
  const window=new EventTarget();
  window.matchMedia=()=>media;
  window.alert=message=>alerts.push(message);
  window.print=()=>prints++;
  window.setTimeout=()=>{timers++;};
  const document={body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},fonts:{ready:Promise.resolve()},
    querySelector(selector){if(selector.includes('print-modal-container'))return modal;if(selector.includes('blocked'))return blocked?{}:null;if(selector==='[data-print-root]')return {};return null;},
    querySelectorAll(){return [];}};
  const exports={};
  vm.runInNewContext(code,{exports,require:()=>({waitForDocumentImages:async()=>{}}),window,document,HTMLElement:Element,requestAnimationFrame:fn=>fn()});
  return {print:exports.printCurrentDocument,window,media,classes,alerts,document,Element,setModal:m=>{modal=m;},setBlocked:v=>{blocked=v;},counts:()=>({prints,timers})};
}
const report=fixture();
await Promise.all([report.print(),report.print()]);
assert.equal(report.counts().prints,1,'Repeated clicks must open one dialog');
assert.equal(report.counts().timers,0,'No timed cleanup while preview stays open');
assert.ok(report.classes.has('module-printing'));
report.window.dispatchEvent(new Event('afterprint'));
assert.equal(report.classes.has('module-printing'),false);
await report.print();assert.equal(report.counts().prints,2,'Printing resumes after cancellation');
const exit=new Event('change');Object.defineProperty(exit,'matches',{value:false});report.media.dispatchEvent(exit);
assert.equal(report.classes.has('module-printing'),false,'Media exit cleans up when afterprint is absent');
await report.print();assert.equal(report.counts().prints,3);
report.window.dispatchEvent(new Event('afterprint'));
const loading=fixture(),modal=new loading.Element();modal.sheet=false;loading.setModal(modal);
await loading.print();assert.equal(loading.counts().prints,0,'Loading mobile preview must not export blank PDF');
assert.match(loading.alerts[0],/finish loading/);
modal.sheet=true;await loading.print();assert.equal(loading.counts().prints,1,'Ready preview can print');loading.window.dispatchEvent(new Event('afterprint'));
const changing=fixture(),sheet=new changing.Element();changing.setModal(sheet);
let finish;changing.document.fonts.ready=new Promise(resolve=>{finish=resolve;});
const pending=changing.print();sheet.isConnected=false;finish();await pending;
assert.equal(changing.counts().prints,0,'Closed previews must not print after pending asset preparation');
assert.match(changing.alerts[0],/preview changed/);
sheet.isConnected=true;changing.setBlocked(true);await changing.print();assert.equal(changing.counts().prints,0,'Unfinished cloud designs remain blocked');
console.log('PASS print lifecycle: duplicate clicks, asynchronous dialog state, cancellation, loading/closed/cloud-blocked previews');
