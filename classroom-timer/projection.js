/* Read-only mirror of the selected session's server timer. No timer write RPCs. */
window.ClassroomProjection=(()=>{
 const params=new URLSearchParams(window.location.search);
 const requested=params.get('mode')==='sync';
 function start(){
  const $=id=>document.getElementById(id),sid=params.get('session');
  let snapshot=null,anchor=0,lastSync=-Infinity,inflight=false,clockMode=false,generation=0;
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value};
  document.body.classList.add('synced','projection');
  $('settings').hidden=true;$('timerControls').hidden=true;$('progressTrack').hidden=true;
  $('independentMode').hidden=false;$('syncModeLink').hidden=true;
  $('sound').disabled=true;
  text('projection','顯示設定');$('projection').setAttribute('aria-pressed','true');
  text('sessionContext','正在確認課堂…');
  text('displayNote','同步投影 · 請在教師控制台操作計時');
  $('teacherControlLink').href='../tbl-ae-realtime/teacher.html';
  function draw(){
   const now=performance.now(),t=snapshot?.timer,stale=now-lastSync>15000;
   const active=t&&t.state!=='idle';
   const n=active?Math.max(0,Math.ceil(t.state==='running'?(Date.parse(t.ends_at)-Date.parse(snapshot.server_now))/1000-(now-anchor)/1000:t.remaining_seconds)):0;
   text('smallClock',clock.format(Date.now()));
   $('smallClock').dateTime=new Date().toISOString();
   const phase=t?.phase==='submission'?'提交答案':'小組討論';
   text('phaseTitle',active?'AE · Stage '+t.stage_number+' · '+phase:'課堂同步計時');
   text('digits',clockMode?clock.format(Date.now()):active&&!stale?ClassroomTimer.format(n):'--:--');
   $('digits').setAttribute('aria-label',clockMode?'台北現在時間':active&&!stale?'剩餘 '+ClassroomTimer.format(n):'尚無可確認的倒數');
   text('status',stale?'等待同步':!active?'等待教師開始':n===0?'時間到':t.state==='paused'?'計時已暫停':phase+'中');
   text('timeHint',stale?'連線尚未確認，請以教師指示為準':!active?'教師開始小組討論或提交答案計時後，這裡會同步顯示。':n===0?'本段時間到，由教師決定下一步。':t.state==='paused'?'等待教師繼續計時':'與學生作答頁同步 · 約每 4 秒更新狀態');
   document.body.classList.toggle('clock',clockMode);
   document.body.classList.toggle('warning',!!active&&!stale&&n>0&&n<=60&&!clockMode);
   document.body.classList.toggle('finished',!!active&&!stale&&n===0&&!clockMode);
   $('countdownMode').setAttribute('aria-pressed',String(!clockMode));$('clockMode').setAttribute('aria-pressed',String(clockMode));
  }
  const cfg=window.TBL_CONFIG;
  let sb=null;
  async function sync(){
   if(inflight||!sb)return;
   inflight=true;const version=generation,started=performance.now();
   try{
    const {data:auth,error:authError}=await sb.auth.getUser();
    if(authError||!auth?.user||auth.user.is_anonymous)throw new Error('請先在同一個瀏覽器登入教師控制台，再重新整理此頁。');
    const {data:session,error:sessionError}=await sb.from('tbl_sessions').select('id,title').eq('id',sid).eq('teacher_id',auth.user.id).maybeSingle();
    if(sessionError||!session)throw new Error('找不到這個課堂，或目前教師沒有讀取權限。請從教師控制台重新開啟同步投影。');
    const {data,error}=await sb.rpc('tbl_timer_status',{p_session_id:sid});
    if(error)throw error;
    if(version!==generation)return;
    if(data.timer&&data.timer.session_id!==sid)throw new Error('課堂資料不一致，已停止顯示倒數。');
    snapshot=data;anchor=(started+performance.now())/2;lastSync=performance.now();
    text('sessionContext',session.title+'｜同步投影');
    text('syncNotice','此畫面固定顯示這個課堂。切換課堂後，請從教師控制台重新開啟對應投影。');
    draw();
   }catch(error){
    if(version!==generation)return;
    snapshot=null;lastSync=-Infinity;
    text('sessionContext','同步投影｜尚未確認課堂');
    text('syncNotice',error.message||'計時暫時無法同步，請確認網路後重試。');draw();
   }finally{if(version===generation)inflight=false}
  }
  $('countdownMode').onclick=()=>{clockMode=false;draw()};$('clockMode').onclick=()=>{clockMode=true;draw()};
  $('projection').onclick=()=>{const on=!document.body.classList.contains('projection');document.body.classList.toggle('projection',on);$('projection').setAttribute('aria-pressed',String(on));text('projection',on?'顯示設定':'專注投影')};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{text('syncNotice','目前無法切換全螢幕，仍可使用專注投影。')}};
  document.addEventListener('fullscreenchange',()=>{text('fullscreen',document.fullscreenElement?'退出全螢幕 ↙':'全螢幕 ↗')});
  document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target?.closest('input,textarea,select,button,a'))return;if(event.key.toLowerCase()==='f')$('fullscreen').click();else if(event.code==='Space')event.preventDefault()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastSync=-Infinity;draw();sync()}});
  window.addEventListener('pageshow',()=>{lastSync=-Infinity;draw();sync()});
  draw();
  if(!sid||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)){
   text('syncNotice','請從教師控制台選擇課堂，再按「開啟同步投影」。');text('sessionContext','尚未選擇課堂');return;
  }
  if(!cfg){text('syncNotice','同步設定未能載入，請確認網路後重新整理。');return}
  function connect(){
   if(!window.supabase){text('syncNotice','同步元件未能載入，請確認網路後重新整理。');return}
   sb=window.supabase.createClient(cfg.url,cfg.key);
   sb.auth.onAuthStateChange(()=>{generation++;snapshot=null;inflight=false;lastSync=-Infinity;draw()});
   sync();
  }
  // The independent timer must remain usable even when the external SDK is unavailable.
  if(window.supabase)connect();else{
   const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';script.onload=connect;
   script.onerror=()=>text('syncNotice','同步元件未能載入，請確認網路後重新整理。');document.head.append(script);
  }
  setInterval(()=>{if(!document.hidden)sync()},4000);setInterval(draw,250);
 }
 return {requested,start};
})();
