const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(){this.children=[];this.textContent='';this.value='';this.classList={add(){},remove(){},toggle(){}}}
 replaceChildren(){this.children=[]}
 append(...children){this.children.push(...children)}
 querySelectorAll(){return this.children}
}
const flush=async()=>{for(let n=0;n<10;n++)await new Promise(resolve=>setImmediate(resolve))};
(async()=>{
 const source=process.argv[2]||path.join(__dirname,'../student.js'),nodes=new Map(),calls=[];
 const stage=(number,answer,flags={})=>({session_id:'TEST',team_number:1,team_name:'第 1 組',stage_number:number,my_answer:answer,is_open:true,is_locked:false,is_revealed:false,...flags});
 let rows=[stage(1,'A'),stage(2,'C',{is_locked:true}),stage(3,'E',{is_locked:true,is_revealed:true}),stage(4,null,{is_locked:true})];
 let scores=[{team_number:2,stage_number:3,score:99},{team_number:1,stage_number:2,score:88},{team_number:1,stage_number:3,score:'7.5'}],scoreError=false;
 const context=vm.createContext({
  document:{hidden:false,createElement:()=>new Element()},$:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},
  setInterval(){},say(){},confirm:()=>true,errorText:error=>error.message,URL,URLSearchParams,
  window:{location:new URL('https://example.test/student.html'),history:{replaceState(){}}},
  sessionStorage:{getItem:key=>key==='tbl-ae-realtime-student-session'?'TEST':null},
  sb:{auth:{getUser:async()=>({data:{user:{id:'student',is_anonymous:true}}})}},
  rpc:async(name,args)=>{calls.push([name,args]);if(name==='tbl_session_roster')return {teams:[{team_number:1,active:true}]};if(name==='tbl_published_scores'){assert.equal(args.p_session_id,'TEST');if(scoreError)throw new Error('offline');return scores}assert.equal(name,'tbl_student_status');return [stage(1,'D',{session_id:'FORMAL'}),...rows]}
 });
 vm.runInContext(fs.readFileSync(path.join(path.dirname(source),'join-codes.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(source,'utf8'),context);await flush();
 const boxes=()=>nodes.get('stageList').children;
 assert.equal(boxes().length,4);
 assert.match(boxes()[0].children[1].textContent,/本組已提交：A/);
 // Selecting a different choice does not pretend that the server accepted it.
 boxes()[0].children[2].children[0].children[1].onclick();
 assert.match(boxes()[0].children[1].textContent,/本組已提交：A/);
 assert.match(boxes()[1].children[1].textContent,/本組已提交：C.*已鎖定，不能修改/);
 assert.match(boxes()[2].children[1].textContent,/本組已提交：E.*本階段得分：7.5 分/);
 assert.match(boxes()[1].children[1].textContent,/得分：待教師公布/);
 assert.ok(!boxes().some(box=>/99|88/.test(box.children[1].textContent)),'other team and unrevealed scores stay hidden');
 assert.match(boxes()[3].children[1].textContent,/本組尚未提交/);
 for(const box of boxes().slice(1))assert.equal(box.children.length,2,'locked/published stages have no answer controls');
 assert.ok(!boxes().some(box=>box.children[1].textContent.includes('已提交：D')),'other classroom answers stay hidden');
 scores=[{team_number:1,stage_number:3,score:0}];await vm.runInContext('loadStudent()',context);
 assert.match(boxes()[2].children[1].textContent,/本階段得分：0 分/);
 scores=[{team_number:1,stage_number:3,score:null}];await vm.runInContext('loadStudent()',context);
 assert.match(boxes()[2].children[1].textContent,/尚無得分紀錄/);
 scoreError=true;await vm.runInContext('loadStudent()',context);
 assert.match(boxes()[2].children[1].textContent,/本組已提交：E.*暫時無法載入/);
 scoreError=false;scores=[{team_number:1,stage_number:3,score:10}];await vm.runInContext('loadStudent()',context);
 assert.match(boxes()[2].children[1].textContent,/本階段得分：10 分/);
 rows=[stage(1,'B',{is_locked:true})];await vm.runInContext('loadStudent()',context);
 assert.match(boxes()[0].children[1].textContent,/本組已提交：B/);
 rows=[stage(1,null,{is_open:false})];await vm.runInContext('loadStudent()',context);
 assert.equal(boxes().length,1);assert.equal(boxes()[0].children[1].textContent,'本組尚未提交｜得分：待教師公布');
 assert.equal(boxes()[0].children.length,2);
 assert.ok(calls.every(call=>['tbl_student_status','tbl_session_roster','tbl_published_scores'].includes(call[0])),'read-only APIs only');
 console.log('PASS: own answers and published scores, zero/null/error/retry, privacy, reset and classroom scope');
})().catch(error=>{console.error(error);process.exitCode=1});
