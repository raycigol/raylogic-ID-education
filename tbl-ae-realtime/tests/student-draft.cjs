const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
class Element{
 constructor(){this.children=[];this.textContent='';const classes=new Set();this.classList={add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)}}
 append(...children){this.children.push(...children)}replaceChildren(){this.children=[]}querySelectorAll(){return this.children}
}
const flush=async()=>{for(let n=0;n<12;n++)await new Promise(r=>setImmediate(r))};
(async()=>{
 const source=process.argv[2]||path.join(__dirname,'../student.js'),nodes=new Map(),intervals=[],submitted=[];
 let team=13,session='TEST',preferred='TEST',rows,failSubmit=false,holdStatus=false,resolveStatus;
 const stage=(n,answer,flags={})=>({session_id:session,team_number:team,team_name:'TEST '+team,stage_number:n,my_answer:answer,my_submitted_at:answer?'v1':null,is_open:true,is_locked:false,is_revealed:false,...flags});
 rows=[stage(1,'A'),stage(2,'C'),stage(3,null)];
 const context=vm.createContext({SessionTimer:{clear(){},sync(){}},document:{hidden:false,createElement:()=>new Element()},$:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},setInterval:f=>intervals.push(f),confirm:()=>true,say(){},errorText:e=>e.message,URL,URLSearchParams,window:{location:new URL('https://test/student.html'),history:{replaceState(){}}},sessionStorage:{getItem:()=>preferred},sb:{auth:{getUser:async()=>({data:{user:{is_anonymous:true}}})}},
 rpc:async(name,args)=>{
  if(name==='tbl_student_status'){if(holdStatus){holdStatus=false;await new Promise(r=>resolveStatus=r)}return rows}
  if(name==='tbl_session_roster')return {teams:[{team_number:team,active:true}]};
  if(name==='tbl_submit_answer'){submitted.push(args);if(failSubmit)throw Error('offline');return []}
  if(name==='tbl_published_scores')return [];throw Error(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../join-codes.js'),'utf8'),context);vm.runInContext(fs.readFileSync(source,'utf8'),context);await flush();
 const box=n=>nodes.get('stageList').children[n-1],controls=n=>box(n).children[2],choices=n=>controls(n).children[0].children;
 const selected=n=>choices(n).filter(x=>x.classList.contains('on')).map(x=>x.textContent).join('');
 const click=(n,a)=>choices(n).find(x=>x.textContent===a).onclick();
 const poll=async()=>{intervals[0]();await flush()};
 click(1,'B');await poll();await poll();assert.equal(selected(1),'B','polling must retain unsubmitted B over server A');assert.match(box(1).children[1].textContent,/已提交：A/);assert.match(controls(1).children[2].textContent,/B.*尚未送出/);
 click(2,'E');click(3,'D');await poll();assert.equal(selected(1),'B');assert.equal(selected(2),'E');assert.equal(selected(3),'D');
 holdStatus=true;intervals[0]();await flush();click(1,'D');resolveStatus();await flush();assert.equal(selected(1),'D','a response already in flight must retain the newest local click');
 failSubmit=true;await controls(1).children[1].onclick();await flush();assert.equal(selected(1),'D');assert.equal(submitted.at(-1).p_answer,'D');
 failSubmit=false;await controls(1).children[1].onclick();await flush();assert.equal(selected(1),'D','stale server reads after successful submission must not flash A');
 rows[0]=stage(1,'D',{my_submitted_at:'v2'});await poll();assert.equal(selected(1),'D');assert.equal(controls(1).children[2].textContent,'');assert.match(box(1).children[1].textContent,/已提交：D/);
 click(1,'B');rows[0]=stage(1,'E',{my_submitted_at:'v3'});await poll();assert.equal(selected(1),'E','new server answer invalidates stale draft');
 click(1,'B');rows[0]=stage(1,'E',{my_submitted_at:'v4'});await poll();assert.equal(selected(1),'E','same answer with a new submission revision also invalidates stale draft');
 rows[1]=stage(2,'C',{is_open:false});await poll();assert.equal(box(2).children.length,2);rows[1]=stage(2,'C');await poll();assert.equal(selected(2),'C','closed stage must discard pending E');
 click(1,'B');rows[0]=stage(1,'E',{is_locked:true});await poll();assert.equal(box(1).children.length,2);
 team=12;rows=[stage(1,'A')];await poll();assert.equal(selected(1),'A');click(1,'C');
 session='FORMAL';preferred='FORMAL';rows=[stage(1,'E')];await poll();assert.equal(selected(1),'E','drafts cannot cross classroom boundaries');
 vm.runInContext('clearStudent()',context);assert.equal(nodes.get('stageList').children.length,0);
 console.log('PASS: repeated polls, in-flight reads, multiple stages, unsubmitted answers, submit failure/retry and server echo, server revision changes, close/lock, team/classroom/logout isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
