const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const directory=path.resolve(process.argv[2]||path.join(__dirname,'..'));
class Element{
 constructor(){this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.returnValue='';this.events={};this.children=[]}
 addEventListener(name,handler){this.events[name]=handler}
 append(...children){this.children.push(...children)}
 replaceChildren(){this.children=[]}
 showModal(){this.open=true}
 close(value){if(value!==undefined)this.returnValue=value;this.open=false;this.events.close()}
 focus(){this.focused=true}
}
const nodes=new Map(),context=vm.createContext({document:{createElement:()=>new Element()},$:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},say(){},errorText:error=>error.message});
const request=options=>context.requestTeacherConfirmation(options);
const input=value=>{nodes.get('confirmationWord').value=value;nodes.get('confirmationWord').events.input()};
const submit=()=>nodes.get('confirmationForm').events.submit({preventDefault(){}});
(async()=>{
 vm.runInContext(fs.readFileSync(path.join(directory,'teacher-confirmation.js'),'utf8'),context);
 const reset={action:'重置',title:'重置課堂',details:[['課堂','2026 ID Block TBL — TEST']],effect:'刪除答案與分數'};
 const pending=request(reset);assert.equal(nodes.get('confirmationToken').textContent,'重置');assert.equal(nodes.get('confirmationSubmit').disabled,true);
 input('TEST');submit();assert.equal(nodes.get('teacherConfirmation').open,true);
 input('　重 置\n');assert.equal(nodes.get('confirmationSubmit').disabled,false);submit();assert.ok(await pending);
 const escape=request(reset);input('重置');nodes.get('teacherConfirmation').close();assert.equal(await escape,null);
 const cancel=request(reset);nodes.get('confirmationCancel').onclick();assert.equal(await cancel,null);
 const withdrawal=request({...reset,action:'撤回',requireReason:true});input('撤回');assert.equal(nodes.get('confirmationSubmit').disabled,true);
 nodes.get('confirmationReason').value='  ';nodes.get('confirmationReason').events.input();assert.equal(nodes.get('confirmationSubmit').disabled,true);
 nodes.get('confirmationReason').value='誤加入';nodes.get('confirmationReason').events.input();assert.equal(nodes.get('confirmationSubmit').disabled,false);
 submit();assert.equal((await withdrawal).reason,'誤加入');
 const duplicate=request(reset);assert.equal(await request(reset),null);nodes.get('confirmationCancel').onclick();await duplicate;
 assert.equal(nodes.get('confirmationDetails').children[1].textContent,'2026 ID Block TBL — TEST');
 console.log('PASS: fixed two-character tokens, whitespace normalization, reason validation, cancel/Escape/reopen, duplicate-dialog guard and full target display');
})().catch(error=>{console.error(error);process.exitCode=1});
