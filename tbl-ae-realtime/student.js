let mySession=null,refreshing=false,studentBusy=false,studentNonce=0;
function clearStudent(){
 mySession=null;$('work').classList.add('hide');$('join').classList.remove('hide');
 $('stageList').replaceChildren();$('teamName').textContent='';
}
async function ensureAuth(){
 const {data,error}=await sb.auth.getUser();if(error)throw error;
 if(data.user){
  if(!data.user.is_anonymous)throw new Error('目前是教師登入，請用另一個瀏覽器或私密模式開啟學生頁。');
  return data.user;
 }
 const {data:created,error:createdError}=await sb.auth.signInAnonymously();
 if(createdError)throw createdError;return created.user;
}
async function loadStudent(){
 if(refreshing||studentBusy)return;
 refreshing=true;const nonce=studentNonce;
 try{
  const {data:user}=await sb.auth.getUser();
  if(nonce!==studentNonce)return;
  if(!user.user||!user.user.is_anonymous){clearStudent();return}
  const rows=await rpc('tbl_student_status',{});
  if(nonce!==studentNonce)return;
  if(!rows?.length){clearStudent();return}
  mySession=rows[0].session_id;
  const session=mySession,name=rows[0].team_name;
  $('join').classList.add('hide');$('work').classList.remove('hide');$('teamName').textContent=name;
  const area=$('stageList');area.replaceChildren();
  for(const stage of rows.filter(row=>row.session_id===session)){
   const box=document.createElement('div');box.className='stage';
   const title=document.createElement('strong');title.textContent='Stage '+stage.stage_number+'｜'+(stage.is_revealed?'已公布':stage.is_locked?'已鎖定':stage.is_open?'可作答':'尚未開放');box.append(title);
   const detail=document.createElement('div');detail.textContent=stage.my_answer?'已提交（可在鎖定前修改）':'尚未提交';
   if(stage.is_locked)detail.textContent='本階段已鎖定';
   if(stage.is_revealed)detail.textContent='本階段分數已公布，可到成績頁查看';box.append(detail);
   if(stage.is_open&&!stage.is_locked&&!stage.is_revealed){
    const choices=document.createElement('div');choices.className='choices';let selected=stage.my_answer||null;
    for(const answer of 'ABCDE'){
     const button=document.createElement('button');button.textContent=answer;
     if(answer===selected)button.classList.add('on');
     button.onclick=()=>{selected=answer;choices.querySelectorAll('button').forEach(node=>node.classList.toggle('on',node.textContent===answer))};choices.append(button);
    }
    const send=document.createElement('button');send.textContent=stage.my_answer?'更新答案':'確認提交';
    send.onclick=async()=>{
     if(studentBusy||nonce!==studentNonce||mySession!==session)return;
     if(!selected){say('請先選擇 A–E','error');return}
     if(!confirm('目前組別：'+name+'\nStage '+stage.stage_number+'：提交 '+selected+'？\n若組別錯誤，請取消並按「離開組別／重新加入」。'))return;
     studentBusy=true;send.disabled=true;
     try{await rpc('tbl_submit_answer',{p_session_id:session,p_stage:stage.stage_number,p_answer:selected});say('Stage '+stage.stage_number+' 已成功提交','good')}
     catch(error){say(errorText(error),'error')}
     finally{studentBusy=false;send.disabled=false;loadStudent()}
    };
    const controls=document.createElement('div');controls.append(choices,send);box.append(controls);
   }
   area.append(box);
  }
  say('已加入 '+name+'。請先確認組別，錯誤時按「離開組別／重新加入」。','good');
 }catch(error){say(errorText(error),'error')}finally{refreshing=false}
}
$('joinBtn').onclick=async()=>{
 if(studentBusy)return;
 const code=$('joinCode').value.trim();
 if(!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(code)){say('請輸入完整 UUID 組別代碼','error');return}
 studentBusy=true;$('joinBtn').disabled=true;
 try{await ensureAuth();await rpc('tbl_join_team',{p_join_code:code});studentNonce++;clearStudent();say('加入成功，請確認組別名稱。','good')}
 catch(error){say(errorText(error),'error')}
 finally{studentBusy=false;$('joinBtn').disabled=false;loadStudent()}
};
$('leaveBtn').onclick=async()=>{
 if(studentBusy)return;
 const {data,error}=await sb.auth.getUser();
 if(error){say(errorText(error),'error');return}
 if(data.user&&!data.user.is_anonymous){say('目前是教師登入，請用另一個瀏覽器或私密模式開啟學生頁。','error');return}
 if(!confirm('離開目前組別並重新輸入代碼？\n只登出本機；不會刪除或撤回任何組別已提交的答案。\n若曾替錯誤組別提交答案，請通知教師。'))return;
 studentBusy=true;$('leaveBtn').disabled=true;studentNonce++;clearStudent();
 try{
  const {error:signOutError}=await sb.auth.signOut({scope:'local'});
  if(signOutError)throw signOutError;
  $('joinCode').value='';say('已離開，請輸入正確組別代碼。原組答案保留。','good');
 }catch(error){say(errorText(error),'error')}
 finally{studentBusy=false;$('leaveBtn').disabled=false}
};
loadStudent();setInterval(()=>{if(!document.hidden)loadStudent()},4000);

