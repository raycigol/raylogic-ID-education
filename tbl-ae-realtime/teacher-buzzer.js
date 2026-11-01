let buzzerNonce=0,buzzerLoading=false,buzzerTarget=null;
function clearTeacherBuzzer(){
 buzzerNonce++;buzzerTarget=null;
 $('buzzerStatus').textContent='選擇課堂後，按「重新整理」。';
 $('buzzerHistory').replaceChildren();$('buzzerHistory').dataset.signature='';$('buzzerTotals').replaceChildren();$('buzzerLog').replaceChildren();
 $('startBuzzer').disabled=true;$('closeBuzzer').disabled=true;
 $('toggleBuzzer').disabled=true;$('toggleBuzzer').textContent='開啟搶答功能';$('toggleBuzzer').setAttribute('aria-pressed','false');
}
async function teacherBuzzerAction(action,round=null,points=null,reason=null,expectedSession=teacherSession){
 if(actionBusy||!teacherSession||buzzerTarget!==teacherSession||expectedSession!==teacherSession)return;
 const target=teacherSession,name=teacherTitle;
 const question=action==='enable'?'開啟搶答功能？學生將先看到按鈕，等待你開啟新一輪。':action==='disable'?'關閉搶答功能並結束進行中的輪次？學生搶答區會隱藏，既有積分保留。':action==='start'?'開啟新一輪搶答？':action==='close'?'結束第 '+round.round_number+' 輪？':'第 '+round.round_number+' 輪：'+round.winner_name+' 設為 '+points+' 分？';
 if(!confirm('課堂：'+name+'\n'+question+'\n搶答積分與四階段成績分開。'))return;
 actionBusy=true;refreshNonce++;$('sessionSelect').disabled=true;buzzerNonce++;
 try{
  await rpc('tbl_teacher_buzzer',{p_session_id:target,p_action:action,p_round_id:round?.id||null,p_points:points,p_reason:reason,p_expected_points:round?.points??null});
  say(action==='score'?'已儲存「'+name+'」第 '+round.round_number+' 輪：'+round.winner_name+'，本輪 '+points+' 分。':'已更新「'+name+'」搶答。','good');
 }catch(error){say(errorText(error),'error')}
 finally{actionBusy=false;$('sessionSelect').disabled=false;await loadTeacherBuzzer()}
}
async function loadTeacherBuzzer(){
 if(actionBusy||buzzerLoading||!teacherSession)return;
 buzzerLoading=true;const target=teacherSession,nonce=++buzzerNonce,name=teacherTitle;
 try{
  const data=await rpc('tbl_buzzer_status',{p_session_id:target});
  if(nonce!==buzzerNonce||target!==teacherSession)return;
  buzzerTarget=target;
  const latest=data.rounds[0];
  const enabled=data.enabled===true;
  $('toggleBuzzer').disabled=false;$('toggleBuzzer').textContent=enabled?'關閉搶答功能':'開啟搶答功能';$('toggleBuzzer').setAttribute('aria-pressed',String(enabled));
  $('toggleBuzzer').onclick=()=>teacherBuzzerAction(enabled?'disable':'enable',null,null,null,target);
  $('buzzerStatus').textContent=name+'｜'+(!enabled?'搶答功能關閉（學生頁隱藏）':!latest||latest.state==='closed'?'搶答功能已開啟，學生可看到按鈕，等待開啟新一輪':('第 '+latest.round_number+' 輪｜'+(latest.winner_name?'回答權：'+latest.winner_name+'｜'+latest.points+' 分':'等待各組搶答')));
  $('startBuzzer').disabled=!enabled||latest?.state==='open';
  $('startBuzzer').onclick=()=>teacherBuzzerAction('start',null,null,null,target);
  $('closeBuzzer').disabled=!enabled||!latest||latest.state==='closed';
  $('closeBuzzer').onclick=()=>teacherBuzzerAction('close',latest,null,null,target);
  $('buzzerTotals').replaceChildren();
  for(const team of data.totals){const p=document.createElement('p');p.textContent=team.team_name+'：'+team.points+' 分';$('buzzerTotals').append(p)}
  // Preserve scoring input while polling; rebuild only when round data changes.
  const signature=JSON.stringify(data.rounds);
  if($('buzzerHistory').dataset.signature!==signature){
   $('buzzerHistory').dataset.signature=signature;$('buzzerHistory').replaceChildren();
   for(const round of data.rounds){
    const row=document.createElement('div');row.className='stage';
    const label=document.createElement('p');label.textContent='第 '+round.round_number+' 輪｜'+(round.winner_name||'無得主')+'｜'+round.points+' 分'+(round.state==='open'?'｜搶答中':'');row.append(label);
    if(round.winner_team_id){
     const input=document.createElement('input');input.type='number';input.min='0';input.max='100';input.step='1';input.value=String(round.points);input.setAttribute('aria-label','第 '+round.round_number+' 輪分數');
     const reason=document.createElement('input');reason.maxLength=500;reason.placeholder='原因（選填，留白記為教師判分）';reason.setAttribute('aria-label','第 '+round.round_number+' 輪判分原因（選填）');
     const save=document.createElement('button');save.textContent='設定分數';
     save.onclick=()=>{
      const points=Number(input.value),text=reason.value.trim()||'教師判分';
      if(!input.value.trim()||!Number.isInteger(points)||points<0||points>100||text.length>500){say('請填入 0–100 整數分數；原因可留白，最多 500 字。','error');return}
      teacherBuzzerAction('score',round,points,text,target);
     };row.append(input,reason,save);
    }
    $('buzzerHistory').append(row);
   }
  }
  $('buzzerLog').replaceChildren();
  for(const entry of data.score_log){const p=document.createElement('p');p.textContent='第 '+entry.round_number+' 輪｜'+entry.old_points+' → '+entry.new_points+' 分｜'+entry.reason+'｜'+new Date(entry.changed_at).toLocaleString('zh-TW');$('buzzerLog').append(p)}
 }catch(error){if(nonce===buzzerNonce&&target===teacherSession){clearTeacherBuzzer();$('buzzerStatus').textContent='無法載入搶答：'+errorText(error)}}
 finally{buzzerLoading=false}
}
$('refreshBuzzer').onclick=()=>loadTeacherBuzzer();
$('tab-buzzer').addEventListener('click',()=>loadTeacherBuzzer());
setInterval(()=>{if(!document.hidden&&!$('panel-buzzer').hidden)loadTeacherBuzzer()},1000);
