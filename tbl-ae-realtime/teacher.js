let teacherSession=null,teacherTitle='',busy=false,actionBusy=false,refreshNonce=0;
const SESSION_KEY='tbl-ae-realtime-teacher-session';
async function loadTeacher(){
 if(busy||actionBusy)return;
 busy=true;
 const nonce=refreshNonce;
 try{
  const {data:u}=await sb.auth.getUser();
  if(!u.user||u.user.is_anonymous){$('control').classList.add('hide');$('scores').classList.add('hide');return}
  const {data:ss,error:se}=await sb.from('tbl_sessions').select('id,title,created_at').order('created_at',{ascending:true});
  if(se)throw se;
  if(!ss?.length){say('沒有找到屬於這個帳號的課堂。','error');$('control').classList.add('hide');$('scores').classList.add('hide');return}
  const selector=$('sessionSelect');
  const preferred=teacherSession||sessionStorage.getItem(SESSION_KEY);
  const selected=ss.find(x=>x.id===preferred)||ss.find(x=>x.title==='2026 ID Block TBL — TEST')||ss[0];
  teacherSession=selected.id;teacherTitle=selected.title;
  selector.replaceChildren();
  for(const s of ss){const o=document.createElement('option');o.value=s.id;o.textContent=s.title+(s.title.includes('TEST')?'（測試）':'（正式）');selector.append(o)}
  selector.value=teacherSession;
  $('sessionName').textContent='目前操作：'+teacherTitle;
  $('control').classList.remove('hide');$('scores').classList.remove('hide');
  const target=teacherSession;
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
     if(actionBusy)return;
     const name=teacherTitle,session=teacherSession;
     if(!confirm('操作課堂：'+name+'\nStage '+s.stage_number+'：'+label+'？\n請確認是正確場次。'))return;
     actionBusy=true;
     try{await rpc(fn,{p_session_id:session,p_stage:s.stage_number});say('已在「'+name+'」執行 Stage '+s.stage_number+'：'+label,'good')}
     catch(e){say(errorText(e),'error')}finally{actionBusy=false;await loadTeacher()}
    };buttons.append(b)
   }
   row.append(buttons);area.append(row)
  }
  const result=await rpc('tbl_published_scores',{p_session_id:target});
  if(nonce===refreshNonce&&teacherSession===target)showScores(result);
 }catch(e){say(errorText(e),'error')}finally{busy=false}
}
$('sessionSelect').onchange=()=>{
 if(actionBusy)return;
 teacherSession=$('sessionSelect').value;
 sessionStorage.setItem(SESSION_KEY,teacherSession);
 refreshNonce++;
 $('sessionName').textContent='切換中…';
 $('stages').replaceChildren();$('scoreRows').replaceChildren();
 loadTeacher();
};
$('login').onclick=async()=>{const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){say(errorText(error),'error');return}teacherSession=null;sessionStorage.removeItem(SESSION_KEY);say('教師已登入','good');loadTeacher()};
$('logout').onclick=async()=>{await sb.auth.signOut();teacherSession=null;teacherTitle='';sessionStorage.removeItem(SESSION_KEY);$('control').classList.add('hide');$('scores').classList.add('hide');say('已登出')};
loadTeacher();setInterval(()=>{if(!document.hidden)loadTeacher()},4000);