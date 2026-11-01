(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClassroomTimer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const MAX=5999*60+59;
 function validSeconds(value){return Number.isInteger(value)&&value>=1&&value<=MAX}
 function format(seconds){const n=Math.max(0,Math.ceil(seconds));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
 class Timer{
  constructor(seconds=600){if(!validSeconds(seconds))throw Error('Invalid duration');this.duration=seconds;this.left=seconds;this.deadline=null;this.phase='ready'}
  remaining(now){return this.phase==='running'?Math.max(0,(this.deadline-now)/1000):this.left}
  tick(now){if(this.phase==='running'&&this.remaining(now)<=0){this.phase='finished';this.left=0;this.deadline=null;return true}return false}
  start(now){if(this.phase==='running'||this.phase==='finished')return;this.deadline=now+this.left*1000;this.phase='running'}
  pause(now){if(this.phase!=='running')return;this.tick(now);if(this.phase==='finished')return;this.left=this.remaining(now);this.deadline=null;this.phase='paused'}
  reset(){this.left=this.duration;this.deadline=null;this.phase='ready'}
  setDuration(seconds){if(!validSeconds(seconds))throw Error('Invalid duration');this.duration=seconds;this.reset()}
  shift(seconds,now){if(!Number.isFinite(seconds))return;const left=Math.min(MAX,Math.max(0,this.remaining(now)+seconds));this.left=left;if(this.phase==='running'){this.deadline=now+left*1000;this.tick(now)}else if(left===0){this.phase='finished';this.deadline=null}else{this.phase='paused';this.deadline=null}}
  snapshot(){return {duration:this.duration,left:this.left,deadline:this.deadline,phase:this.phase}}
  static restore(state,now){
   if(!state||!validSeconds(state.duration)||!['ready','running','paused','finished'].includes(state.phase)||!Number.isFinite(state.left)||state.left<0||state.left>MAX)return null;
   if(state.phase==='running'&&(!Number.isFinite(state.deadline)||state.deadline>now+MAX*1000))return null;
   const timer=new Timer(state.duration);timer.left=state.left;timer.deadline=state.phase==='running'?state.deadline:null;timer.phase=state.phase;timer.tick(now);return timer;
  }
 }
 return {Timer,format,validSeconds};
});
