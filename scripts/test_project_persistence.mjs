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
  if(id==='./usePersistedDocumentDesign')return {usePersistedDocumentDesign:()=>({ready:true,layout:null})};
  if(id==='./DocumentContainer')return {__esModule:true,default:({children,status})=>React.createElement('main',{'data-status':status},children)};
  if(id==='./DynamicDocumentRenderer')return {__esModule:true,getDocumentPageCount:()=>1,default:()=>null};
  if(id.startsWith('.') || (id.startsWith('@/') && id !== '@/lib/helpers')){const base=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);const next=['.ts','.tsx'].map(e=>base+e).find(f=>fs.existsSync(f));if(next)return load(next);}
  if(id==='next/image')return {__esModule:true,default:()=>null};
  if(id==='@/lib/helpers')return {fmtDate:d=>d,fmtAED:n=>String(n)};
  return require(id);
 }},{filename:file});return exports;
}
const {readProjectResult,writeProjectResult,unsavedProjectExpenses,saveProjectWmsDraft}=load('lib/projectPersistence.ts');
await assert.rejects(readProjectResult(Promise.resolve({data:[],error:{message:'Read denied'}})),/Read denied/);
await assert.rejects(writeProjectResult(Promise.resolve({data:null,error:null})),/No record was saved/);
await assert.rejects(writeProjectResult(Promise.resolve({data:[],error:null})),/No record was saved/);
await assert.rejects(writeProjectResult(Promise.reject(new Error('Network unavailable'))),/Network unavailable/);
assert.equal((await writeProjectResult(Promise.resolve({data:{id:'saved'},error:null}))).id,'saved');
assert.equal(unsavedProjectExpenses([{id:'saved'}],[{id:'saved'},{id:'draft'}])[0].id,'draft');
assert.equal(unsavedProjectExpenses([],[{id:'draft'}]).length,1);
const draft={parent:{id:'wms-a',company_id:'company-a',project_id:'project-a',title:'Recovery',status:'Draft'},risks:[{id:'risk-a',company_id:'company-a',wms_id:'wms-a'}],qaqc:[{id:'qa-a',company_id:'company-a',wms_id:'wms-a',status:'Pending'}],revHistory:[]};
const database=new Map();let fail=true;
const client={from:table=>({upsert:rows=>({select:async()=>{
 if(table==='wms_qaqc_checklists'&&fail)return {data:null,error:{message:'Connection interrupted'}};
 const list=Array.isArray(rows)?rows:[rows];let saved=database.get(table);if(!saved){saved=new Map();database.set(table,saved);}
 for(const row of list)saved.set(row.id,structuredClone(row));return {data:list.map(row=>({id:row.id})),error:null};
}})})};
await assert.rejects(saveProjectWmsDraft(client,draft),/Connection interrupted/);
assert.equal(database.get('work_method_statements').get('wms-a').status,'Draft');
assert.equal(database.get('wms_risk_assessments').size,1);
fail=false;await saveProjectWmsDraft(client,draft);await saveProjectWmsDraft(client,draft);
for(const table of ['work_method_statements','wms_risk_assessments','wms_qaqc_checklists'])assert.equal(database.get(table).size,1,'Retries must not duplicate saved rows');
const unrelated=structuredClone(draft);unrelated.risks[0].company_id='other-company';
await assert.rejects(saveProjectWmsDraft(client,unrelated),/unrelated assessment/);
const partial={from:()=>({upsert:()=>({select:async()=>({data:[{id:'only-one'}],error:null})})})};
const two=structuredClone(draft);two.risks.push({...two.risks[0],id:'risk-b'});
await assert.rejects(saveProjectWmsDraft(partial,two),/not saved/);
const Wms=load('components/documents/WorkMethodStatementTemplate.tsx').default;
const html=renderToStaticMarkup(React.createElement(Wms,{company:null,wms:{wms_number:'WMS-1',title:'Audit',date:'2026-10-03',revision:'00',project_name:'Site',status:'Draft',risk_assessment:[],qaqc_checklist:[]}}));
assert.ok(html.includes('No saved risk assessments.'));
assert.ok(html.includes('No saved inspection results.'));
assert.ok(html.includes('data-status="Draft"'));
assert.ok(!html.includes('>Pass<'));
assert.ok(!html.includes('Approved as Noted'));
const Handover=load('components/documents/ProjectHandoverTemplate.tsx').default;
const ho=renderToStaticMarkup(React.createElement(Handover,{company:null,handover:{handover_number:'HO-1',handover_date:'2026-10-03',project_name:'Site',customer_name:'Client',scope_completed:'',status:'Draft'}}));
assert.ok(ho.includes('No completed scope recorded.'));
assert.ok(ho.includes('No snag remarks recorded.'));
assert.ok(!ho.includes('14 calendar days'));
console.log('Project persistence and truthful document output: 21 assertions passed. No live database used.');
// Exercise the actual project component handlers with isolated reads/writes.
const slots=[];let cursor=0,actions,writeFailure=false,readFailure=false;
let expenseRows=[];
const hooks={...React,use:()=>({id:'project-a'}),useEffect:()=>{},useState:initial=>{
 const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
 return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];
},useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
const queryClient={from:table=>{
 let op='read',payload,filters=[];
 const query={select:()=>query,eq:(key,value)=>{filters.push([key,value]);return query;},order:()=>query,
 maybeSingle:()=>query,single:()=>query,insert:value=>{op='insert';payload=value;return query;},delete:()=>{op='delete';return query;},
 then:(resolve,reject)=>Promise.resolve().then(()=>{
  if(op!=='read'){
   assert.ok(payload?.company_id==='company-a'||filters.some(([key,value])=>key==='company_id'&&value==='company-a'),'Writes must be company scoped');
   assert.ok(payload?.project_id==='project-a'||filters.some(([key,value])=>key==='project_id'&&value==='project-a'),'Writes must be project scoped');
   if(writeFailure)return {data:null,error:{message:'Save denied'}};
   if(op==='insert'){const row={id:'expense-saved',...payload};expenseRows.push(row);return {data:row,error:null};}
   const id=filters.find(([key])=>key==='id')?.[1];expenseRows=expenseRows.filter(row=>row.id!==id);return {data:{id},error:null};
  }
  if(readFailure&&table==='project_expenses')return {data:null,error:{message:'Expense read denied'}};
  if(table==='projects')return {data:{id:'project-a',company_id:'company-a',name:'Audit',project_number:'PRJ-A',contract_value:100,customer_id:null},error:null};
  return {data:table==='project_expenses'?structuredClone(expenseRows):[],error:null};
 }).then(resolve,reject)};return query;
}};
let source=fs.readFileSync('app/projects/[id]/page.tsx','utf8').replace('  // Financial Computations',`  expose({load:loadProjectDetails,addExpense:handleAddExpense,deleteExpense:handleDeleteExpense,print:handlePrintWmsDoc,setDescription:setExpDesc,setAmount:setExpAmount,snapshot:()=>({expenses,browserDrafts,loadError,actionError,savingItem,expDesc,printWms})});
  // Financial Computations`);
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const pageExports={};
vm.runInNewContext(compiled,{exports:pageExports,console,Error,expose:value=>{actions=value;},localStorage:{getItem:key=>key.startsWith('dxb_project_expenses_')?JSON.stringify([{id:'browser-only',amount:999}]):null},require:id=>{
 if(id==='react')return hooks;
 if(id==='@/lib/supabase')return {supabase:queryClient};
 if(id==='@/lib/projectPersistence')return load('lib/projectPersistence.ts');
 if(id==='@/lib/helpers')return {getCurrentCompany:async()=>({id:'company-a'}),todayISO:()=> '2026-10-03',fmtAED:String,statusClass:()=>'',generateDocNumber:async()=> 'TEST-1'};
 if(id.startsWith('@/components/')||id==='next/link')return {__esModule:true,default:()=>null};
 return require(id);
}});
const render=()=>{cursor=0;pageExports.default({params:Promise.resolve({id:'project-a'})});};
render();await actions.load();render();
assert.equal(actions.snapshot().expenses.length,0,'Empty server result must not restore browser-only expenses into totals');
assert.equal(actions.snapshot().browserDrafts.length,1,'Browser backup remains available separately');
actions.setDescription('Permit');actions.setAmount('100');render();writeFailure=true;
await actions.addExpense({preventDefault(){}});render();
assert.equal(actions.snapshot().expenses.length,0);assert.equal(actions.snapshot().expDesc,'Permit');
assert.match(actions.snapshot().actionError,/Save denied/);assert.equal(actions.snapshot().savingItem,false);
writeFailure=false;await actions.addExpense({preventDefault(){}});render();assert.equal(actions.snapshot().expenses.length,1);assert.equal(actions.snapshot().expDesc,'');
writeFailure=true;await actions.deleteExpense('expense-saved');render();assert.equal(actions.snapshot().expenses.length,1,'Failed delete must retain displayed saved row');
readFailure=true;await actions.load();render();assert.match(actions.snapshot().loadError,/Expense read denied/);
console.log('Actual project handlers: 11 assertions passed for failed saves/deletes, preserved entries, scoped writes and cloud-authoritative totals.');
