let loading=false;
async function loadScores(){
 if(loading)return;loading=true;
 try{
  const {data:user}=await sb.auth.getUser();
  if(!user.user){$('scoreRows').replaceChildren();say('請先使用加入碼加入組別，或以教師帳號登入。');return}
  let session=null,title='';
  if(user.user.is_anonymous){
   const status=await rpc('tbl_student_status',{});
   const preferred=sessionStorage.getItem(STUDENT_SESSION_KEY);
   const current=preferred?status?.find(row=>row.session_id===preferred):status?.[0];
   session=current?.session_id;title=sessionStorage.getItem(STUDENT_TITLE_KEY)||current?.team_name||'';
  }else{
   const {data:sessions,error}=await sb.from('tbl_sessions').select('id,title');
   if(error)throw error;
   const preferred=sessionStorage.getItem('tbl-ae-realtime-teacher-session');
   const current=preferred?sessions?.find(row=>row.id===preferred):sessions?.[0];
   session=current?.id;title=current?.title||'';
  }
  if(!session){$('scoreRows').replaceChildren();say('找不到所選課堂，請返回學生頁重新加入，或在教師頁選擇課堂。');return}
  showScores(await rpc('tbl_published_scores',{p_session_id:session}));
  say('目前課堂：'+title+'｜僅顯示已公布分數；每 4 秒更新。','good');
 }catch(error){$('scoreRows').replaceChildren();say(errorText(error),'error')}
 finally{loading=false}
}
loadScores();setInterval(()=>{if(!document.hidden)loadScores()},4000);
