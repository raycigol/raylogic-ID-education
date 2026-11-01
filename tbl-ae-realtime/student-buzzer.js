let studentBuzzerNonce=0,studentBuzzerLoading=false,studentBuzzerBusy=false,studentBuzzerRound=null;
function clearStudentBuzzer(){
 studentBuzzerNonce++;studentBuzzerRound=null;
 $('studentBuzzer').classList.add('hide');$('buzzButton').disabled=true;
 $('studentBuzzerStatus').textContent='';$('studentBuzzerTotals').replaceChildren();
}
async function loadStudentBuzzer(){
 if(studentBuzzerLoading||studentBuzzerBusy||!mySession)return;
 studentBuzzerLoading=true;const session=mySession,nonce=++studentBuzzerNonce,membershipNonce=studentNonce;
 try{
  const data=await rpc('tbl_buzzer_status',{p_session_id:session});
  if(nonce!==studentBuzzerNonce||session!==mySession||membershipNonce!==studentNonce)return;
  const round=data.rounds[0];
  if(!round||!['open','claimed'].includes(round.state)){clearStudentBuzzer();return}
  studentBuzzerRound=round.id;
  $('studentBuzzer').classList.remove('hide');
  $('studentBuzzerStatus').textContent=!round?'教師尚未開啟搶答':('第 '+round.round_number+' 輪｜'+(round.winner_team_id?(round.winner_team_id===data.my_team_id?'本組取得回答權！':'回答權：'+round.winner_name):round.state==='open'?'搶答開放中':'本輪已結束')+'｜本輪 '+round.points+' 分');
  $('buzzButton').disabled=!round||round.state!=='open';
  $('buzzButton').onclick=async()=>{
   if(!round||studentBuzzerBusy||studentBusy||session!==mySession||membershipNonce!==studentNonce||studentBuzzerRound!==round.id)return;
   studentBuzzerBusy=true;$('buzzButton').disabled=true;
   try{
    const won=await rpc('tbl_student_buzz',{p_session_id:session,p_round_id:round.id});
    if(session===mySession&&membershipNonce===studentNonce)$('studentBuzzerStatus').textContent=won?'本組取得回答權！請等待教師。':'本輪已結束或由其他組取得回答權。';
   }catch(error){if(session===mySession&&membershipNonce===studentNonce)$('studentBuzzerStatus').textContent=errorText(error)}
   finally{studentBuzzerBusy=false;loadStudentBuzzer()}
  };
  $('studentBuzzerTotals').replaceChildren();
  for(const team of data.totals){const p=document.createElement('p');p.textContent=team.team_name+'：'+team.points+' 分';$('studentBuzzerTotals').append(p)}
 }catch(error){if(nonce===studentBuzzerNonce&&session===mySession){clearStudentBuzzer()}}
 finally{studentBuzzerLoading=false}
}
setInterval(()=>{if(!document.hidden)loadStudentBuzzer()},1000);
