const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(){this.children=[];this.value='';this.classList={add(){},remove(){}}}
 replaceChildren(){this.children=[]}
 append(...children){this.children.push(...children)}
}
const flush=async()=>{for(let count=0;count<10;count++)await new Promise(resolve=>setImmediate(resolve))};
(async()=>{
 const nodes=new Map(),calls=[];
 let user={id:'student',is_anonymous:true},delay=null,hold=false;
 const context=vm.createContext({
  document:{hidden:false,createElement:()=>new Element()},$:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},
  setInterval(){},confirm:()=>true,say(){},errorText:error=>error.message,
  sb:{auth:{getUser:async()=>({data:{user}}),signOut:async options=>{calls.push(['logout',options]);user=null;return {}},signInAnonymously:async()=>{user={id:'new',is_anonymous:true};return {data:{user}}}}},
  rpc:async(name,args)=>{calls.push([name,args]);if(name==='tbl_student_status'){if(hold){hold=false;await new Promise(resolve=>{delay=resolve})}return [{session_id:'TEST',team_name:'TEST 1',stage_number:1,is_open:true,is_locked:false,is_revealed:false}]}return []}
 });
 vm.runInContext(fs.readFileSync(process.argv[2]||__dirname+'/../student.js','utf8'),context);await flush();
 assert.equal(nodes.get('stageList').children.length,1);
 const staleSend=nodes.get('stageList').children[0].children[2].children[1];
 hold=true;vm.runInContext('loadStudent()',context);await flush();
 await nodes.get('leaveBtn').onclick();delay();await flush();
 assert.equal(nodes.get('stageList').children.length,0);
 assert.equal(calls.find(call=>call[0]==='logout')[1].scope,'local');
 const before=calls.length;await staleSend.onclick();assert.equal(calls.length,before);
 nodes.get('joinCode').value='11111111-1111-4111-8111-111111111111';await nodes.get('joinBtn').onclick();await flush();
 assert.ok(calls.some(call=>call[0]==='tbl_join_team'));
 user={id:'teacher',is_anonymous:false};const logouts=calls.filter(call=>call[0]==='logout').length;
 await nodes.get('leaveBtn').onclick();assert.equal(calls.filter(call=>call[0]==='logout').length,logouts);
 await assert.rejects(vm.runInContext('ensureAuth()',context),/教師登入/);
 console.log('PASS: local student logout, in-flight refresh and stale submit blocked, rejoin works, teacher login preserved');
})().catch(error=>{console.error(error);process.exitCode=1});
