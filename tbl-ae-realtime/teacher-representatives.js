let representativesNonce=0;
function clearRepresentatives(){
 representativesNonce++;$('representatives').replaceChildren();$('representativesName').textContent='';$('clearMembers').checked=false;$('loadRepresentatives').disabled=false;
}
async function loadRepresentatives(){
 if(actionBusy||!teacherSession)return;
 const target=teacherSession,name=teacherTitle,nonce=++representativesNonce;
 $('loadRepresentatives').disabled=true;
 try{
  const records=await rpc('tbl_teacher_representatives',{p_session_id:target});
  if(target!==teacherSession||nonce!==representativesNonce)return;
  $('representatives').replaceChildren();$('representativesName').textContent=name+'｜代表綁定狀態（不代表目前在線）';
  for(const record of records||[]){
   const row=document.createElement('div');row.className='stage';
   const status=document.createElement('div');status.textContent=record.team_name+'｜'+(record.member_ids.length?'已綁定 '+record.member_ids.length+' 位代表':'尚無代表')+'｜已提交：'+(record.submitted_stages.length?record.submitted_stages.map(stage=>'S'+stage).join('、'):'無');
   row.append(status);
   for(const rotate of [false,true]){
    const button=document.createElement('button');button.className='secondary';button.textContent=rotate?'解除並更新短碼':'解除代表綁定';button.disabled=!record.member_ids.length;
    button.onclick=async()=>{
     if(actionBusy||target!==teacherSession||nonce!==representativesNonce)return;
     if(!confirm('課堂：'+name+'\n組別：'+record.team_name+'\n解除代表綁定，保留答案與分數。'+(rotate?'\n同時更新短碼／QR Code；原 UUID 仍有效。':'\n加入碼仍有效，持碼者可重新加入。')+'\n確定執行？'))return;
     actionBusy=true;refreshNonce++;representativesNonce++;$('sessionSelect').disabled=true;
     try{
      await rpc('tbl_teacher_release_representative',{p_session_id:target,p_team_id:record.team_id,p_confirm_title:name,p_expected_members:record.member_ids,p_rotate_code:rotate});
      if(rotate)clearJoinCodes();
      say('已解除「'+name+'」'+record.team_name+'代表，答案與分數保留。'+(rotate?'請重新查看並提供新短碼。':''),'good');
     }catch(error){say(errorText(error),'error')}
     finally{actionBusy=false;$('sessionSelect').disabled=false;await loadTeacher();await loadRepresentatives()}
    };
    row.append(button);
   }
   $('representatives').append(row);
  }
 }catch(error){if(target===teacherSession&&nonce===representativesNonce){$('representatives').replaceChildren();say(errorText(error),'error')}}
 finally{if(nonce===representativesNonce)$('loadRepresentatives').disabled=false}
}
$('loadRepresentatives').onclick=()=>loadRepresentatives();
setInterval(()=>{
 if(!document.hidden&&!$('panel-members').hidden&&!$('loadRepresentatives').disabled&&!actionBusy)loadRepresentatives();
},4000);

