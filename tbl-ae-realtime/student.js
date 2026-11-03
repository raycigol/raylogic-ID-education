let mySession=null,refreshing=false,studentBusy=false,studentNonce=0;
let scannedCode=prefilledJoinCode();
if(scannedCode){
 $('joinCode').value=scannedCode;
 window.history.replaceState(null,'',window.location.pathname+window.location.search);
}
function clearStudent(){
 if(typeof clearStudentBuzzer==='function')clearStudentBuzzer();
 mySession=null;$('work').classList.add('hide');$('join').classList.remove('hide');
 $('stageList').replaceChildren();$('teamName').textContent='';
}
async function ensureAuth(){
 const {data,error}=await sb.auth.getUser();
 if(error&&error.name!=='AuthSessionMissingError')throw error;
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
  if(!rows?.length){const hadMembership=mySession||sessionStorage.getItem(STUDENT_SESSION_KEY);clearStudent();if(hadMembership)say('目前代表綁定已解除，請先向教師確認，再重新加入正確組別。','error');return}
  const preferred=sessionStorage.getItem(STUDENT_SESSION_KEY);
  const current=preferred?rows.find(row=>row.session_id===preferred):rows[0];
  if(!current){clearStudent();say('找不到目前選擇的課堂，請離開組別並重新加入。','error');return}
  const roster=await rpc('tbl_session_roster',{p_session_id:current.session_id});
  if(nonce!==studentNonce)return;
  const participating=roster.teams.some(t=>t.team_number===current.team_number&&t.active);
  let publishedScores=[],scoreLoadFailed=false;
  if(rows.some(row=>row.session_id===current.session_id&&row.is_revealed)){
   try{publishedScores=await rpc('tbl_published_scores',{p_session_id:current.session_id})||[]}
   catch(error){scoreLoadFailed=true}
   if(nonce!==studentNonce)return;
  }
  mySession=current.session_id;
  const session=mySession,name=current.team_name,title=sessionStorage.getItem(STUDENT_TITLE_KEY)||'';
  $('join').classList.add('hide');$('work').classList.remove('hide');$('teamName').textContent=(title?title+'｜':'')+name;
  if(typeof loadStudentBuzzer==='function')loadStudentBuzzer();
  const area=$('stageList');area.replaceChildren();
  for(const stage of rows.filter(row=>row.session_id===session)){
   const box=document.createElement('div');box.className='stage';
   const title=document.createElement('strong');title.textContent='Stage '+stage.stage_number+'｜'+(stage.is_revealed?'已公布':stage.is_locked?'已鎖定':stage.is_open?'可作答':'尚未開放');box.append(title);
   const submitted=stage.my_answer?'本組已提交：'+stage.my_answer:'本組尚未提交';
   const detail=document.createElement('div');detail.textContent=submitted+(stage.my_answer?(stage.is_open?'｜鎖定前可修改':'｜目前未開放，答案已保留'):'');
   if(stage.is_locked)detail.textContent=submitted+'｜本階段已鎖定，不能修改';
   if(stage.is_revealed){
    const result=publishedScores.find(row=>row.team_number===stage.team_number&&row.stage_number===stage.stage_number);
    const score=result?.score;
    detail.textContent=submitted+'｜'+(scoreLoadFailed?'得分暫時無法載入，稍後自動重試':score!==null&&score!==undefined&&Number.isFinite(Number(score))?'本階段得分：'+Number(score)+' 分':'本階段尚無得分紀錄');
   }else detail.textContent+='｜得分：待教師公布';
   box.append(detail);
   if(participating&&stage.is_open&&!stage.is_locked&&!stage.is_revealed){
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
  if(!participating){say('本組未列入這堂課的參與名單，請聯絡教師。原身份與答案保留。','error');return}
  say('已加入 '+name+'。'+(scannedCode?'掃碼不會自動切換組別；如要改組，請先離開組別。':'請先確認組別，錯誤時按「離開組別／重新加入」。'),'good');
 }catch(error){say(errorText(error),'error')}finally{refreshing=false}
}
$('joinBtn').onclick=async()=>{
 if(studentBusy)return;
 const code=normalizeJoinCode($('joinCode').value);
 if(!validJoinCode(code)){say('請輸入 6 碼加入碼或完整 UUID 代碼。','error');return}
 studentBusy=true;$('joinBtn').disabled=true;
 try{
  await ensureAuth();
  const result=await rpc('tbl_join_with_code',{p_code:code});
  if(!result?.ok)throw new Error(result?.message||'加入失敗，請確認代碼。');
  sessionStorage.setItem(STUDENT_SESSION_KEY,result.session_id);sessionStorage.setItem(STUDENT_TITLE_KEY,result.title);
  scannedCode='';studentNonce++;clearStudent();say('已加入「'+result.title+'」'+result.team_name+'，請確認組別。','good');
 }
 catch(error){say(errorText(error),'error')}
 finally{studentBusy=false;$('joinBtn').disabled=false;loadStudent()}
};
$('leaveBtn').onclick=async()=>{
 if(studentBusy)return;
 const {data,error}=await sb.auth.getUser();
 if(error&&error.name!=='AuthSessionMissingError'){say(errorText(error),'error');return}
 if(data.user&&!data.user.is_anonymous){say('目前是教師登入，請用另一個瀏覽器或私密模式開啟學生頁。','error');return}
 if(!confirm('離開目前組別並重新輸入代碼？\n只登出本機；不會刪除或撤回任何組別已提交的答案。\n若曾替錯誤組別提交答案，請通知教師。'))return;
 studentBusy=true;$('leaveBtn').disabled=true;studentNonce++;clearStudent();
 try{
  const {error:signOutError}=await sb.auth.signOut({scope:'local'});
  if(signOutError)throw signOutError;
  $('joinCode').value='';say('已離開，請輸入正確組別代碼。原組答案保留。','good');
  sessionStorage.removeItem(STUDENT_SESSION_KEY);sessionStorage.removeItem(STUDENT_TITLE_KEY);scannedCode='';
 }catch(error){say(errorText(error),'error')}
 finally{studentBusy=false;$('leaveBtn').disabled=false}
};
loadStudent();setInterval(()=>{if(!document.hidden)loadStudent()},4000);
