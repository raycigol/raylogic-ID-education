const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=require('../timer-core.js'),source=fs.readFileSync(__dirname+'/../projection.js','utf8');
const sid='0f82561e-c980-44cb-8a5d-091dbc9c71e6';
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
class Element{
 constructor(){this.textContent='';this.hidden=false;this.attributes={};const classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>classes.add(x)),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)}}
 setAttribute(k,v){this.attributes[k]=v}click(){this.onclick?.()}
}
function page(query='?mode=sync&session='+sid){
 let now=1000,user={id:'teacher',is_anonymous:false},session={id:sid,title:'2026 ID Block TBL — TEST'},pending=null,offline=false,authEvent;
 let data={server_now:'2026-01-01T00:00:00Z',timer:{session_id:sid,stage_number:2,phase:'discussion',state:'running',remaining_seconds:90,ends_at:'2026-01-01T00:01:30Z'}};
 const nodes=new Map(),events={},intervals=[],calls=[],storage=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
 const sb={auth:{getUser:async()=>({data:{user}}),onAuthStateChange:f=>authEvent=f},from:table=>{calls.push(['from',table]);const q={select:()=>q,eq:(key,value)=>{calls.push([key,value]);return q},maybeSingle:async()=>({data:session})};return q},rpc:async(name,args)=>{calls.push([name,args]);if(pending)return new Promise(r=>pending.resolve=r);if(offline)throw Error('offline');return {data}}};
 const document={body:new Element(),hidden:false,getElementById:$,addEventListener:(k,v)=>events[k]=v,documentElement:{requestFullscreen:async()=>{document.fullscreenElement=true}}};
 const window={location:{search:query},TBL_CONFIG:{url:'https://test.invalid',key:'public-test'},supabase:{createClient:()=>sb},addEventListener:(k,v)=>events[k]=v};
 const context=vm.createContext({window,document,URLSearchParams,ClassroomTimer:core,performance:{now:()=>now},Date,Intl,setInterval:(f,ms)=>intervals.push({f,ms}),sessionStorage:{setItem:(...a)=>storage.push(a)}});
 vm.runInContext(source,context);window.ClassroomProjection.start();
 return {$,events,calls,storage,document,window,tick:ms=>{now+=ms;intervals.find(x=>x.ms===250)?.f()},poll:()=>intervals.find(x=>x.ms===4000)?.f(),setData:v=>data=v,getData:()=>data,setOffline:v=>offline=v,setSession:v=>session=v,setUser:v=>user=v,defer:()=>pending={},pending:()=>pending,authEvent:()=>authEvent(),context};
}
(async()=>{
 const p=page();await flush();
 assert.equal(p.$('digits').textContent,'01:30');assert.match(p.$('sessionContext').textContent,/TEST/);assert.equal(p.$('timerControls').hidden,true);assert.equal(p.$('settings').hidden,true);
 p.tick(10000);assert.equal(p.$('digits').textContent,'01:20');
 p.setData({...p.getData(),timer:{...p.getData().timer,state:'paused',phase:'submission',remaining_seconds:67}});p.poll();await flush();p.tick(5000);assert.equal(p.$('digits').textContent,'01:07');assert.match(p.$('phaseTitle').textContent,/提交答案/);assert.equal(p.$('status').textContent,'計時已暫停');
 p.$('clockMode').click();assert.equal(p.document.body.classList.contains('clock'),true);p.$('countdownMode').click();assert.equal(p.$('digits').textContent,'01:07');
 p.setData({...p.getData(),timer:{...p.getData().timer,state:'running',ends_at:'2026-01-01T00:00:00Z'}});p.poll();await flush();assert.equal(p.$('digits').textContent,'00:00');assert.equal(p.$('status').textContent,'時間到');
 p.setData({...p.getData(),timer:{...p.getData().timer,state:'idle'}});p.poll();await flush();assert.equal(p.$('digits').textContent,'--:--');assert.equal(p.$('status').textContent,'等待教師開始');
 p.setOffline(true);p.poll();await flush();assert.equal(p.$('digits').textContent,'--:--');assert.match(p.$('syncNotice').textContent,/offline/);
 p.setOffline(false);p.setData({...p.getData(),timer:{...p.getData().timer,state:'paused'}});p.poll();await flush();p.tick(16000);assert.equal(p.$('digits').textContent,'--:--');assert.equal(p.$('status').textContent,'等待同步');
 p.setUser({id:'student',is_anonymous:true});p.poll();await flush();assert.match(p.$('syncNotice').textContent,/登入教師/);assert.equal(p.$('digits').textContent,'--:--');
 p.setUser({id:'teacher',is_anonymous:false});p.setSession(null);p.poll();await flush();assert.match(p.$('syncNotice').textContent,/沒有讀取權限/);
 p.setSession({id:sid,title:'TEST'});p.setData({...p.getData(),timer:{...p.getData().timer,session_id:'FORMAL'}});p.poll();await flush();assert.equal(p.$('digits').textContent,'--:--');assert.match(p.$('syncNotice').textContent,/課堂資料不一致/);
 p.setData({...p.getData(),timer:{...p.getData().timer,session_id:sid}});const deferred=p.defer();p.poll();await flush();p.authEvent();deferred.resolve({data:p.getData()});await flush();assert.equal(p.$('digits').textContent,'--:--','logout invalidates late response');
 assert(p.calls.filter(x=>x[0]==='tbl_timer_status').every(x=>x[1].p_session_id===sid));
 assert(p.calls.every(x=>!String(x[0]).includes('teacher_timer')));assert.equal(p.storage.length,0,'projection never overwrites independent timer storage');
 const missing=page('?mode=sync');await flush();assert.equal(missing.calls.length,0);assert.match(missing.$('syncNotice').textContent,/教師控制台/);
 const invalid=page('?mode=sync&session=bad');await flush();assert.equal(invalid.calls.length,0);
 console.log('PASS: read-only projection; session ownership; phase/deadline/pause/zero/idle; clock mode; offline/stale/recovery; anonymous denied; mismatched sessions; late auth response; invalid URL; independent storage preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
