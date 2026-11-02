function clearJoinCodes(){
 $('joinCodes').replaceChildren();$('joinCodesName').textContent='';
}
async function loadJoinCodes(rotateTeam=null){
 if(actionBusy||!teacherSession)return;
 const target=teacherSession,name=teacherTitle;
 actionBusy=true;refreshNonce++;$('sessionSelect').disabled=true;$('loadJoinCodes').disabled=true;
 try{
  const roster=await rpc('tbl_session_roster',{p_session_id:target});
  const active=new Set(roster.teams.filter(t=>t.active).map(t=>t.team_id));
  const records=await rpc('tbl_teacher_join_codes',{p_session_id:target,p_rotate_team:rotateTeam});
  if(teacherSession!==target)return;
  clearJoinCodes();$('joinCodesName').textContent=name+'｜組別加入碼（請只將對應組別代碼提供給該組）';
  for(const record of records||[]){
   if(!active.has(record.team_id))continue;
   const card=document.createElement('div');card.className='card';
   const title=document.createElement('h3');title.textContent=record.team_name;
   const code=document.createElement('strong');code.textContent=record.short_code;code.style.fontSize='1.6rem';code.style.letterSpacing='0.12em';
   const link=document.createElement('a');link.href=studentJoinLink(record.short_code);link.textContent='開啟學生加入頁';link.target='_blank';link.rel='noopener noreferrer';
   const paragraph=document.createElement('p');paragraph.append(link);card.append(title,code,paragraph);
   if(typeof qrcode==='function'){
    const qr=qrcode(0,'M');qr.addData(link.href);qr.make();
    const picture=document.createElement('img');picture.src=qr.createDataURL(4,16);picture.alt=name+' '+record.team_name+' 加入 QR Code';
    picture.style.width='100%';picture.style.maxWidth='220px';picture.style.height='auto';card.append(picture);
   }
   const rotate=document.createElement('button');rotate.className='secondary';rotate.textContent='更新此組短碼';
   rotate.onclick=()=>{
    if(actionBusy||teacherSession!==target)return;
    if(!confirm('課堂：'+name+'\n組別：'+record.team_name+'\n更新後舊短碼與 QR Code 不能再加入；已加入學生、答案及 UUID 代碼均保留。\n確定更新？'))return;
    loadJoinCodes(record.team_id);
   };
   card.append(rotate);$('joinCodes').append(card);
  }
  if(typeof qrcode!=='function')say('短碼已載入，QR Code 程式未載入，請重新整理。','error');
 }catch(error){if(teacherSession===target){clearJoinCodes();say(errorText(error),'error')}}
 finally{actionBusy=false;$('sessionSelect').disabled=false;$('loadJoinCodes').disabled=false;await loadTeacher()}
}
$('loadJoinCodes').onclick=()=>loadJoinCodes();

