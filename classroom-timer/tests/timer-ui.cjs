const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(){this.value='';this.textContent='';this.style={};this.hidden=false;this.checked=false;this.attributes={};this.children=[];const classes=new Set();this.classList={toggle:(key,on)=>on?classes.add(key):classes.delete(key),contains:key=>classes.has(key)}}
 setAttribute(key,value){this.attributes[key]=value}replaceChildren(...items){this.children=items}append(...items){this.children.push(...items)}click(){return this.onclick?.()}closest(){return null}
}
const root=path.resolve(process.argv[2]||path.join(__dirname,'..')),storage=new Map();
function page(nowStart=1000){
 let now=nowStart,confirmed=true;const nodes=new Map(),events={},$=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
 const document={body:new Element(),createTextNode:text=>({textContent:text}),createElement:()=>new Element(),getElementById:$,addEventListener:(name,fn)=>events[name]=fn,fullscreenElement:null};
 let draw;const RealDate=Date;class Clock extends RealDate{static now(){return now}}
 const context=vm.createContext({ClassroomTimer:require(path.join(root,'timer-core.js')),document,window:{addEventListener(){}},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},Date:Clock,Intl,confirm:()=>confirmed,setInterval:fn=>draw=fn});
 vm.runInContext(fs.readFileSync(path.join(root,'timer.js'),'utf8'),context);
 return {$,document,events,advance:ms=>{now+=ms;draw()},confirm:value=>confirmed=value};
}
let p=page();assert.equal(p.$('digits').textContent,'10:00');
p.$('startPause').click();p.advance(3000);assert.equal(p.$('digits').textContent,'09:57');
p.$('clockMode').click();assert.equal(p.$('timerControls').hidden,true);p.advance(5000);p.$('countdownMode').click();assert.equal(p.$('digits').textContent,'09:52','clock mode does not pause countdown');
p.$('startPause').click();p.advance(10000);assert.equal(p.$('digits').textContent,'09:52','pause freezes remaining time');
p.confirm(false);p.$('trat').click();assert.equal(p.$('digits').textContent,'09:52','cancelled stage switch preserves countdown');
p.confirm(true);p.$('trat').click();assert.equal(p.$('digits').textContent,'15:00');
p.$('minutes').value='0';p.$('seconds').value='5';p.$('durationForm').onsubmit({preventDefault(){}});
assert.equal(p.$('digits').textContent,'00:05');p.$('startPause').click();
p=page(21000);assert.equal(p.$('digits').textContent,'00:03','reload resumes saved deadline');
p.advance(4000);assert.equal(p.$('digits').textContent,'00:00');assert.equal(p.$('status').textContent,'時間到');
p.$('plusMinute').click();assert.equal(p.$('digits').textContent,'01:00');assert.equal(p.$('startPause').textContent,'繼續計時');
p.$('projection').click();assert.equal(p.document.body.classList.contains('projection'),true);
const before=p.$('digits').textContent;p.$('minutes').value='0';p.$('seconds').value='0';p.$('durationForm').onsubmit({preventDefault(){}});
assert.equal(p.$('digits').textContent,before,'zero duration rejected without resetting timer');
p.events.keydown({target:{closest:()=>({})},key:'r',code:'KeyR'});assert.equal(p.$('digits').textContent,before,'editing inputs does not trigger shortcuts');
assert.deepEqual([...storage.keys()],['raylogic-classroom-timer-v1']);
console.log('PASS: start/pause; clock mode continues countdown; cancelled changes; custom duration; reload; finish; adjustments; projection; validation; keyboard editing guard; isolated storage');
