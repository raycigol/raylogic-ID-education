const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const directory=path.resolve(process.argv[2]||path.join(__dirname,'..'));
class Element{
 constructor(){this.children=[];this.textContent='';this.checked=false;this.disabled=false}
 append(...children){this.children.push(...children)}
 replaceChildren(){this.children=[]}
}
const nodes=new Map(),calls=[],messages=[],intervals=[];
let members=['old-user'],releaseList=null,hold=false,confirmed=true;
const context=vm.createContext({setInterval:f=>intervals.push(f),
 document:{createElement:()=>new Element()},$:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},
 confirm:()=>confirmed,say:message=>messages.push(message),errorText:error=>error.message,clearJoinCodes(){},
 rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='tbl_teacher_representatives'){
   if(hold){hold=false;await new Promise(resolve=>{releaseList=resolve})}
   return [{team_id:'team-one',team_name:'TEST 1',member_ids:[...members],submitted_stages:[1,2]}];
  }
  members=[];return 1;
 }
});
const flush=async()=>{for(let count=0;count<10;count++)await new Promise(resolve=>setImmediate(resolve))};
(async()=>{
 vm.runInContext("let teacherSession='TEST',teacherTitle='TEST class',actionBusy=false,refreshNonce=0;async function loadTeacher(){}",context);
 vm.runInContext(fs.readFileSync(path.join(directory,'teacher-representatives.js'),'utf8'),context);
 await vm.runInContext('loadRepresentatives()',context);
 const first=nodes.get('representatives').children[0],stale=first.children[1];
 assert.ok(first.children[0].textContent.includes('已綁定 1'));assert.ok(first.children[0].textContent.includes('S1、S2'));
 confirmed=false;await stale.onclick();assert.equal(calls.filter(call=>call[0]==='tbl_teacher_release_representative').length,0);
 confirmed=true;await first.children[2].onclick();
 const released=calls.find(call=>call[0]==='tbl_teacher_release_representative')[1];
 assert.equal(released.p_session_id,'TEST');assert.equal(released.p_team_id,'team-one');
 assert.equal(released.p_rotate_code,true);assert.deepEqual(Array.from(released.p_expected_members),['old-user']);
 assert.equal(nodes.get('representatives').children[0].children[1].disabled,true);
 const before=calls.length;await stale.onclick();assert.equal(calls.length,before);
 hold=true;const pending=vm.runInContext('loadRepresentatives()',context);await flush();
 vm.runInContext("teacherSession='FORMAL';clearRepresentatives()",context);releaseList();await pending;
 assert.equal(nodes.get('representatives').children.length,0);assert.equal(nodes.get('loadRepresentatives').disabled,false);
 assert.equal(nodes.get('clearMembers').checked,false);
 context.$('panel-members').hidden=false;const start=calls.length;intervals[0]();await flush();assert(calls.length>start);assert.equal(calls.at(-1)[1].p_session_id,'FORMAL');
 nodes.get('panel-members').hidden=true;const hidden=calls.length;intervals[0]();await flush();assert.equal(calls.length,hidden);
 console.log('PASS: representative status/progress, cancel, scoped release/rotation with expected member, stale action and cross-session refresh guards');
})().catch(error=>{console.error(error);process.exitCode=1});

