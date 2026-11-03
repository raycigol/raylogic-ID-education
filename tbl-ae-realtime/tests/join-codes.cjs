const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const directory=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const makeQr=require(path.resolve(process.argv[3]||path.join(directory,'vendor/qrcode.js')));
class Element{
 constructor(){this.children=[];this.textContent='';this.style={};this.classList={add(){},remove(){}}}
 append(...children){this.children.push(...children)}
 replaceChildren(){this.children=[]}
}
const nodes=new Map(),calls=[],previews=[];
const context=vm.createContext({
 URL,URLSearchParams,window:{location:new URL('https://example.test/tbl-ae-realtime/teacher.html#join=k7m4p9')},
 qrcode:makeQr,document:{createElement:()=>new Element()},
 $:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},
 confirm:()=>true,say(){},errorText:error=>error.message,openJoinCodePrint:snapshot=>previews.push(snapshot),
 rpc:async(name,args)=>{calls.push([name,args]);if(name==='tbl_session_roster')return {teams:[{team_id:'TEST-team',active:true}]};return [{team_id:'TEST-team',team_name:'TEST 1',short_code:'K7M4P9'}]}
});
(async()=>{
 vm.runInContext(fs.readFileSync(path.join(directory,'join-codes.js'),'utf8'),context);
 assert.equal(vm.runInContext("normalizeJoinCode(' k7m4p9 ')",context),'K7M4P9');
 assert.equal(vm.runInContext('prefilledJoinCode()',context),'K7M4P9');
 for(const code of ['O0I1L2','123','<img>','K7M 4P9'])assert.equal(vm.runInContext('validJoinCode('+JSON.stringify(code)+')',context),false);
 assert.equal(vm.runInContext("validJoinCode('11111111-1111-4111-8111-111111111111')",context),true);
 const link=vm.runInContext("studentJoinLink('k7m4p9')",context);
 assert.equal(link,'https://example.test/tbl-ae-realtime/student.html#join=K7M4P9');
 vm.runInContext("let teacherSession='TEST',teacherTitle='TEST class',actionBusy=false,refreshNonce=0;async function loadTeacher(){}",context);
 vm.runInContext(fs.readFileSync(path.join(directory,'teacher-join-codes.js'),'utf8'),context);
 await vm.runInContext('loadJoinCodes()',context);
 assert.equal(calls[0][1].p_session_id,'TEST');
 const card=nodes.get('joinCodes').children[0];
 assert.equal(card.children[1].textContent,'K7M4P9');
 assert.ok(card.children[3].src.startsWith('data:image/gif;base64,'));
 const beforePrint=calls.length;nodes.get('printJoinCodes').onclick();assert.equal(calls.length,beforePrint,'print must not call database');assert.equal(previews.length,1);assert.equal(previews[0].session,'TEST');assert.equal(previews[0].cards[0].shortCode,'K7M4P9');assert.match(previews[0].cards[0].qrSource,/^data:image\/svg\+xml/);
 const rotate=card.children[4];await rotate.onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.ok(calls.some(call=>call[1].p_rotate_team==='TEST-team'));
 vm.runInContext("teacherSession='FORMAL';clearJoinCodes()",context);
 const before=calls.length;await rotate.onclick();assert.equal(calls.length,before);
 assert.equal(nodes.get('joinCodes').children.length,0);
 assert.equal(nodes.get('printJoinCodes').disabled,true);nodes.get('printJoinCodes').onclick();assert.equal(previews.length,1,'stale session cannot open print preview');
 console.log('PASS: short-code validation, UUID compatibility, QR link and image, rotation target, stale classroom guard');
})().catch(error=>{console.error(error);process.exitCode=1});

