import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('lib/documentLayoutEngine.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022},
}).outputText;
const {prepareSavedAutoFit,computePaginationPlan,computeEffectiveLayout}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const layout={version:7,documentType:'tax_invoice',templateName:'Custom gold',
  page:{widthMm:210,heightMm:297,background:'#fff9ed',margins:{top:10,left:10,right:10,bottom:10},
    borders:{top:{enabled:true,color:'#b08d31',thickness:4}},
    smartFit:{enabled:false,mode:'balanced',minFontSize:12,minRowHeight:9,automaticSpacing:false,preventOverflow:false,printSafeBorders:false}},
  elements:[
    {id:'logo',type:'logo',x:10,y:10,width:40,height:20,visible:true,imageSrc:'data:image/png;base64,aGVsbG8='},
    {id:'table',type:'line_items',x:10,y:65,width:190,height:90,visible:true,tableSettings:{fontSize:8,headerFontSize:8,rowHeight:5}},
    {id:'totals',type:'totals',x:130,y:160,width:70,height:24,visible:true},
    {id:'footer',type:'footer',x:10,y:275,width:190,height:10,visible:true},
  ]};
const before=structuredClone(layout);
const fitted=prepareSavedAutoFit(layout);
assert.deepEqual(layout,before);
assert.deepEqual(fitted.elements,before.elements);
assert.deepEqual(fitted.page.borders,before.page.borders);
assert.equal(fitted.page.background,before.page.background);
assert.deepEqual(fitted.page.smartFit,{...before.page.smartFit,enabled:true,automaticSpacing:true,preventOverflow:true});
assert.deepEqual(prepareSavedAutoFit(fitted),fitted);
for(const mode of ['balanced','compact','readability']) {
  const design={...fitted,page:{...fitted.page,smartFit:{...fitted.page.smartFit,mode}}};
  for(const count of [4,15,30,60]) {
    const items=Array.from({length:count},(_,i)=>({description:i%3===0?'Long item description with installation details '.repeat(5):`Item ${i}`}));
    const plan=computePaginationPlan(design,count,items);
    assert.ok(plan.fitProfile.fontSize>=12);
    assert.ok(plan.fitProfile.headerFontSize>=12);
    assert.ok(plan.fitProfile.rowHeight>=9);
    assert.equal(plan.pageItemRanges.reduce((n,p)=>n+p.itemCount,0),count);
    let end=0;
    for(const page of plan.pageItemRanges) {
      assert.equal(page.startIndex,end);end=page.endIndex;
      const geometry=computeEffectiveLayout(design,page.itemCount,page.isLastPage,page.pageNumber,plan.totalPages,items.slice(page.startIndex,page.endIndex));
      const table=geometry.elements.find(e=>e.id==='table');
      assert.ok(table.tableSettings.fontSize>=12);
      assert.ok(table.tableSettings.headerFontSize>=12);
      assert.ok(table.tableSettings.rowHeight>=9);
    }
    assert.equal(end,count);
    if(count===60)assert.ok(plan.totalPages>1);
  }
}
assert.equal(computePaginationPlan(fitted,4).totalPages,1);
console.log('PASS Auto Fit preserves saved geometry/assets/borders, enables fitting idempotently, respects custom floors on every page, and paginates every row');
