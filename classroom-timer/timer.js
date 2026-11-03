(()=>{
 'use strict';
 if(window.ClassroomProjection?.requested){window.ClassroomProjection.start();return}
 const $=id=>document.getElementById(id),{Timer,format,validSeconds}=ClassroomTimer;
 const KEY='raylogic-classroom-timer-v1',labels={irat:['iRAT','個人作答','個人思考，獨立作答。'],trat:['tRAT','小組作答','小組討論，一起作答。']};
 const aePlan=[[6,1,5],[7,1,5],[8,1,6],[7,1,7]],aeParts=['小組討論','提交答案','組間討論與教師回饋'];
 let timer=new Timer(900),stage='irat',mode='countdown',audio=null,aeStage=0,aePart=0;
 try{
  const saved=JSON.parse(sessionStorage.getItem(KEY)||'null'),restored=Timer.restore(saved?.timer,Date.now());
  if(restored){timer=restored;stage=['irat','trat','ae'].includes(saved.stage)?saved.stage:'irat';aeStage=Number.isInteger(saved.aeStage)&&saved.aeStage>=0&&saved.aeStage<4?saved.aeStage:0;aePart=Number.isInteger(saved.aePart)&&saved.aePart>=0&&saved.aePart<3?saved.aePart:0;mode=saved.mode==='clock'?'clock':'countdown';$('sound').checked=saved.sound===true}
 }catch{}
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 const date=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'long',day:'numeric',weekday:'long'});
 function text(id,value){if($(id).textContent!==value)$(id).textContent=value}
 function feedback(message,error=false){text('feedback',message);$('feedback').classList.toggle('error',error)}
 function persist(){try{sessionStorage.setItem(KEY,JSON.stringify({timer:timer.snapshot(),stage,aeStage,aePart,mode,sound:$('sound').checked}))}catch{feedback('瀏覽器無法保存進度，請保持此分頁開啟。')}}
 function currentLabel(){return stage==='ae'?['AE · Stage '+(aeStage+1),aeParts[aePart],['組內形成共識，準備說明選擇的理由。','請各組完成提交，等待教師確認。','比較不同組的理由，再由教師收束重點。'][aePart]]:labels[stage]}
 async function prepareAudio(){
  if(!$('sound').checked)return;
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error();audio=audio||new Audio();if(audio.state==='suspended')await audio.resume()}catch{feedback('此瀏覽器無法播放提示音，時間到仍會顯示文字。')}
 }
 function ring(){
  if(!$('sound').checked||!audio||audio.state!=='running')return;
  try{for(let i=0;i<3;i++){const oscillator=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+i*.35;oscillator.type='sine';oscillator.frequency.value=880;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.16,at+.025);gain.gain.exponentialRampToValueAtTime(.001,at+.24);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+.25)}}catch{}
 }
 function render(){
  const now=Date.now();if(timer.tick(now)){persist();ring()}
  const remaining=timer.remaining(now),isClock=mode==='clock',finished=timer.phase==='finished',warning=!finished&&remaining<=60&&timer.phase!=='ready';
  document.body.classList.toggle('clock',isClock);document.body.classList.toggle('finished',finished&&!isClock);document.body.classList.toggle('warning',warning&&!isClock);
  text('smallClock',clock.format(now));$('smallClock').dateTime=new Date(now).toISOString();
  text('digits',isClock?clock.format(now):format(remaining));$('digits').setAttribute('aria-label',isClock?'台北現在時間':'剩餘 '+format(remaining));
  text('status',isClock?(finished?'時間到 · 倒數已結束':date.format(now)):({ready:'準備開始',running:remaining<=60?'最後 1 分鐘':stage==='ae'?aeParts[aePart]+'中':'作答進行中',paused:'計時已暫停',finished:'時間到'})[timer.phase]);
  const finishHint=stage==='ae'?(aeStage===3&&aePart===2?'AE 四階段已完成，請教師收束重點。':'本段時間到，由教師確認後切換下一段。'):'請停止作答，等待教師指示';
  text('timeHint',isClock?(timer.phase==='running'?'倒數持續中 · 剩餘 '+format(remaining):'台北時間 · 24 小時制'):finished?finishHint:timer.phase==='running'?'專注眼前的任務，掌握討論節奏':timer.phase==='paused'?'按下繼續計時，即可接續':'準備好後，按下開始計時');
  text('startPause',timer.phase==='running'?'暫停計時':timer.phase==='finished'?'重新開始':timer.phase==='paused'?'繼續計時':'開始計時');
  const proportion=Math.max(0,Math.min(100,remaining/timer.duration*100));$('progress').style.width=proportion+'%';$('progressTrack').setAttribute('aria-valuenow',String(Math.round(proportion)));
  $('timerControls').hidden=isClock;$('progressTrack').hidden=isClock;
  $('nextSegment').hidden=stage!=='ae'||isClock;
  $('countdownMode').setAttribute('aria-pressed',String(!isClock));$('clockMode').setAttribute('aria-pressed',String(isClock));
 }
 function updateSettings(){
  const label=currentLabel();$('phaseTitle').replaceChildren(document.createTextNode(label[0]+' '));const subtitle=document.createElement('span');subtitle.textContent=label[1];$('phaseTitle').append(subtitle);
  text('displayNote',label[2]);for(const name of ['irat','trat','ae'])$(name).setAttribute('aria-pressed',String(stage===name));
  $('aeSettings').hidden=stage!=='ae';
  for(let s=0;s<4;s++)$('aeStage'+s).setAttribute('aria-pressed',String(aeStage===s));
  for(let p=0;p<3;p++){$('aePart'+p).setAttribute('aria-pressed',String(aePart===p));text('aePart'+p,aeParts[p]+' · '+aePlan[aeStage][p]+' 分')}
  text('aeStageSummary','Stage '+(aeStage+1)+' 建議 '+aePlan[aeStage].reduce((sum,n)=>sum+n,0)+' 分鐘：討論 '+aePlan[aeStage][0]+'／提交 '+aePlan[aeStage][1]+'／回饋 '+aePlan[aeStage][2]);
  const last=aeStage===3&&aePart===2,nextPart=(aePart+1)%3,nextStage=aePart===2?aeStage+1:aeStage;
  $('nextSegment').disabled=last;
  text('nextSegment',last?'已是最後一段':'下一段：'+(aePart===2?'Stage '+(nextStage+1)+' ':'')+aeParts[nextPart]);
  $('minutes').value=String(Math.floor(timer.duration/60));$('seconds').value=String(timer.duration%60);
 }
 function approveReset(){return !['running','paused'].includes(timer.phase)||confirm('目前有尚未結束的倒數，確定重設這一階段的時間？')}
 function setDuration(seconds,newStage=stage,newAeStage=aeStage,newAePart=aePart){if(!validSeconds(seconds)){feedback('請設定 1 秒以上的時間，分鐘為 0–5999，秒為 0–59。',true);return}if(!approveReset())return;timer.setDuration(seconds);stage=newStage;aeStage=newAeStage;aePart=newAePart;mode='countdown';updateSettings();feedback('已設定 '+currentLabel()[0]+' · '+currentLabel()[1]+' · '+format(seconds));persist();render()}
 function startPause(){
  if(timer.phase==='running')timer.pause(Date.now());
  else{if(timer.phase==='finished')timer.reset();prepareAudio();timer.start(Date.now())}
  feedback('');persist();render();
 }
 $('startPause').onclick=startPause;
 $('reset').onclick=()=>{if(!approveReset())return;timer.reset();feedback('已重設，尚未開始計時。');persist();render()};
 $('irat').onclick=()=>setDuration(900,'irat');$('trat').onclick=()=>setDuration(1200,'trat');
 $('ae').onclick=()=>setDuration(aePlan[0][0]*60,'ae',0,0);
 for(let s=0;s<4;s++)$('aeStage'+s).onclick=()=>setDuration(aePlan[s][0]*60,'ae',s,0);
 for(let p=0;p<3;p++)$('aePart'+p).onclick=()=>setDuration(aePlan[aeStage][p]*60,'ae',aeStage,p);
 $('nextSegment').onclick=()=>{if(stage!=='ae'||(aeStage===3&&aePart===2))return;const p=(aePart+1)%3,s=aePart===2?aeStage+1:aeStage;setDuration(aePlan[s][p]*60,'ae',s,p)};
 $('durationForm').onsubmit=event=>{
  event.preventDefault();const mins=$('minutes').value.trim(),secs=$('seconds').value.trim(),m=Number(mins),s=Number(secs);
  if(!mins||!secs||!Number.isInteger(m)||!Number.isInteger(s)||m<0||m>5999||s<0||s>59){feedback('請填整數：分鐘 0–5999，秒 0–59。',true);return}
  setDuration(m*60+s);
 };
 for(const [id,change] of [['minusMinute',-60],['plusMinute',60]])$(id).onclick=()=>{const wasFinished=timer.phase==='finished';timer.shift(change,Date.now());if(!wasFinished&&timer.phase==='finished')ring();feedback(change>0?'剩餘時間增加 1 分鐘。':'剩餘時間減少 1 分鐘。');persist();render()};
 for(const [id,value] of [['countdownMode','countdown'],['clockMode','clock']])$(id).onclick=()=>{mode=value;persist();render()};
 function projection(value){document.body.classList.toggle('projection',value);$('projection').setAttribute('aria-pressed',String(value));text('projection',value?'顯示設定':'專注投影')}
 $('projection').onclick=()=>projection(!document.body.classList.contains('projection'));
 $('fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else{if(!document.documentElement.requestFullscreen)throw Error();await document.documentElement.requestFullscreen();projection(true)}}catch{feedback('目前瀏覽器無法切換全螢幕，仍可使用「專注投影」。')}
 };
 document.addEventListener('fullscreenchange',()=>{text('fullscreen',document.fullscreenElement?'退出全螢幕 ↙':'全螢幕 ↗');$('fullscreen').setAttribute('aria-pressed',String(!!document.fullscreenElement))});
 $('sound').onchange=()=>{prepareAudio();persist()};
 document.addEventListener('keydown',event=>{
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||event.target?.closest('input,textarea,select,button,summary,a'))return;
  if(event.code==='Space'){event.preventDefault();if(mode==='countdown')startPause()}
  else if(event.key.toLowerCase()==='r')$('reset').click();
  else if(event.key.toLowerCase()==='f')$('fullscreen').click();
  else if(event.key==='Escape'&&!document.fullscreenElement)projection(false);
 });
 document.addEventListener('visibilitychange',render);window.addEventListener('pageshow',render);
 updateSettings();render();setInterval(render,200);
})();

