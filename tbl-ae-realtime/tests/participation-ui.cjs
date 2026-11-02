const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
class Element{constructor(){this.children=[];this.style={};this.disabled=false;this.textContent=''}append(...c){this.children.push(...c)}replaceChildren(){this.children=[]}}
const nodes=new Map(),calls=[];let allow=true;
const roster={revision:4,target_count:17,frozen:false,teams:Array.from({length:17},(_,i)=>({team_id:'id'+(i+1),team_number:i+1,team_name:'Team '+(i+1),active:true}))};
const c=vm.createContext({document:{createElement:()=>new Element(),createTextNode:t=>t},$:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},confirm:()=>allow,say(){},errorText:e=>e.message,clearJoinCodes(){},rpc:async(name,args)=>{calls.push({name,args});return roster}});
vm.runInContext("let teacherSession='TEST',teacherTitle='TEST title',actionBusy=false,refreshNonce=0;async function loadTeacher(){}",c);
vm.runInContext(fs.readFileSync(__dirname+'/../teacher-participation.js','utf8'),c);
(async()=>{
 await nodes.get('editParticipation').onclick();
 const area=nodes.get('participation'),inputs=area.children.filter(n=>n.children?.[0]?.type==='checkbox').map(n=>n.children[0]);
 inputs[7].checked=false;inputs[7].onchange();assert.match(area.children[0].textContent,/選取 16/);
 const save=area.children.find(n=>n.textContent==='儲存參與組別');
 allow=false;await save.onclick();assert.equal(calls.filter(x=>x.name==='tbl_teacher_set_participation').length,0);
 allow=true;await save.onclick();const mutation=calls.find(x=>x.name==='tbl_teacher_set_participation');assert.equal(mutation.args.p_team_ids.length,16);assert.ok(!mutation.args.p_team_ids.includes('id8'));assert.equal(mutation.args.p_expected_revision,4);assert.equal(mutation.args.p_session_id,'TEST');
 await nodes.get('editParticipation').onclick();const stale=area.children.find(n=>n.textContent==='儲存參與組別');vm.runInContext("teacherSession='FORMAL';clearParticipation()",c);const before=calls.length;await stale.onclick();assert.equal(calls.length,before);
 const common=vm.createContext({window:{TBL_CONFIG:{},supabase:{createClient:()=>({})}},document:{}});vm.runInContext(fs.readFileSync(__dirname+'/../common.js','utf8'),common);
 common.rows=roster.teams.filter(t=>t.team_number!==8).map(t=>({...t,stage_number:null,score:null}));let result=vm.runInContext('makeScoreTable(rows)',common);assert.equal(result.length,16);assert.ok(result.every(t=>t.total===null&&t.rank===null));assert.ok(result.some(t=>t.n===17));assert.ok(!result.some(t=>t.n===8));
 console.log('PASS: select middle absent team, count preview, cancel, versioned scoped save, stale session blocked, dynamic score roster and unpublished blanks');
})().catch(e=>{console.error(e);process.exitCode=1});
