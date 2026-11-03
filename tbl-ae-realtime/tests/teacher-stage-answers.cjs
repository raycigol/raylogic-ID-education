const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{constructor(){this.children=[];this.textContent=''}append(child){this.children.push(child)}}
const source=fs.readFileSync(__dirname+'/../teacher.js','utf8');
const context=vm.createContext({document:{createElement:()=>new Element()}});
vm.runInContext(source.slice(source.indexOf('function stageAnswerTable'),source.indexOf('async function loadTeacher')),context);
const teams=[{team_id:'b',team_number:2,team_name:'第二組',active:false},{team_id:'a',team_number:1,team_name:'第一組',active:true},{team_id:'c',team_number:3,team_name:'第三組',active:true}];
const submissions=[{team_id:'foreign',stage_number:2,answer:'E'},{team_id:'a',stage_number:1,answer:'D'},{team_id:'a',stage_number:2,answer:'B'},{team_id:'b',stage_number:2,answer:'C'}];
const scores=[{team_number:1,stage_number:1,score:99},{team_number:1,stage_number:2,score:0},{team_number:2,stage_number:2,score:'2.5'}];
function rows(revealed){return context.stageAnswerTable({stage_number:2,is_revealed:revealed},teams,submissions,scores).children[0].children[2].children.map(r=>r.children.map(c=>c.textContent))}
assert.deepEqual(rows(false),[['第一組','B','待公布'],['第二組（未參與）','C','待公布'],['第三組','尚未提交','待公布']]);
assert.deepEqual(rows(true),[['第一組','B','0 分'],['第二組（未參與）','C','2.5 分'],['第三組','尚未提交','—']]);
assert.match(source,/select\('stage_number,team_id,answer'\)\.eq\('session_id',target\)/);
console.log('PASS: teacher stage answer/score pairing, zero, unpublished/missing values, inactive teams and scoped reads');
