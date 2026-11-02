import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('components/documents/StatementOfAccountTemplate.tsx', 'utf8');
const exports = {};
let captured;
const jsx = (type, props) => ({ type, props });
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  exports,
  require: id => id === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : id.includes('usePersistedDocumentDesign') ? { usePersistedDocumentDesign: () => ({ ready: true, layout: {} }) } : id.includes('DynamicDocumentRenderer') ? { getDocumentPageCount: (_layout, _count, _items, data) => { captured = data; return 1; } } : {},
});
exports.default({ company: null, statement: {
  statement_number: 'SOA-TEST', statement_date: '2026-10-03', customer_name: 'Test', opening_balance: 500,
  entries: [{ date: '2026-09-22', reference_no: 'RCV-1', description: 'Receipt Voucher (Cash)', debit: 0, credit: 500, balance: 0 }], closing_balance: 0,
} });
assert.equal(captured.items.length, 2);
assert.equal(captured.items[0].balance, 500);
assert.equal(captured.items[0].type, 'Opening');
assert.equal(captured.items[1].type, 'Receipt Voucher');
assert.equal(captured.items[1].balance, 0);
assert.equal(captured.subtotal, 0);
assert.equal(captured.total_amount, 0);

const renderer = fs.readFileSync('components/documents/DynamicDocumentRenderer.tsx', 'utf8');
const start = renderer.indexOf('let val: React.ReactNode = "";');
const end = renderer.indexOf('const isMonetary', start);
const format = vm.runInNewContext(ts.transpileModule(`(function(col,item){const firstItemIndex=0,idx=0;${renderer.slice(start,end)}return val;})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { fmtDate: value => value.split('-').reverse().join('/') });
assert.equal(format({key:'balance'}, {balance:0}), '0.00');
assert.equal(format({key:'balance'}, {balance:-24199}), '(24,199.00)');
assert.equal(format({key:'credit'}, {credit:18000}), '18,000.00');
assert.equal(format({key:'debit'}, {debit:0}), '—');
assert.equal(format({key:'date'}, {date:'2026-09-22'}), '22/09/2026');
assert.equal(format({key:'date'}, {date:'05/09/2026'}), '05/09/2026');
console.log('Statement PDF mapping, opening balances, zero balances and formatting passed.');
