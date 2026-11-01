let teacherConfirmationResolve=null;
function confirmationWord(value){return String(value||'').normalize('NFKC').replace(/\s/gu,'')}
function validTeacherConfirmation(){
 const reason=$('confirmationReason').value.trim();
 return confirmationWord($('confirmationWord').value)===$('confirmationToken').textContent&&
  ($('confirmationReasonArea').hidden||reason.length>=1&&reason.length<=500);
}
function updateTeacherConfirmation(){
 $('confirmationSubmit').disabled=!validTeacherConfirmation();
}
function requestTeacherConfirmation({action,title,details,effect,requireReason=false}){
 if(teacherConfirmationResolve||!['重置','撤回'].includes(action))return Promise.resolve(null);
 const dialog=$('teacherConfirmation');
 $('confirmationTitle').textContent=title;$('confirmationEffect').textContent=effect;$('confirmationToken').textContent=action;
 $('confirmationSubmit').textContent='確認'+action;
 $('confirmationDetails').replaceChildren();
 for(const [label,value] of details){
  const term=document.createElement('dt'),description=document.createElement('dd');
  term.textContent=label;description.textContent=value;$('confirmationDetails').append(term,description);
 }
 $('confirmationReasonArea').hidden=!requireReason;$('confirmationReason').value='';$('confirmationReason').disabled=!requireReason;
 dialog.returnValue='cancelled';$('confirmationWord').value='';updateTeacherConfirmation();
 return new Promise(resolve=>{
  teacherConfirmationResolve=resolve;
  try{dialog.showModal();(requireReason?$('confirmationReason'):$('confirmationWord')).focus()}
  catch(error){teacherConfirmationResolve=null;resolve(null);say(errorText(error),'error')}
 });
}
$('confirmationWord').addEventListener('input',updateTeacherConfirmation);
$('confirmationReason').addEventListener('input',updateTeacherConfirmation);
$('confirmationCancel').onclick=()=>$('teacherConfirmation').close('cancelled');
$('confirmationForm').addEventListener('submit',event=>{
 event.preventDefault();if(validTeacherConfirmation())$('teacherConfirmation').close('confirmed');
});
$('teacherConfirmation').addEventListener('close',()=>{
 const resolve=teacherConfirmationResolve;
 const result=$('teacherConfirmation').returnValue==='confirmed'&&validTeacherConfirmation()?{reason:$('confirmationReason').value.trim()}:null;
 teacherConfirmationResolve=null;if(resolve)resolve(result);
});
