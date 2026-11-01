const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const directory=path.resolve(process.argv[2]||path.join(__dirname,'..'));
class Element{
 constructor(){this.children=[];this.textContent='';this.disabled=false}
 append(...children){this.children.push(...children)}
 replaceChildren(){this.children=[]}
}
const nodes=new Map(),calls=[],approvals=[],messages=[];
const snapshot={id:'submission-one',session_id:'TEST',team_id:'team-one',stage_number:1,answer:'A',submitted_at:'2026-11-01T00:00:00Z',submitted_by:'student'};
let submitted=true,locked=false,revealed=false,scored=false,releaseList=null,hold=false;
const context=vm.createContext({
 document:{createElement:()=>new Element()},$:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},
 requestTeacherConfirmation:async()=>approvals.shift()||null,say:message=>messages.push(message),errorText:error=>error.message,clearRepresentatives(){},
 rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='tbl_teacher_answer_review'){
   if(hold){hold=false;await new Promise(resolve=>{releaseList=resolve})}
   return {submissions:submitted?[{submission:snapshot,team_name:'TEST 1',is_locked:locked,is_revealed:revealed,has_scores:scored}]:[],history:submitted?[]:[{team_name:'TEST 1',stage_number:1,original_submission:snapshot,withdrawn_at:'2026-11-01T01:00:00Z',reason:'誤加入別組'}]};
  }
  submitted=false;return 'audit-one';
 }
});
const flush=async()=>{for(let count=0;count<10;count++)await new Promise(resolve=>setImmediate(resolve))};
(async()=>{
 vm.runInContext("let teacherSession='TEST',teacherTitle='TEST class',actionBusy=false,refreshNonce=0;async function loadTeacher(){}",context);
 vm.runInContext(fs.readFileSync(path.join(directory,'teacher-answer-review.js'),'utf8'),context);
 await vm.runInContext('loadAnswerReview()',context);
 const stale=nodes.get('answerReview').children[0].children[1];
 approvals.push(null);await stale.onclick();assert.equal(calls.filter(call=>call[0]==='tbl_teacher_withdraw_answer').length,0);
 for(const variant of ['locked','revealed','scored']){
  locked=variant==='locked';revealed=variant==='revealed';scored=variant==='scored';await vm.runInContext('loadAnswerReview()',context);assert.equal(nodes.get('answerReview').children[0].children[1].disabled,true);
 }
 locked=false;revealed=false;scored=false;await vm.runInContext('loadAnswerReview()',context);
 approvals.push({reason:'誤加入別組'});await nodes.get('answerReview').children[0].children[1].onclick();
 const request=calls.find(call=>call[0]==='tbl_teacher_withdraw_answer')[1];
 assert.equal(request.p_session_id,'TEST');assert.equal(request.p_team_id,'team-one');assert.equal(request.p_stage,1);
 assert.equal(request.p_expected_submission,snapshot);assert.equal(request.p_reason,'誤加入別組');
 assert.equal(request.p_confirm_title,'TEST class');assert.equal(request.p_confirm_text,'撤回 TEST 1 S1');
 assert.equal(nodes.get('answerHistory').children.length,1);
 assert.ok(nodes.get('answerHistory').children[0].children[0].textContent.includes('原答案 A'));
 const before=calls.length;await stale.onclick();assert.equal(calls.length,before);
 hold=true;const pending=vm.runInContext('loadAnswerReview()',context);await flush();
 vm.runInContext("teacherSession='FORMAL';clearAnswerReview()",context);releaseList();await pending;
 assert.equal(nodes.get('answerReview').children.length,0);assert.equal(nodes.get('answerHistory').children.length,0);
 assert.equal(nodes.get('loadAnswerReview').disabled,false);
 console.log('PASS: dialog cancellation; lock/publish/score guards; canonical backend confirmation and snapshot; audit display; stale/cross-session guards');
})().catch(error=>{console.error(error);process.exitCode=1});
