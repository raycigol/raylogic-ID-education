let answerReviewNonce=0;
function clearAnswerReview(){
 answerReviewNonce++;$('answerReview').replaceChildren();$('answerHistory').replaceChildren();$('archivedAnswerHistory').replaceChildren();$('answerReviewName').textContent='';$('loadAnswerReview').disabled=false;
}
function answerReviewTime(value){return new Date(value).toLocaleString('zh-TW',{hour12:false})}
async function loadAnswerReview(){
 if(actionBusy||!teacherSession)return;
 const target=teacherSession,name=teacherTitle,nonce=++answerReviewNonce;
 $('loadAnswerReview').disabled=true;
 try{
  const result=await rpc('tbl_teacher_answer_review',{p_session_id:target});
  if(target!==teacherSession||nonce!==answerReviewNonce)return;
  $('answerReview').replaceChildren();$('answerHistory').replaceChildren();$('archivedAnswerHistory').replaceChildren();$('answerReviewName').textContent=name+'｜僅能撤回未鎖定、未公布且尚未計分的答案';
  for(const entry of result.submissions||[]){
   const submission=entry.submission,row=document.createElement('div');row.className='stage';
   const text=document.createElement('div');text.textContent=entry.team_name+'｜S'+submission.stage_number+'｜答案 '+submission.answer+'｜'+answerReviewTime(submission.submitted_at);
   const button=document.createElement('button');button.className='secondary';button.textContent=entry.is_locked||entry.is_revealed||entry.has_scores?'已鎖定／公布／計分，不能撤回':'撤回此答案';
   button.disabled=entry.is_locked!==false||entry.is_revealed!==false||entry.has_scores===true;
   button.onclick=async()=>{
    if(actionBusy||target!==teacherSession||nonce!==answerReviewNonce||button.disabled)return;
    actionBusy=true;refreshNonce++;answerReviewNonce++;$('sessionSelect').disabled=true;button.disabled=true;
    try{
     const approval=await requestTeacherConfirmation({action:'撤回',title:'撤回單組答案',details:[['課堂',name],['組別',entry.team_name],['階段','S'+submission.stage_number],['原答案',submission.answer],['提交時間',answerReviewTime(submission.submitted_at)]],effect:'只撤回以上組別、階段的這一筆答案；其他組與階段保留。原答案、教師與撤回原因會保存在更正紀錄。',requireReason:true});
     if(!approval||target!==teacherSession)return;
     await rpc('tbl_teacher_withdraw_answer',{p_session_id:target,p_team_id:submission.team_id,p_stage:submission.stage_number,p_expected_submission:submission,p_confirm_title:name,p_confirm_text:'撤回 '+entry.team_name+' S'+submission.stage_number,p_reason:approval.reason});
     clearRepresentatives();say('已撤回「'+name+'」'+entry.team_name+' S'+submission.stage_number+'，原答案與原因已留存；其他組不變。','good');
    }catch(error){say(errorText(error),'error')}
    finally{actionBusy=false;$('sessionSelect').disabled=false;await loadTeacher();await loadAnswerReview()}
   };
   row.append(text,button);$('answerReview').append(row);
  }
  if(!result.submissions?.length)$('answerReview').textContent='目前沒有已提交答案。';
  const renderHistory=(records,container,archived)=>{
   for(const record of records){
   const row=document.createElement('div');row.className='stage';
   const original=record.original_submission;
   const text=document.createElement('div');text.textContent=record.team_name+'｜S'+record.stage_number+'｜原答案 '+original.answer+'（提交：'+answerReviewTime(original.submitted_at)+'）｜教師撤回：'+answerReviewTime(record.withdrawn_at)+'｜原因：'+record.reason+(archived?'｜封存：'+answerReviewTime(record.archived_at):'');
   row.append(text);container.append(row);
   }
  };
  renderHistory(result.history||[],$('answerHistory'),false);
  renderHistory(result.archived_history||[],$('archivedAnswerHistory'),true);
  if(!result.history?.length)$('answerHistory').textContent='本次課堂沒有更正紀錄。';
  if(!result.archived_history?.length)$('archivedAnswerHistory').textContent='目前沒有封存紀錄。';
 }catch(error){if(target===teacherSession&&nonce===answerReviewNonce){$('answerReview').replaceChildren();$('answerHistory').replaceChildren();$('archivedAnswerHistory').replaceChildren();say(errorText(error),'error')}}
 finally{if(nonce===answerReviewNonce)$('loadAnswerReview').disabled=false}
}
$('loadAnswerReview').onclick=()=>loadAnswerReview();
