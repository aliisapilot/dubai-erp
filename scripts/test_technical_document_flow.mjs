import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{exports,console,Error,require:id=>{
  if(id.endsWith('/supabase') || id==='./supabase')return {supabase:{}};
  if(id==='./usePersistedDocumentDesign')return {usePersistedDocumentDesign:(_company,type)=>({ready:true,layout:type==='project_handover'?null:load('lib/documentDesigner.ts').createDefaultLayout(type)})};


  if(id.startsWith('.') || (id.startsWith('@/') && id !== '@/lib/helpers')){const base=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);const next=['.ts','.tsx'].map(e=>base+e).find(f=>fs.existsSync(f));if(next)return load(next);}
  if(id==='next/image')return {__esModule:true,default:props=>{let src=props.src;const file=typeof src==='string'&&src.startsWith('/')?path.resolve('public'+src):'';if(file&&fs.existsSync(file))src='data:image/'+(file.endsWith('.svg')?'svg+xml':'png')+';base64,'+fs.readFileSync(file).toString('base64');return React.createElement('img',{src,alt:props.alt,style:props.style});}};
  if(id==='@/lib/helpers')return {fmtDate:d=>d,fmtAED:n=>String(n)};
  return require(id);
 }},{filename:file});return exports;
}
const {execFileSync}=await import('node:child_process');
const output=path.resolve('test-output/technical-flow');fs.mkdirSync(output,{recursive:true});
const css=fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('.next/static/chunks/'+f,'utf8')).join('\n');
const company={name:'Technical QA Company',legal_name:'Technical QA Company',trn:'TEST-TRN',address:'Test site',city:'Dubai'};
const Wms=load('components/documents/WorkMethodStatementTemplate.tsx').default;
const Ho=load('components/documents/ProjectHandoverTemplate.tsx').default;
for(const size of [2,45]) {
 const risks=Array.from({length:size},(_,i)=>({activity:'Activity '+(i+1),hazard:'Hazard '+(i+1),control_measures:'Isolate the work area, review the approved plan, inspect equipment and record the site check.',risk_level:'Medium'}));
 const qaqc=Array.from({length:size},(_,i)=>({inspection_item:'INSPECTION-'+String(i+1).padStart(3,'0'),acceptance_criteria:'Verify against the saved specification and drawing.',status:'Pending',remarks:'Recorded remark '+(i+1)}));
 const wms={wms_number:'WMS-QA',title:'Technical flow verification',date:'2026-10-03',revision:'00',project_name:'QA site',status:'Draft',risk_assessment:risks,qaqc_checklist:qaqc};
 const scopes=Array.from({length:size},(_,i)=>'SCOPE-'+String(i+1).padStart(3,'0')+' Completed scope recorded for visual verification.');
 const handover={handover_number:'HO-QA',handover_date:'2026-10-03',project_name:'QA site',customer_name:'QA client',status:'Draft',scope_completed:scopes.join('\n'),snags_remarks:'Saved snag remarks only.'};
 for(const [name,component,props] of [['wms',Wms,{wms}],['handover',Ho,{handover}]]){
  const html=renderToStaticMarkup(React.createElement(component,{company,...props}));
  assert.ok(!html.includes('1 Page A4'),'Unknown flow page count must not advertise a single page');
  const file=path.join(output,name+'-'+size+'.html');
  fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>'+css+'\n@page{size:A4;margin:0}body{margin:0}</style>'+html);
  execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-pdf-header-footer','--disable-gpu','--print-to-pdf='+file.replace('.html','.pdf'),'file:///'+file.replaceAll('\\','/')],{timeout:30000,stdio:'pipe'});
 }
}
console.log('PASS 4 real technical document fixtures rendered with sparse/dense content and honest page-count UI.');
