const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.textContent='';this.disabled=false;this.attributes={}}
 append(...xs){this.children.push(...xs)}setAttribute(k,v){this.attributes[k]=v}
 decode(){return Promise.resolve()}
}
const made=[],messages=[];let blocked=false,prints=0;
const c=vm.createContext({window:{open:()=>{if(blocked)return null;const doc={head:new Element('head'),body:new Element('body'),documentElement:{},createElement:tag=>new Element(tag)};const w={document:doc,closed:false,focus(){},print(){prints++},close(){this.closed=true}};made.push(w);return w}},Promise,Error,Math});
vm.runInContext(fs.readFileSync(__dirname+'/../join-code-print.js','utf8'),c);
const cards=n=>Array.from({length:n},(_,i)=>({teamName:'第 '+(i+1)+' 組',shortCode:'K7M4P9',qrSource:'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E'}));
const flatten=node=>[node,...node.children.flatMap(flatten)];
(async()=>{
 assert.throws(()=>c.openJoinCodePrint({cards:[]}),/完整載入/);
 assert.throws(()=>c.openJoinCodePrint({cards:[{teamName:'broken'}]}),/完整載入/);
 for(const n of [1,6,7,13,16,17]){
  const title='TEST <script>alert(1)</script> 課堂',data={title,cards:cards(n)};const w=c.openJoinCodePrint(data);const all=flatten(w.document.body),sheets=all.filter(x=>x.className==='sheet'),tiles=all.filter(x=>x.className==='cut-card');
  assert.equal(sheets.length,Math.ceil(n/6));assert.equal(tiles.length,n);assert.equal(w.opener,null);
  assert.equal(w.document.title,title+' - 組別 QR 裁剪卡');assert.equal(all.filter(x=>x.tag==='script').length,0);
  for(let i=0;i<n;i++){const content=tiles[i].children;assert.equal(content[0].textContent,title);assert.equal(content[1].textContent,'第 '+(i+1)+' 組');assert.equal(content[2].textContent,data.cards[i].shortCode);assert.equal(content[3].src,data.cards[i].qrSource)}
  assert(sheets.every(s=>s.children[1].children.length<=6));
  const print=all.find(x=>x.tag==='button'&&x.textContent==='列印／另存為 PDF');assert.equal(print.disabled,true);await new Promise(r=>setImmediate(r));assert.equal(print.disabled,false);assert.equal(prints,0,'opening preview never triggers native print dialog');
  assert.match(w.document.head.children[1].textContent,/@page\{size:A4 portrait;margin:10mm\}/);assert.match(w.document.head.children[1].textContent,/page-break-inside:avoid/);
 }
 const w=made.at(-1),button=flatten(w.document.body).find(x=>x.tag==='button'&&x.textContent==='列印／另存為 PDF');button.onclick();assert.equal(prints,1);
 blocked=true;assert.throws(()=>c.openJoinCodePrint({title:'TEST',cards:cards(1)}),/阻擋/);
 console.log('PASS: A4 six-card pagination for 1/6/7/13/16/17 groups; card/title/code/QR pairing; text escaping; QR readiness; popup failure; explicit printing only');
})().catch(e=>{console.error(e);process.exitCode=1});
