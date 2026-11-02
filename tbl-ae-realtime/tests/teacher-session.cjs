const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(){this.children=[];this.value='';this.textContent='';this.classList={add(){},remove(){}};this.rebuilds=0}
 get options(){return this.children}
 replaceChildren(){this.children=[];this.rebuilds++}
 append(child){this.children.push(child)}
 blur(){document.activeElement=null}
}
const nodes=new Map(),document={activeElement:null,hidden:false,createElement:()=>new Element()};
function clearJoinCodes(){for(const id of ['joinCodes','joinCodesName'])if(nodes.has(id))nodes.get(id).replaceChildren()}
const sessions=[{id:'0f82561e-c980-44cb-8a5d-091dbc9c71e6',title:'2026 ID Block TBL — TEST'},{id:'live',title:'正式課堂'}],calls=[],storage=new Map();
let releaseStages=null,hold=false;
const context=vm.createContext({document,console,confirm:()=>true,setInterval:()=>{},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},$:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},say:()=>{},errorText:error=>error.message,showScores:records=>calls.push(['scores',records]),rpc:async(name,args)=>{calls.push([name,args]);if(name==='tbl_session_roster')return {revision:0,target_count:16,teams:Array.from({length:16},(_,i)=>({team_id:'team'+i,team_name:'Team '+i,active:true}))};return []},sb:{auth:{getUser:async()=>({data:{user:{id:'teacher'}}}),signOut:async()=>{}},from:table=>{let target;const query={select:()=>query,eq:(key,value)=>{target=value;return query},order:()=>query,then:resolve=>{calls.push([table,target]);const result={data:table==='tbl_sessions'?sessions:table==='tbl_stages'?[{stage_number:1,is_open:false,is_locked:false,is_revealed:false}]:[]};if(hold&&table==='tbl_stages'){hold=false;return new Promise(done=>{releaseStages=()=>{resolve(result);done()}})}return Promise.resolve(resolve(result))}};return query}}});
const flush=async()=>{for(let count=0;count<30;count++)await new Promise(resolve=>setImmediate(resolve))};
(async()=>{
 context.clearJoinCodes=clearJoinCodes;context.clearParticipation=()=>{};context.renderParticipation=()=>{};
 context.clearRepresentatives=()=>{if(nodes.has('clearMembers'))nodes.get('clearMembers').checked=false};
 context.clearAnswerReview=()=>{};
 vm.runInContext(fs.readFileSync(process.argv[2]||__dirname+'/../teacher.js','utf8'),context);await flush();
 const selector=nodes.get('sessionSelect'),initial=selector.children[0],rebuilds=selector.rebuilds;
 await vm.runInContext('loadTeacher()',context);assert.equal(selector.rebuilds,rebuilds);assert.equal(selector.children[0],initial);
 document.activeElement=selector;await vm.runInContext('loadTeacher()',context);assert.equal(selector.rebuilds,rebuilds);document.activeElement=null;
 hold=true;vm.runInContext('loadTeacher()',context);await flush();assert.ok(releaseStages);
 selector.value='live';selector.onchange();releaseStages();await flush();
 assert.equal(selector.value,'live');assert.equal(storage.values().next().value,'live');
 assert.ok(calls.some(call=>call[0]==='tbl_published_scores'&&call[1].p_session_id==='live'));
 const stale=nodes.get('stages').children[0].children.at(-1).children[0];
 assert.equal(nodes.get('stages').children[0].children.at(-1).children.length,3);
 selector.value=sessions[0].id;selector.onchange();await flush();const before=calls.length;await stale.onclick();assert.equal(calls.length,before);
 const buttons=nodes.get('stages').children[0].children.at(-1).children;
 assert.equal(buttons.length,4);await buttons[3].onclick();await flush();
 assert.ok(calls.some(call=>call[0]==='tbl_teacher_simulate_test_submissions'&&call[1].p_session_id===sessions[0].id));
 await nodes.get('stages').children[0].children.at(-1).children[0].onclick();await flush();
 assert.ok(calls.some(call=>call[0]==='tbl_teacher_open_stage'&&call[1].p_session_id===sessions[0].id));
 context.requestTeacherConfirmation=async()=>null;const resets=()=>calls.filter(call=>call[0]==='tbl_teacher_reset_with_members').length;
 await nodes.get('resetSession').onclick();assert.equal(resets(),0);
 let resolveConfirmation;
 context.requestTeacherConfirmation=()=>new Promise(resolve=>{resolveConfirmation=resolve});
 const pendingReset=nodes.get('resetSession').onclick();await flush();
 assert.equal(nodes.get('sessionSelect').disabled,true);
 nodes.get('sessionSelect').value='live';nodes.get('sessionSelect').onchange();
 assert.equal(nodes.get('sessionSelect').value,sessions[0].id);
 resolveConfirmation(null);await pendingReset;await flush();assert.equal(resets(),0);
 assert.equal(nodes.get('sessionSelect').disabled,false);
 context.requestTeacherConfirmation=async()=>({reason:''});await nodes.get('resetSession').onclick();await flush();
 assert.equal(resets(),1);
 const reset=calls.find(call=>call[0]==='tbl_teacher_reset_with_members');
 assert.equal(reset[1].p_session_id,sessions[0].id);assert.equal(reset[1].p_confirm_title,sessions[0].title);
 assert.equal(reset[1].p_clear_members,false);
 nodes.get('clearMembers').checked=true;await nodes.get('resetSession').onclick();await flush();
 assert.equal(calls.filter(call=>call[0]==='tbl_teacher_reset_with_members')[1][1].p_clear_members,true);
 console.log('PASS: selector switching and simulator regression; reset cancellation and canonical session title/target; optional member clearing');
})().catch(error=>{console.error(error);process.exitCode=1});

