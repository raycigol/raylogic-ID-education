/* Shared clock: server timestamp + monotonic elapsed time; never trusts the device clock. */
const SessionTimer=(()=>{
 let session=null,snapshot=null,anchor=0,epoch=0,inflight=false,lastSync=0,changing=false;
 const teacher=!!$('sessionSelect'),bar=$('sessionTimerBar');
 const phaseName=p=>p==='submission'?'提交答案':'小組討論';
 function seconds(t,elapsed=0){return Math.max(0,Math.ceil(t.state==='running'?(Date.parse(t.ends_at)-Date.parse(snapshot.server_now))/1000-elapsed:t.remaining_seconds))}
 function format(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
 function draw(){
  const t=snapshot?.timer,stale=performance.now()-lastSync>15000;
  if(!t||t.state==='idle'){bar.hidden=true;return}
  bar.hidden=false;
  const n=seconds(t,(performance.now()-anchor)/1000);
  bar.classList.toggle('timer-urgent',n<=60);
  bar.textContent='Stage '+t.stage_number+'｜'+phaseName(t.phase)+'｜'+(stale?'同步中，請以教師指示為準':n===0?'時間到':(t.state==='paused'?'已暫停 ':'剩餘 ')+format(n));
  if(teacher){
   $('pauseTimer').disabled=changing||stale||t.state!=='running'||n===0;
   $('resumeTimer').disabled=changing||stale||t.state!=='paused'||n===0;
   for(const id of ['addTimer','subtractTimer','stopTimer'])$(id).disabled=changing||stale;
  }
 }
 function clear(){epoch++;session=null;snapshot=null;inflight=false;bar.hidden=true;if(teacher)for(const id of ['startTimer','pauseTimer','resumeTimer','addTimer','subtractTimer','stopTimer'])$(id).disabled=true}
 async function sync(id){
  if(session!==id){clear();session=id}
  if(!id||inflight||changing)return;
  inflight=true;const version=epoch,start=performance.now();
  try{
   const data=await rpc('tbl_timer_status',{p_session_id:id});
   if(version!==epoch||session!==id)return;
   snapshot=data;anchor=(start+performance.now())/2;lastSync=performance.now();
   if(teacher){$('timerNotice').textContent='時間到只提醒，不會自動鎖定答案。';$('startTimer').disabled=false;for(const key of ['pauseTimer','resumeTimer','addTimer','subtractTimer','stopTimer'])$(key).disabled=!data.timer||data.timer.state==='idle'}
   draw();
  }catch(error){
   if(version!==epoch)return;
   if(teacher){$('timerNotice').textContent='計時無法同步：'+errorText(error);$('startTimer').disabled=true}
   // An unverified countdown must never look current after a connection failure.
   if(snapshot)lastSync=-Infinity;
   draw();
  }finally{if(version===epoch)inflight=false}
 }
 async function act(action,extra={}){
  if(changing||!session||!snapshot)return;
  const id=session,version=epoch;let failure='';
  changing=true;
  for(const key of ['startTimer','pauseTimer','resumeTimer','addTimer','subtractTimer','stopTimer'])$(key).disabled=true;
  try{await rpc('tbl_teacher_timer',{p_session_id:id,p_action:action,p_revision:snapshot.timer?.revision||0,...extra})}
  catch(error){failure=errorText(error)}
  finally{changing=false;if(version===epoch){await sync(id);if(failure)$('timerNotice').textContent='未完成操作：'+failure}}
 }
 if(teacher){
  $('startTimer').onclick=()=>{
   const minutes=Number($('timerMinutes').value);
   if(!Number.isFinite(minutes)||minutes<=0||minutes>120){$('timerNotice').textContent='請輸入大於 0、最多 120 分鐘。';return}
   if(snapshot?.timer?.state==='running'&&!confirm('將取代目前課堂正在進行的倒數，確定開始新計時？'))return;
   act('start',{p_stage:Number($('timerStage').value),p_phase:$('timerPhase').value,p_seconds:Math.round(minutes*60)});
  };
  $('pauseTimer').onclick=()=>act('pause');$('resumeTimer').onclick=()=>act('resume');
  $('addTimer').onclick=()=>act('add',{p_seconds:60});$('subtractTimer').onclick=()=>act('add',{p_seconds:-60});$('stopTimer').onclick=()=>act('stop');
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)sync(session)});
 window.addEventListener('pageshow',()=>{if(session)sync(session)});
 setInterval(draw,250);
 return {sync,clear,format};
})();
