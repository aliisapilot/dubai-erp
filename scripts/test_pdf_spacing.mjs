import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { exports, console, require: id => {
    if (id.endsWith('/supabase') || id === './supabase') return { supabase: {} };
    if (id.endsWith('documentCloud')) return { createDocumentCloud: () => ({}) };
    if (id.endsWith('documentDesignBackup')) return {};
    if (id === '@/lib/helpers') return { fmtAED: n => `AED ${Number(n).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}`, fmtDate: d => /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0,10).split('-').reverse().join('/') : d };
    if (id === 'next/image') return { __esModule: true, default: props => {
      const local = typeof props.src === 'string' && props.src.startsWith('/') ? path.resolve('public'+props.src) : '';
      const src = local && fs.existsSync(local) ? `data:image/${local.endsWith('.svg')?'svg+xml':'png'};base64,${fs.readFileSync(local).toString('base64')}` : props.src;
      return React.createElement('img', {src,alt:props.alt,width:props.width,height:props.height,className:props.className,style:props.fill?{...props.style,position:'absolute',width:'100%',height:'100%'}:props.style});
    } };
    if (id.startsWith('.') || id.startsWith('@/')) {
      const base = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file),id);
      const resolved = ['.ts','.tsx'].map(ext=>base+ext).find(p=>fs.existsSync(p));
      if (resolved) return load(resolved);
    }
    return require(id);
  } }, {filename:file});
  return exports;
}
const model = load('lib/documentDesigner.ts');
const engine = load('lib/documentLayoutEngine.ts');
const renderer = load('components/documents/DynamicDocumentRenderer.tsx');
const output = process.env.ARTIFACTS_DIR || 'test-output/pdf-spacing';
fs.mkdirSync(output,{recursive:true});
const cssDir = '.next/static/chunks';
const css = fs.existsSync(cssDir) ? fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8')).join('\n') : '';
function localAssets(markup) {
  return markup.replace(/src="(\/[^\"]+)"/g,(match,src)=>{
    const file=path.resolve('public'+src);
    return fs.existsSync(file)?`src="data:image/${file.endsWith('.svg')?'svg+xml':'png'};base64,${fs.readFileSync(file).toString('base64')}"`:match;
  });
}
let checked = 0;
const manifest = [];
for (const option of model.DOCUMENT_TYPE_OPTIONS) {
  const layout = model.createDefaultLayout(option.id);
  const before = JSON.stringify(layout);
  const data = renderer.getSampleDocumentData(option.id);
  const counts = layout.elements.some(e=>e.type==='line_items' && e.visible) ? [3,30] : [1];
  for (const count of counts) {
    const sourceItems = data.items.length ? data.items : [{description:'Project record',quantity:1,unit_price:0,vat_amount:0,line_total:0}];
    const items = Array.from({length:count},(_,i)=>({...sourceItems[i%sourceItems.length], description:`${i+1}. ${sourceItems[i%sourceItems.length].description}`}));
    const doc = {...data,items};
    const plan = engine.computePaginationPlan(layout,count,items,doc);
    let markup = '';
    for (const page of plan.pageItemRanges) {
      const geometry = engine.computeEffectiveLayout(layout,page.itemCount,page.isLastPage,page.pageNumber,plan.totalPages,items.slice(page.startIndex,page.endIndex),doc);
      const visible = geometry.elements.filter(e=>e.visible && e.effectiveVisible);
      const followers = visible.filter(e=>e.isFollower);
      for (let i=0;i<followers.length;i++) for(let j=i+1;j<followers.length;j++) {
        const a=followers[i],b=followers[j];
        if (Math.abs(a.y-b.y)<5) continue; // Saved side-by-side artwork shares a row.
        const overlapX=a.effectiveX<b.effectiveX+b.effectiveWidth && a.effectiveX+a.effectiveWidth>b.effectiveX;
        const overlapY=a.effectiveY<b.effectiveY+b.effectiveHeight-0.1 && a.effectiveY+a.effectiveHeight>b.effectiveY+0.1;
        assert.ok(!(overlapX&&overlapY),`${option.id}/${count}: ${a.type} overlaps ${b.type}`);
      }
      markup += `<section style="break-after:page">${renderToStaticMarkup(React.createElement(renderer.default,{layout,data:doc,isDesignerPreview:false,scale:1,pageNumber:page.pageNumber,totalPages:plan.totalPages}))}</section>`;
    }
    assert.equal(JSON.stringify(layout),before,'Saved layout must remain unchanged');
    const file=path.resolve(output,`${option.id}-${count}.html`);
    manifest.push({file:path.basename(file).replace('.html','.pdf'),pages:plan.totalPages});
    fs.writeFileSync(file,`<!doctype html><meta charset="utf-8"><style>${css}\n@page{size:A4;margin:0}body{margin:0}section:last-child{break-after:auto}</style>${localAssets(markup)}`);
    if(process.env.RENDER_PDFS==='1')execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-pdf-header-footer','--disable-gpu',`--print-to-pdf=${file.replace('.html','.pdf')}`,`file:///${file.replaceAll('\\','/')}`],{timeout:30000,stdio:'pipe'});
    checked++;
  }
}
const voucher=model.createDefaultLayout('receipt_voucher');
const normal=engine.computeEffectiveLayout(voucher,1,true);
const terms=normal.elements.find(e=>e.type==='payment_terms');
const signature=normal.elements.find(e=>e.type==='company_signature');
assert.ok(signature.effectiveY<signature.y,'Voucher signature should follow content without its old large gap');
assert.equal(signature.effectiveY,terms.effectiveY+terms.effectiveHeight+3);
voucher.page.smartFit.automaticSpacing=false;
const fixed=engine.computeEffectiveLayout(voucher,1,true);
assert.equal(fixed.elements.find(e=>e.type==='company_signature').effectiveY,signature.y,'Manual spacing opt-out preserved');
const brief = engine.fitDocumentContentBoxes(voucher,{notes:'Cash received',payment_terms:'Cash'});
assert.equal(brief.elements.find(e=>e.type==='payment_terms').height,voucher.elements.find(e=>e.type==='payment_terms').height,'Manual paragraph height preserved');
voucher.page.smartFit.automaticSpacing=true;
const tight = engine.fitDocumentContentBoxes(voucher,{notes:'Cash received',payment_terms:'Cash'});
assert.ok(tight.elements.find(e=>e.type==='payment_terms').height<62,'Brief voucher purpose should not reserve a large empty card');
const long = engine.fitDocumentContentBoxes(voucher,{notes:'Long purpose and detailed payment reference '.repeat(100)});
assert.equal(long.elements.find(e=>e.type==='payment_terms').height,62,'Long paragraphs must retain their available space');
const invoice=model.createDefaultLayout('tax_invoice');
invoice.elements.find(e=>e.type==='line_items').y=125;
const spaced=engine.computeEffectiveLayout(invoice,1,true,1,1,[{description:'One item'}],{customer_name:'Test'});
const table=spaced.elements.find(e=>e.type==='line_items');
const party=spaced.elements.find(e=>e.type==='customer_info');
assert.ok(table.effectiveY<125,'Short tables should close excessive gaps without needing a denser tier');
assert.equal(party.effectiveHeight,party.height,'Normal header boxes retain their height when closing a table gap');
const pettyCash=load('components/documents/PettyCashVoucherTemplate.tsx');
for(const transaction_type of ['DISBURSEMENT','REPLENISHMENT']) {
  const file=path.resolve(output,`petty_cash-${transaction_type.toLowerCase()}.html`);
  const markup=renderToStaticMarkup(React.createElement(pettyCash.default,{company:null,voucher:{voucher_number:'PC-TEST',transaction_date:'2026-10-03',transaction_type,payee:'Test Payee',category:'Office costs',amount:100,balance_after:900,description:'Test-only cash voucher',approved_by:'Accounts'}}));
  fs.writeFileSync(file,`<!doctype html><meta charset="utf-8"><style>${css}\n@page{size:A4;margin:0}body{margin:0}</style>${markup}`);
  manifest.push({file:path.basename(file).replace('.html','.pdf'),pages:1});
  if(process.env.RENDER_PDFS==='1')execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-pdf-header-footer','--disable-gpu',`--print-to-pdf=${file.replace('.html','.pdf')}`,`file:///${file.replaceAll('\\','/')}`],{timeout:30000,stdio:'pipe'});
  checked++;
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`PASS ${model.DOCUMENT_TYPE_OPTIONS.length} designer PDF types plus petty cash, ${checked} rendered fixtures, row collisions, voucher gaps and saved-layout preservation.`);
