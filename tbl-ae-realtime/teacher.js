let teacherSession=null,teacherTitle='',busy=false,actionBusy=false,refreshNonce=0,pendingRefresh=false;
const SESSION_KEY='tbl-ae-realtime-teacher-session';
const TEST_SESSION_ID='0f82561e-c980-44cb-8a5d-091dbc9c71e6';
const isTestSession=(session,title)=>session===TEST_SESSION_ID&&title==='2026 ID Block TBL — TEST';
async function loadTeacher(){
 if(busy||actionBusy){pendingRefresh=true;return}
 if(document.activeElement===$('sessionSelect'))return;
 busy=true;
 const nonce=refreshNonce;
 try{
  const {data:u}=await sb.auth.getUser();
  if(nonce!==refreshNonce)return;
  if(!u.user||u.user.is_anonymous){$('control').classList.add('hide');$('scores').classList.add('hide');return}
  const {data:ss,error:se}=await sb.from('tbl_sessions').select('id,title,created_at').order('created_at',{ascending:true});
  if(nonce!==refreshNonce)return;
  if(se)throw se;
  if(!ss?.length){say('沒有找到屬於這個帳號的課堂。','error');$('control').classList.add('hide');$('scores').classList.add('hide');return}
  const selector=$('sessionSelect');
  const preferred=teacherSession||sessionStorage.getItem(SESSION_KEY);
  const selected=ss.find(x=>x.id===preferred)||(!preferred&&(ss.find(x=>x.title==='2026 ID Block TBL — TEST')||ss[0]));
  if(!selected){$('stages').replaceChildren();$('scoreRows').replaceChildren();throw new Error('目前課堂已不存在或無讀取權限，請重新登入並確認課堂權限。')}
  if(teacherSession!==selected.id){clearJoinCodes();clearRepresentatives();clearAnswerReview()}
  teacherSession=selected.id;teacherTitle=selected.title;
  const options=ss.map(s=>({value:s.id,text:s.title+(s.title.includes('TEST')?'（測試）':'（正式）')}));
  if(selector.options.length!==options.length||options.some((item,index)=>selector.options[index].value!==item.value||selector.options[index].textContent!==item.text)){
   selector.replaceChildren();
   for(const item of options){const option=document.createElement('option');option.value=item.value;option.textContent=item.text;selector.append(option)}
  }
  selector.value=teacherSession;
  sessionStorage.setItem(SESSION_KEY,teacherSession);
  const name=teacherTitle;
  $('sessionName').textContent='目前操作：'+teacherTitle;
  $('control').classList.remove('hide');$('scores').classList.remove('hide');
  const target=teacherSession;
  $('resetSession').onclick=async()=>{
   if(actionBusy||nonce!==refreshNonce||teacherSession!==target)return;
   const clearMembers=$('clearMembers').checked===true;
   const memberNotice=clearMembers?'同時解除本課堂全部代表，組別與加入碼保留。':'組別、加入代碼與學生綁定保留。';
   const confirmation=prompt('重置課堂：'+name+'\n將永久清除本課堂所有答案與分數，四階段回到未開放。\n'+memberNotice+'\n請先另存需要保留的成績，再輸入完整課堂名稱確認：');
   if(confirmation===null)return;
   if(confirmation!==name){say('課堂名稱不符，未執行重置。','error');return}
   if(!confirm('最後確認：永久清除「'+name+'」的答案與分數？\n'+memberNotice+'\n只處理此課堂，無法從頁面復原。'))return;
   actionBusy=true;refreshNonce++;$('sessionSelect').disabled=true;$('resetSession').disabled=true;
   $('stages').replaceChildren();$('scoreRows').replaceChildren();
   try{await rpc('tbl_teacher_reset_with_members',{p_session_id:target,p_confirm_title:confirmation,p_clear_members:clearMembers});clearRepresentatives();clearAnswerReview();say('已重置「'+name+'」，答案與分數已清除。'+memberNotice+'請重新開放 Stage 1。','good')}
   catch(error){say(errorText(error),'error')}
   finally{actionBusy=false;$('sessionSelect').disabled=false;$('resetSession').disabled=false;await loadTeacher()}
  };
  const [{data:st,error:ee},{data:sub,error:es}]=await Promise.all([
   sb.from('tbl_stages').select('stage_number,is_open,is_locked,is_revealed').eq('session_id',target).order('stage_number'),
   sb.from('tbl_submissions').select('stage_number,team_id').eq('session_id',target)
  ]);
  if(nonce!==refreshNonce||teacherSession!==target)return;
  if(ee)throw ee;if(es)throw es;
  const area=$('stages');area.replaceChildren();
  for(const s of st||[]){
   const count=(sub||[]).filter(x=>x.stage_number===s.stage_number).length;
   const row=document.createElement('div');row.className='stage';
   const label=document.createElement('div');label.textContent='Stage '+s.stage_number+'｜'+count+'/13 已提交｜'+(s.is_revealed?'已公布':s.is_locked?'已鎖定':s.is_open?'開放中':'未開放');row.append(label);
   const buttons=document.createElement('div');
   const operations=[['開放','tbl_teacher_open_stage',!s.is_open&&!s.is_locked&&!s.is_revealed],['鎖定','tbl_teacher_lock_stage',s.is_open&&!s.is_locked&&count===13],['公布','tbl_teacher_publish_stage',s.is_locked&&!s.is_revealed]];
   for(const [label,fn,allow] of operations){
    const b=document.createElement('button');b.className='secondary';b.textContent=label;b.disabled=!allow;
    b.onclick=async()=>{
     if(actionBusy||nonce!==refreshNonce||teacherSession!==target)return;
     const session=target;
     if(!confirm('操作課堂：'+name+'\nStage '+s.stage_number+'：'+label+'？\n請確認是正確場次。'))return;
     actionBusy=true;
     refreshNonce++;$('sessionSelect').disabled=true;
     try{await rpc(fn,{p_session_id:session,p_stage:s.stage_number});say('已在「'+name+'」執行 Stage '+s.stage_number+'：'+label,'good')}
     catch(e){say(errorText(e),'error')}finally{actionBusy=false;$('sessionSelect').disabled=false;await loadTeacher()}
    };buttons.append(b)
   }
   if(isTestSession(target,name)){
    const simulate=document.createElement('button');simulate.className='secondary';simulate.textContent='模擬 13 組提交（TEST）';
    simulate.disabled=!s.is_open||s.is_locked||s.is_revealed||count>=13;
    simulate.onclick=async()=>{
     if(actionBusy||nonce!==refreshNonce||teacherSession!==target||!isTestSession(target,teacherTitle))return;
     if(!confirm('僅限 TEST 課堂：'+name+'\nStage '+s.stage_number+'：為未提交的組別補上模擬答案 A，補齊 13 組。\n既有答案不會覆寫，確定執行？'))return;
     actionBusy=true;refreshNonce++;$('sessionSelect').disabled=true;
     try{
      const inserted=await rpc('tbl_teacher_simulate_test_submissions',{p_session_id:target,p_stage:s.stage_number});
      say('TEST Stage '+s.stage_number+' 已新增 '+inserted+' 組模擬提交（答案 A），既有答案保留。','good');
     }catch(error){say(errorText(error),'error')}
     finally{actionBusy=false;$('sessionSelect').disabled=false;await loadTeacher()}
    };
    buttons.append(simulate);
   }
   row.append(buttons);area.append(row)
  }
  const result=await rpc('tbl_published_scores',{p_session_id:target});
  if(nonce===refreshNonce&&teacherSession===target)showScores(result);
 }catch(e){if(nonce===refreshNonce){$('stages').replaceChildren();$('scoreRows').replaceChildren();say(errorText(e),'error')}}finally{busy=false;if(pendingRefresh||nonce!==refreshNonce){pendingRefresh=false;loadTeacher()}}
}
$('sessionSelect').onchange=()=>{
 if(actionBusy){$('sessionSelect').value=teacherSession;return}
 teacherSession=$('sessionSelect').value;
 clearJoinCodes();
 clearRepresentatives();
 clearAnswerReview();
 sessionStorage.setItem(SESSION_KEY,teacherSession);
 refreshNonce++;
 $('sessionName').textContent='切換中…';
 $('stages').replaceChildren();$('scoreRows').replaceChildren();
 $('sessionSelect').blur();
 loadTeacher();
};
$('login').onclick=async()=>{const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){say(errorText(error),'error');return}refreshNonce++;teacherSession=null;sessionStorage.removeItem(SESSION_KEY);say('教師已登入','good');loadTeacher()};
$('logout').onclick=async()=>{if(actionBusy)return;refreshNonce++;teacherSession=null;teacherTitle='';clearJoinCodes();clearRepresentatives();clearAnswerReview();sessionStorage.removeItem(SESSION_KEY);$('control').classList.add('hide');$('scores').classList.add('hide');$('stages').replaceChildren();$('scoreRows').replaceChildren();await sb.auth.signOut();say('已登出')};
loadTeacher();setInterval(()=>{if(!document.hidden)loadTeacher()},4000);
