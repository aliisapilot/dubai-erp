import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
let currentUser={id:'a'},authListener;let companyReads=0,deferred;
const companies={a:{id:'company-a',name:'Company A'},b:{id:'company-b',name:'Company B'}};
const supabase={auth:{getSession:async()=>({data:{session:currentUser?{user:currentUser}:null}}),getUser:async()=>({data:{user:currentUser}}),onAuthStateChange:fn=>{authListener=fn;}},from(table){let id;return {select(){return this;},eq(_k,value){id=value;return this;},async maybeSingle(){if(table==='companies'){companyReads++;if(deferred)return deferred;return {data:companies[id]||null,error:null};}return {data:null,error:null};}};}};
const stored=new Map([['dubai-erp.company-cache',JSON.stringify(companies.a)]]);
const exports={};const source=ts.transpileModule(fs.readFileSync('lib/helpers.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{exports,require:()=>({supabase}),console,window:{localStorage:{getItem:k=>stored.get(k),removeItem:k=>stored.delete(k)}}});
assert.equal(exports.getCachedCompanySync(),null,'Unverified persisted company must not render');
const [a1,a2]=await Promise.all([exports.getCurrentCompany(),exports.getCurrentCompany()]);assert.equal(a1.id,'company-a');assert.equal(a2.id,'company-a');assert.equal(companyReads,1,'Concurrent readers share one company query');
currentUser={id:'b'};authListener('SIGNED_IN',{user:currentUser});assert.equal(exports.getCachedCompanySync(),null);
assert.equal((await exports.getCurrentCompany()).id,'company-b','Account change does not return prior company');
exports.clearCompanyCache();let finish;deferred=new Promise(resolve=>{finish=resolve;});const pending=exports.getCurrentCompany();await new Promise(resolve=>setImmediate(resolve));
currentUser=null;authListener('SIGNED_OUT',null);finish({data:companies.b,error:null});assert.equal(await pending,null,'Late query cannot restore company after sign-out');assert.equal(exports.getCachedCompanySync(),null);deferred=null;
assert.equal(await exports.getCurrentCompany(),null);
assert.match(exports.statusClass('PARTIALLY_RECEIVED'),/amber/);assert.match(exports.statusClass('partially received'),/amber/);
const boundary=new Date('2026-10-02T21:30:00Z');process.env.TZ='Asia/Dubai';const expected=boundary.getFullYear()+'-'+String(boundary.getMonth()+1).padStart(2,'0')+'-'+String(boundary.getDate()).padStart(2,'0');assert.equal(expected,'2026-10-03');
const todaySource=ts.transpileModule('export '+fs.readFileSync('lib/helpers.ts','utf8').match(/export function todayISO\(\): string \{[\s\S]*?\n\}/)[0].replace('export ',''),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const dateExports={};class BoundaryDate extends Date { constructor(){super(boundary);} }
vm.runInNewContext(todaySource,{exports:dateExports,Date:BoundaryDate});assert.equal(dateExports.todayISO(),expected,'Local calendar date must survive UTC midnight boundary');
const queryExports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/reportData.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:queryExports});
await assert.rejects(queryExports.readReportQuery(Promise.resolve({data:[],error:{message:'failed read'}})),/failed read/);
assert.deepEqual(await queryExports.readReportQuery(Promise.resolve({data:[{id:'ok'}],error:null})),[{id:'ok'}]);
for(const dir of ['stock-in','stock-out']) {const s=fs.readFileSync(`app/inventory/${dir}/page.tsx`,'utf8');assert.ok(s.indexOf('const refNo =')<s.indexOf('.update({ current_stock'),'Reference generation failure precedes stock mutation');}
function reportFixture(file){
 const states=[],actions={},rows={};let cursor=0,errors=true;
 const reportState=()=>{};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useEffect(){},useRef:initial=>{const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i];}};
 const query={select(){return this;},eq(){return this;},in(){return this;},gte(){return this;},lte(){return this;},order(){return this;},then(resolve,reject){return Promise.resolve({data:rows[this.table] || [],error:errors?{message:'Network test failure'}:null}).then(resolve,reject);}};
 const componentExports={};const js=ts.transpileModule(fs.readFileSync(file,'utf8').replace('  useEffect(() => {\n    void Promise.resolve().then(loadInitialData);','  globalThis.auditActions.generate = generateStatement;\n  useEffect(() => {\n    void Promise.resolve().then(loadInitialData);'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(js,{exports:componentExports,auditActions:actions,console:{error(){}},require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:id==='@/lib/supabase'?{supabase:{from:table=>Object.assign(Object.create(query),{table})}}:id==='@/lib/helpers'?{...exports,getCompanyId:async()=> 'company-a',getCurrentCompany:async()=>companies.a,todayISO:()=>expected}:id==='@/components/ReportLoadState'?{default:reportState}:new Proxy({},{get:()=>()=>{}})});
 return {render(){cursor=0;return componentExports.default();},succeed(){errors=false;},fail(){errors=true;},setRows:(table,value)=>{rows[table]=value;},actions,reportState};
}
for(const file of ['app/reports/sales/page.tsx','app/reports/purchases/page.tsx','app/reports/inventory/page.tsx','app/reports/vat/page.tsx','app/projects/costing/page.tsx','app/payroll-summary/page.tsx','app/customers/statements/page.tsx','app/reports/supplier-statements/page.tsx']){
 const test=reportFixture(file);let tree=test.render();assert.equal(tree.type,test.reportState);assert.equal(tree.props.loading,true);
 tree.props.onRetry();await new Promise(resolve=>setImmediate(resolve));tree=test.render();assert.equal(tree.type,test.reportState,'Failed query must hide misleading totals');assert.ok(tree.props.error.length > 0, file + " must explain failed load");
 test.succeed();tree.props.onRetry();await new Promise(resolve=>setImmediate(resolve));tree=test.render();assert.notEqual(tree.type,test.reportState,'Successful retry restores report');
}
const statementTest=reportFixture('app/customers/statements/page.tsx');statementTest.succeed();
statementTest.setRows('customers',[{id:'customer-a',name:'Customer A'}]);
statementTest.setRows('tax_invoices',[{id:'invoice-a',invoice_number:'INV-A',invoice_date:'2026-10-01',total_amount:100,status:'Final'}]);
statementTest.setRows('payments',[{id:'payment-a',payment_number:'PAY-A',payment_date:'2026-10-02',amount:20,payment_method:'Cash'}]);
let statementTree=statementTest.render();statementTree.props.onRetry();await new Promise(resolve=>setImmediate(resolve));statementTest.render();await statementTest.actions.generate();statementTree=statementTest.render();
function findStatement(node) {if(!node || typeof node!=='object')return null;if(node.props?.statement?.closing_balance!==undefined)return node.props.statement;for(const child of [node.props?.children].flat(Infinity)){const found=findStatement(child);if(found)return found;}return null;}
assert.equal(findStatement(statementTree).closing_balance,80,'Complete statement preserves charges minus received credits');
statementTest.fail();await statementTest.actions.generate();statementTree=statementTest.render();assert.equal(statementTree.type,statementTest.reportState,'Failed transaction read must replace old printable statement');assert.ok(statementTree.props.error);
for(const file of ['quotations','purchase-orders','proforma-invoices','tax-invoices']) {
 const source=fs.readFileSync(`app/${file}/page.tsx`,'utf8');
 const expressions=[...source.matchAll(/Number\(it\.vat_rate \?\? 5\)/g)];assert.ok(expressions.length>0);
 for(const expression of expressions) {const rate=new Function('it','return '+expression[0]);assert.equal(rate({vat_rate:0}),0);assert.equal(rate({vat_rate:5}),5);assert.equal(rate({vat_rate:null}),5);}
}
console.log('PASS ERP audit: account-isolated company cache, late-load rejection, compound status accents, reference-before-stock mutation, report loading/error/retry behavior');
