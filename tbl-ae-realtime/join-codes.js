const STUDENT_SESSION_KEY='tbl-ae-realtime-student-session';
const STUDENT_TITLE_KEY='tbl-ae-realtime-student-title';
function normalizeJoinCode(value){return String(value||'').trim().toUpperCase()}
function validJoinCode(value){
 return /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(value)||/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(value);
}
function studentJoinLink(code){
 const link=new URL('student.html',window.location.href);link.hash='join='+normalizeJoinCode(code);return link.href;
}
function prefilledJoinCode(){
 const code=normalizeJoinCode(new URLSearchParams(window.location.hash.slice(1)).get('join'));
 return validJoinCode(code)?code:'';
}
