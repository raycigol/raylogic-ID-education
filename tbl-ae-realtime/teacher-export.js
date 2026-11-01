function scoreExportTime(date){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(part=>[part.type,part.value]));
 return {display:parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute+':'+parts.second,filename:parts.year+parts.month+parts.day+'-'+parts.hour+parts.minute+parts.second};
}
function scoreCsvCell(value){
 let text=value===null||value===undefined?'':String(value);
 if(typeof value!=='number'&&/^[\s\u0000-\u001f]*[=+@-]/u.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
function buildScoreExport(session,title,records,date=new Date(),teams=[]){
 const time=scoreExportTime(date);
 const teamNames=new Map(teams.map(team=>[team.team_number,team.team_name]));
 const rows=[['課堂名稱','課堂ID','組別編號','組別名稱','S1','S2','S3','S4','已公布累計','排名','匯出時間（台北）']];
 for(const team of makeScoreTable(records)){
  const hasPublished=team.scores.some(score=>score!==null);
  rows.push([title,session,team.n,teamNames.get(team.n)??team.name,...team.scores,hasPublished?team.total:null,hasPublished?team.rank:null,time.display]);
 }
 const safeTitle=title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/\s+/g,' ').trim().slice(0,80)||'課堂';
 return {content:'\uFEFF'+rows.map(row=>row.map(scoreCsvCell).join(',')).join('\r\n')+'\r\n',filename:safeTitle+'_成績_'+time.filename+'_'+session.replace(/[^a-zA-Z0-9-]/g,'').slice(0,8)+'.csv'};
}
async function exportTeacherScores(){
 if(actionBusy||!teacherSession)return;
 const target=teacherSession,title=teacherTitle;
 actionBusy=true;const nonce=++refreshNonce;
 $('sessionSelect').disabled=true;$('exportScores').disabled=true;
 let downloadUrl=null;
 try{
  const {data:before,error:authError}=await sb.auth.getUser();
  if(authError)throw authError;
  if(!before.user||before.user.is_anonymous)throw new Error('請先登入所屬教師帳號。');
  const [records,teams]=await Promise.all([
   rpc('tbl_published_scores',{p_session_id:target}),
   rpc('tbl_teacher_representatives',{p_session_id:target})
  ]);
  const {data:after,error:afterError}=await sb.auth.getUser();
  if(afterError)throw afterError;
  if(after.user?.id!==before.user.id||after.user?.is_anonymous||teacherSession!==target||refreshNonce!==nonce)throw new Error('登入或所選課堂已變動，請重新匯出。');
  const output=buildScoreExport(target,title,records,new Date(),teams);
  downloadUrl=URL.createObjectURL(new Blob([output.content],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=downloadUrl;link.download=output.filename;
  document.body.append(link);try{link.click()}finally{link.remove()}
  say('已產生「'+title+'」成績 CSV；僅含已公布分數，未公布欄位留白。','good');
 }catch(error){say(errorText(error),'error')}
 finally{
  if(downloadUrl){const completedUrl=downloadUrl;setTimeout(()=>URL.revokeObjectURL(completedUrl),1000)}
  actionBusy=false;$('sessionSelect').disabled=false;$('exportScores').disabled=false;await loadTeacher();
 }
}
$('exportScores').onclick=exportTeacherScores;
