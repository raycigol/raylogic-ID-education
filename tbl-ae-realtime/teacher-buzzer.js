let buzzerNonce=0,buzzerLoading=false,buzzerTarget=null;
function clearTeacherBuzzer(){
 buzzerNonce++;buzzerTarget=null;
 $('buzzerStatus').textContent='選擇課堂後，按「重新整理」。';
 $('buzzerHistory').replaceChildren();$('buzzerHistory').dataset.signature='';$('buzzerTotals').replaceChildren();$('buzzerLog').replaceChildren();
 $('startBuzzer').disabled=true;$('closeBuzzer').disabled=true;
}
async function teacherBuzzerAction(action,round=null,points=null,reason=null,expectedSession=teacherSession){
 if(actionBusy||!teacherSession||buzzerTarget!==teacherSession||expectedSession!==teacherSession)return;
 const target=teacherSession,name=teacherTitle;
 if(!confirm('課堂：'+name+'\n'+(action==='start'?'開啟新一輪搶答？':action==='close'?'結束第 '+round.round_number+' 輪？':'第 '+round.round_number+' 輪：'+round.winner_name+' 設為 '+points+' 分？')+'\n搶答積分與四階段成績分開。'))return;
 actionBusy=true;refreshNonce++;$('sessionSelect').disabled=true;buzzerNonce++;
 try{
  await rpc('tbl_teacher_buzzer',{p_session_id:target,p_action:action,p_round_id:round?.id||null,p_points:points,p_reason:reason,p_expected_points:round?.points??null});
  say('已更新「'+name+'」搶答。','good');
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
  $('buzzerStatus').textContent=name+'｜'+(!latest?'尚未開啟搶答':('第 '+latest.round_number+' 輪｜'+(latest.winner_name?'回答權：'+latest.winner_name+'｜'+latest.points+' 分':latest.state==='open'?'等待各組搶答':'已結束，無組別搶得')));
  $('startBuzzer').disabled=latest?.state==='open';
  $('startBuzzer').onclick=()=>teacherBuzzerAction('start',null,null,null,target);
  $('closeBuzzer').disabled=!latest||latest.state==='closed';
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
     const reason=document.createElement('input');reason.maxLength=500;reason.placeholder='判分／更正原因';reason.setAttribute('aria-label','第 '+round.round_number+' 輪判分原因');
     const save=document.createElement('button');save.textContent='設定分數';
     save.onclick=()=>{
      const points=Number(input.value),text=reason.value.trim();
      if(!input.value.trim()||!Number.isInteger(points)||points<0||points>100||!text||text.length>500){say('請填入 0–100 整數分數及判分原因。','error');return}
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
