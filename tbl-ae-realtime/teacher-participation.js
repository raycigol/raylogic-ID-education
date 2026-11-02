let participationView=null,participationEditing=false;
function clearParticipation(){participationView=null;participationEditing=false;$('participation').replaceChildren()}
function renderParticipation(roster,session,title){
 participationView={roster,session,title};
 if(participationEditing)return;
 const area=$('participation');area.replaceChildren();
 const summary=document.createElement('p');summary.textContent='已儲存：'+roster.target_count+' 組參與，共 '+roster.teams.length+' 組。'+(roster.frozen?'已有鎖定／公布，名單不可更改。':'');area.append(summary);
}
$('editParticipation').onclick=async()=>{
 if(actionBusy||!teacherSession)return;
 const target=teacherSession,title=teacherTitle;actionBusy=true;refreshNonce++;$('sessionSelect').disabled=true;
 try{
  const roster=await rpc('tbl_session_roster',{p_session_id:target});
  if(teacherSession!==target)return;
  participationEditing=true;const area=$('participation');area.replaceChildren();
  const choices=[];
  const count=document.createElement('p');area.append(count);
  const save=document.createElement('button');save.textContent='儲存參與組別';
  const update=()=>{const n=choices.filter(x=>x.input.checked).length;count.textContent='選取 '+n+' / '+roster.teams.length+' 組（尚未儲存）';save.disabled=roster.frozen||n===0};
  for(const team of roster.teams){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=team.active;input.disabled=roster.frozen;input.onchange=update;label.append(input,document.createTextNode(team.team_name));label.style.display='inline-block';label.style.margin='0.5rem';area.append(label);choices.push({team,input})}
  save.onclick=async()=>{
   if(actionBusy||teacherSession!==target)return;
   const selected=choices.filter(x=>x.input.checked).map(x=>x.team),excluded=choices.filter(x=>!x.input.checked).map(x=>x.team.team_name);
   if(!selected.length||!confirm('課堂：'+title+'\n參與 '+selected.length+' 組\n不參與：'+(excluded.join('、')||'無')+'\n已有答案的組別不可停用。確定儲存？'))return;
   actionBusy=true;refreshNonce++;$('sessionSelect').disabled=true;save.disabled=true;
   try{await rpc('tbl_teacher_set_participation',{p_session_id:target,p_team_ids:selected.map(t=>t.team_id),p_expected_revision:roster.revision,p_confirm_title:title});clearParticipation();clearJoinCodes();say('已儲存「'+title+'」'+selected.length+' 組參與名單。','good')}
   catch(e){say(errorText(e)+'；請按「載入／重新編輯名單」後重試。','error')}
   finally{actionBusy=false;$('sessionSelect').disabled=false;await loadTeacher()}
  };
  const cancel=document.createElement('button');cancel.textContent='取消編輯';cancel.className='secondary';cancel.onclick=()=>{clearParticipation();loadTeacher()};area.append(document.createElement('br'),save,cancel);update();
 }catch(e){clearParticipation();say(errorText(e),'error')}
 finally{actionBusy=false;$('sessionSelect').disabled=false;await loadTeacher()}
};
