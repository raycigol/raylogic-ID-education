const teacherTabs=Array.from(document.querySelectorAll('[data-teacher-tab]'));
const teacherPanels=Array.from(document.querySelectorAll('[data-teacher-panel]'));
function selectTeacherPanel(name,focus=false){
 const selected=teacherTabs.find(tab=>tab.dataset.teacherTab===name);
 if(!selected)return;
 for(const tab of teacherTabs){
  const active=tab===selected;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
 }
 for(const panel of teacherPanels)panel.hidden=panel.dataset.teacherPanel!==name;
 if(focus)selected.focus();
}
for(const [index,tab] of teacherTabs.entries()){
 tab.addEventListener('click',()=>selectTeacherPanel(tab.dataset.teacherTab));
 tab.addEventListener('keydown',event=>{
  let target=index;
  if(event.key==='ArrowRight')target=(index+1)%teacherTabs.length;
  else if(event.key==='ArrowLeft')target=(index+teacherTabs.length-1)%teacherTabs.length;
  else if(event.key==='Home')target=0;
  else if(event.key==='End')target=teacherTabs.length-1;
  else return;
  event.preventDefault();selectTeacherPanel(teacherTabs[target].dataset.teacherTab,true);
 });
}
selectTeacherPanel('course');
