const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(){this.children=[];this.textContent='';this.value='';this.dataset={};this.hidden=false;this.disabled=false;const classes=new Set();this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)}}
 replaceChildren(){this.children=[]}append(...nodes){this.children.push(...nodes)}
 setAttribute(){}addEventListener(){}
}
const flush=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve))};
(async()=>{
 const root=process.argv[2]||path.join(__dirname,'..'),nodes=new Map(),calls=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
 const round={id:'R1',round_number:1,state:'open',winner_team_id:null,winner_name:null,points:0};
 let data={rounds:[round],totals:[{team_id:'T1',team_name:'TEST 1',points:0}],my_team_id:'T1',score_log:[]},hold=null;
 const context=vm.createContext({
  $,document:{hidden:false,createElement:()=>new Element()},setInterval(){},confirm:()=>true,say(){},errorText:e=>e.message,
  teacherSession:'TEST',teacherTitle:'TEST class',actionBusy:false,refreshNonce:0,
  mySession:'TEST',studentNonce:0,studentBusy:false,
  rpc:async(name,args)=>{
   calls.push([name,args]);if(name==='tbl_buzzer_status'){if(hold)await hold;return structuredClone(data)}
   if(name==='tbl_student_buzz'){data.rounds[0]={...round,state:'claimed',winner_team_id:'T1',winner_name:'TEST 1'};return true}
   return 'R1';
  }
 });
 vm.runInContext(fs.readFileSync(path.join(root,'student-buzzer.js'),'utf8'),context);
 data.rounds=[];await vm.runInContext('loadStudentBuzzer()',context);
 assert.equal($('studentBuzzer').classList.contains('hide'),true,'unused buzzer stays hidden');
 assert.equal($('buzzButton').disabled,true);
 data.rounds=[round];await vm.runInContext('loadStudentBuzzer()',context);assert.equal($('buzzButton').disabled,false);
 assert.equal($('studentBuzzer').classList.contains('hide'),false,'teacher opening a round reveals buzzer');
 const staleBuzz=$('buzzButton').onclick;
 await staleBuzz();await flush();assert.equal($('buzzButton').disabled,true);
 assert.match($('studentBuzzerStatus').textContent,/本組取得回答權/);
 assert.equal($('studentBuzzer').classList.contains('hide'),false,'winner feedback remains until teacher closes round');
 assert.equal(calls.find(c=>c[0]==='tbl_student_buzz')[1].p_round_id,'R1');
 const claimed=data.rounds[0];
 data.rounds=[{...claimed,state:'closed'}];await vm.runInContext('loadStudentBuzzer()',context);
 assert.equal($('studentBuzzer').classList.contains('hide'),true,'teacher closing round hides entire buzzer');
 assert.equal($('studentBuzzerTotals').children.length,0);
 const closedCount=calls.length;await staleBuzz();assert.equal(calls.length,closedCount,'hidden old button cannot submit');
 data.rounds=[{...round,id:'R2'}];await vm.runInContext('loadStudentBuzzer()',context);
 assert.equal($('studentBuzzer').classList.contains('hide'),false,'next round reveals buzzer again');
 data.rounds=[];await vm.runInContext('loadStudentBuzzer()',context);
 assert.equal($('studentBuzzer').classList.contains('hide'),true,'reset removes buzzer');
 data.rounds=[claimed];
 context.mySession='FORMAL';const count=calls.length;await staleBuzz();assert.equal(calls.length,count,'stale student button never submits to another class');
 let release;hold=new Promise(resolve=>release=resolve);
 const loading=vm.runInContext('loadStudentBuzzer()',context);await flush();
 vm.runInContext('clearStudentBuzzer()',context);context.studentNonce++;context.mySession=null;
 release();await loading;hold=null;assert.equal($('studentBuzzerStatus').textContent,'','late status cannot restore logged-out content');
 context.mySession='TEST';context.teacherSession='TEST';
 vm.runInContext(fs.readFileSync(path.join(root,'teacher-buzzer.js'),'utf8'),context);
 await vm.runInContext('loadTeacherBuzzer()',context);
 assert.match($('buzzerStatus').textContent,/TEST class.*TEST 1/);
 assert.equal($('startBuzzer').disabled,false);
 const row=$('buzzerHistory').children[0],input=row.children[1],reason=row.children[2],save=row.children[3];
 input.value='5';reason.value='答對';await vm.runInContext('loadTeacherBuzzer()',context);
 assert.equal($('buzzerHistory').children[0],row,'polling preserves score entry');
 save.onclick();await flush();
 const scored=calls.find(c=>c[0]==='tbl_teacher_buzzer');
 assert.equal(scored[1].p_session_id,'TEST');assert.equal(scored[1].p_expected_points,0);assert.equal(scored[1].p_points,5);
 assert.equal(scored[1].p_reason,'答對','custom reason is preserved');
 input.value='7';reason.value='   ';save.onclick();await flush();
 const defaultScored=calls.filter(c=>c[0]==='tbl_teacher_buzzer').at(-1);
 assert.equal(defaultScored[1].p_points,7);assert.equal(defaultScored[1].p_reason,'教師判分','blank reason still submits auditable score');
 const validCount=calls.length;input.value='-1';save.onclick();await flush();assert.equal(calls.length,validCount,'invalid score still blocked');
 input.value='7';reason.value='更正';
 context.teacherSession='FORMAL';vm.runInContext('clearTeacherBuzzer()',context);
 const before=calls.length;save.onclick();await flush();assert.equal(calls.length,before,'old scoring controls cannot modify another session');
 assert.equal($('buzzerHistory').children.length,0);
 context.teacherSession='TEST';await vm.runInContext('loadTeacherBuzzer()',context);
 assert.equal($('buzzerHistory').children.length,1,'same data rebuilds after session clear');
 data.rounds=[{...round,id:'R2'}];await vm.runInContext('loadTeacherBuzzer()',context);
 assert.equal($('startBuzzer').disabled,true);
 console.log('PASS: student winner/disabled button; stale request/logout/session guards; manual scoped scoring; polling preserves inputs; switching clears and restores UI');
})().catch(error=>{console.error(error);process.exitCode=1});
