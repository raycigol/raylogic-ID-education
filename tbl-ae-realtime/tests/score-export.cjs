const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const directory=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const nodes=new Map(),downloads=[],blobs=[],revoked=[],calls=[],timers=[];
let response=[],fail=false,release=null,hold=false,user={id:'teacher',is_anonymous:false};
const document={
 getElementById:id=>{if(!nodes.has(id))nodes.set(id,{disabled:false});return nodes.get(id)},
 body:{append(){}},
 createElement:()=>({click(){downloads.push(this.download)},remove(){}})
};
const sb={auth:{getUser:async()=>({data:{user}})}};
const context=vm.createContext({
 document,Blob,Intl,console,window:{TBL_CONFIG:{},supabase:{createClient:()=>sb}},
 URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:export-'+blobs.length},revokeObjectURL:url=>revoked.push(url)},
 setTimeout:handler=>timers.push(handler),
 rpc:async(name,args)=>{calls.push([name,args]);if(hold){hold=false;await new Promise(resolve=>{release=resolve})}if(fail)throw new Error('Access denied');return name==='tbl_teacher_representatives'?[{team_number:4,team_name:'尚未公布的第 4 組',member_ids:['private-student-id']}]:response}
});
const flush=async()=>{for(let count=0;count<10;count++)await new Promise(resolve=>setImmediate(resolve))};
(async()=>{
 const exportRpc=context.rpc;
 vm.runInContext(fs.readFileSync(path.join(directory,'common.js'),'utf8'),context);
 context.rpc=exportRpc;
 vm.runInContext("let teacherSession='TEST-id',teacherTitle='TEST class',actionBusy=false,refreshNonce=0;async function loadTeacher(){}",context);
 vm.runInContext(fs.readFileSync(path.join(directory,'teacher-export.js'),'utf8'),context);
 const fixture=[{team_number:1,team_name:'第 1 組',stage_number:1,score:10},{team_number:2,team_name:'第 2 組',stage_number:1,score:10},{team_number:3,team_name:'第 3 組',stage_number:1,score:0}];
 context.fixture=fixture;
 const output=vm.runInContext("buildScoreExport('TEST-id','測試課堂',fixture,new Date('2026-10-31T16:05:06Z'))",context);
 assert.equal(output.content.charCodeAt(0),0xfeff);
 assert.ok(output.filename.includes('20261101-000506'));
 const rows=output.content.slice(1).trimEnd().split('\r\n');assert.equal(rows.length,14);
 assert.ok(rows[1].includes('"10","","","","10","1"'));
 assert.ok(rows[3].includes('"0","","","","0","3"'));
 assert.ok(rows[4].includes('"","","","","","","2026-11-01 00:05:06"'));
 assert.equal(vm.runInContext("scoreCsvCell('  =HYPERLINK(1)')",context),'"\'  =HYPERLINK(1)"');
 assert.equal(vm.runInContext("scoreCsvCell('第 1 組, \"甲\"')",context),'"第 1 組, ""甲"""');
 assert.equal(vm.runInContext("scoreCsvCell('甲\\n乙')",context),'"甲\n乙"');
 response=fixture;await context.exportTeacherScores();
 assert.equal(calls[0][0],'tbl_published_scores');assert.equal(calls[0][1].p_session_id,'TEST-id');
 assert.equal(downloads.length,1);assert.equal(blobs[0].type,'text/csv;charset=utf-8');
 assert.deepEqual(Array.from(new Uint8Array(await blobs[0].arrayBuffer()).slice(0,3)),[239,187,191]);
 assert.ok((await blobs[0].text()).includes('尚未公布的第 4 組'));
 assert.ok(!(await blobs[0].text()).includes('private-student-id'));
 timers.splice(0).forEach(handler=>handler());assert.equal(revoked.length,1);
 hold=true;const pending=context.exportTeacherScores();await flush();
 assert.equal(nodes.get('sessionSelect').disabled,true);
 vm.runInContext("teacherSession='FORMAL-id'",context);release();await pending;assert.equal(downloads.length,1);
 assert.equal(nodes.get('sessionSelect').disabled,false);
 fail=true;await context.exportTeacherScores();assert.equal(downloads.length,1);
 fail=false;user={id:'student',is_anonymous:true};const before=calls.length;await context.exportTeacherScores();assert.equal(calls.length,before);
 console.log('PASS: selected-session fresh RPC; unpublished blanks/zero/tie ranking; UTF-8 BOM; Taipei timestamp; CSV escaping/formula protection; stale/failed/student exports blocked; URL cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
