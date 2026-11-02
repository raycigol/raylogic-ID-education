const cfg=window.TBL_CONFIG;const sb=window.supabase.createClient(cfg.url,cfg.key);const $=id=>document.getElementById(id);const fmt=n=>Number.isInteger(n)?String(n):n.toFixed(1);const errorText=e=>e?.message||String(e);function say(msg,type=''){const node=$('notice');node.textContent=msg;node.className=type}async function rpc(name,args){const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}
function makeScoreTable(records){
 const byNumber=new Map();
 for(const r of records||[]){
  if(!Number.isInteger(r.team_number)||r.team_number<1)continue;
  if(!byNumber.has(r.team_number))byNumber.set(r.team_number,{n:r.team_number,name:r.team_name,scores:[null,null,null,null]});
  if(Number.isInteger(r.stage_number)&&r.stage_number>=1&&r.stage_number<=4&&r.score!==null&&r.score!==undefined)byNumber.get(r.team_number).scores[r.stage_number-1]=Number(r.score);
 }
 const teams=[...byNumber.values()].sort((a,b)=>a.n-b.n).map(t=>({...t,total:t.scores.some(x=>x!==null)?t.scores.reduce((s,v)=>s+(v??0),0):null,rank:null}));
 let previous=null,rank=0;
 teams.filter(t=>t.total!==null).sort((a,b)=>b.total-a.total||a.n-b.n).forEach((t,i)=>{if(t.total!==previous){rank=i+1;previous=t.total}t.rank=rank});
 return teams;
}
function showScores(records){const table=$('scoreRows');if(!table)return;table.replaceChildren();for(const t of makeScoreTable(records)){const row=document.createElement('tr');for(const item of [t.name,...t.scores.map(x=>x===null?'—':fmt(x)),t.total===null?'—':fmt(t.total),t.rank===null?'—':'#'+t.rank]){const td=document.createElement('td');td.textContent=item;row.append(td)}table.append(row)}}
