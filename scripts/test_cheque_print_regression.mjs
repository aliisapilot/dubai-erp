import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
const require=createRequire(import.meta.url);
const out=path.resolve('test-output/cheque-print-regression');fs.mkdirSync(out,{recursive:true});
const css=fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('.next/static/chunks/'+f,'utf8')).join('\n');
const exports={};
const code=ts.transpileModule(fs.readFileSync('components/cheques/ChequePrintTemplate.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports,require:name=>name==='@/lib/helpers'?{fmtAED:n=>'AED '+Number(n).toFixed(2),fmtDate:s=>s}:name==='@/lib/chequeTypes'?{formatChequeStatus:s=>s}:name==='@/lib/amountInWords'?{numberToWordsEnglish:()=> 'One Thousand Dirhams Only'}:require(name)});
const voucher=renderToStaticMarkup(React.createElement(exports.default,{mode:'voucher',company:{name:'Audit Voucher Fixture'},cheque:{cheque_type:'outgoing',payee_name:'Synthetic beneficiary',cheque_number:'AUDIT-001',amount:1000,status:'cleared',bank_name:'Audit Bank',issue_date:'2026-10-03',due_date:'2026-10-03'}}));
const modal='<div class="print-modal-container"><div class="no-print">Toolbar</div>'+voucher+'</div>';
for(const shape of ['nested','portal']){
const html='<html><head><meta charset="utf-8"><style>'+css+'</style></head><body><div id="app"><nav>Screen navigation</nav><main data-print-root><div>'+ (shape==='nested'?modal:'Screen content')+'</div></main></div>'+(shape==='portal'?modal:'')+'</body></html>';
const source=path.join(out,shape+'.html'),pdf=path.join(out,shape+'.pdf');fs.writeFileSync(source,html);
execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-pdf-header-footer','--virtual-time-budget=1500','--user-data-dir='+path.join(out,'profile-'+shape),'--print-to-pdf='+pdf,'file:///'+source.replaceAll('\\','/')],{timeout:30000,stdio:'ignore'});
const bytes=fs.readFileSync(pdf),raw=bytes.toString('latin1');let drawings=0;
for(const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)){try{const stream=inflateSync(Buffer.from(m[1],'latin1')).toString('latin1');drawings+=(stream.match(/\bBT\b/g)||[]).length;}catch{}}
assert.ok(drawings>10,shape+' cheque PDF must contain visible text, not a blank page');
assert.equal((raw.match(/\/Type\s*\/Page\b/g)||[]).length,1,shape+' voucher must fit one A4 page');
console.log('PASS '+shape+' voucher: one page and '+drawings+' text-drawing blocks');
}