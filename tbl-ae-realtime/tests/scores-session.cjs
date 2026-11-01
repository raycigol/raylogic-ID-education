const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const directory=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const flush=async()=>{for(let count=0;count<10;count++)await new Promise(resolve=>setImmediate(resolve))};
(async()=>{
 for(const scenario of [
  {anonymous:true,preferred:'TEST',expected:'TEST'},
  {anonymous:true,preferred:'missing',expected:null},
  {anonymous:false,preferred:'TEST',expected:'TEST'},
  {anonymous:false,preferred:'missing',expected:null}
 ]){
  const calls=[],storage=new Map();
  storage.set(scenario.anonymous?'tbl-ae-realtime-student-session':'tbl-ae-realtime-teacher-session',scenario.preferred);
  const context=vm.createContext({
   URL,URLSearchParams,window:{location:new URL('https://example.test/scores.html')},
   document:{hidden:false},$:()=>({replaceChildren(){}}),say(){},showScores(){},errorText:error=>error.message,setInterval(){},
   sessionStorage:{getItem:key=>storage.get(key)},
   sb:{auth:{getUser:async()=>({data:{user:{is_anonymous:scenario.anonymous}}})},from:()=>({select:async()=>({data:[{id:'FORMAL',title:'Formal class'},{id:'TEST',title:'TEST class'}]})})},
   rpc:async(name,args)=>{calls.push([name,args]);return name==='tbl_student_status'?[{session_id:'FORMAL',team_name:'Formal team'},{session_id:'TEST',team_name:'TEST team'}]:[]}
  });
  vm.runInContext(fs.readFileSync(path.join(directory,'join-codes.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(directory,'scores.js'),'utf8'),context);await flush();
  const request=calls.find(call=>call[0]==='tbl_published_scores');
  if(scenario.expected)assert.equal(request[1].p_session_id,scenario.expected);else assert.equal(request,undefined);
 }
 console.log('PASS: student/teacher scores use selected TEST session; missing selection never falls back to formal class');
})().catch(error=>{console.error(error);process.exitCode=1});
