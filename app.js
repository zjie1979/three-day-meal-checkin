'use strict';
const KEY = 'threeDayMealCheckin.v1';
const VERSION = '2026.11.01-3';
const PLANS = [
  {name:'正常饮食日',title:'正常吃，晚饭后收餐',description:'第一天正常均衡饮食，不提前少吃。晚饭后停止进食；如有身体不适或医疗需要，及时调整。',checks:[['记录今天的正常饮食','保持均衡，不为第二天提前节食。'],['记录晚餐结束时间或备注','时间按实际记录，不强制规定几点。'],['记录今天的身体感受','如实记录，不以饥饿程度评判完成。']]},
  {name:'自制水记录日',title:'白天5杯自制水，晚餐约500大卡',description:'白天记录5杯自制水，每杯单独打卡；晚餐吃一顿约500大卡。配方、容量未指定，不预设零热量，不要求空腹或强行喝完。',checks:[['记录白天5杯自制水','每杯独立勾选，实际调整也可以记录。'],['记录晚餐和全天实际热量','晚餐约500大卡为参考，自制水热量另计。'],['记录身体感受与是否调整','不适时优先停止计划，不必补做。']]},
  {name:'恢复均衡日',title:'恢复正常，好好吃饭',description:'第三天恢复正常均衡饮食。不补偿性大吃，也不以继续禁食补偿前一天。三日结束后不会自动开始新一轮。',checks:[['记录恢复正常饮食','正常吃饭，不继续压低热量。'],['回顾这次三日安排','记下是否适合自己、哪里需要调整。'],['记录今天的身体感受','体重可选；单次掉秤不等于同量脂肪。']]}
];
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function validDate(value){return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function dayDate(start,offset){const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function elapsed(start){return Math.floor((Date.parse(localDate()+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);}
function formatted(date){return date.replace(/^(\d+)-(\d+)-(\d+)$/,'$1年$2月$3日');}
function newDay(){return {checks:[false,false,false],waterChecks:[false,false,false,false,false],meals:[],weight:'',note:'',closed:false,outcome:'recorded'};}
function sanitize(value){
  if(!value||value.schema!==1||!Array.isArray(value.cycles)||value.cycles.length>500) throw new Error('备份格式不正确');
  const ids=new Set();
  const cycles=value.cycles.map(c=>{
    if(!c||typeof c.id!=='string'||!/^[\w-]{1,80}$/.test(c.id)||ids.has(c.id)||!validDate(c.startDate)||!['active','complete','stopped'].includes(c.status)||!Array.isArray(c.days)||c.days.length!==3) throw new Error('计划数据不完整');
    ids.add(c.id);
    const days=c.days.map(d=>{
      if(!d||!Array.isArray(d.checks)||d.checks.length!==3||!d.checks.every(x=>typeof x==='boolean')||!Array.isArray(d.meals)||d.meals.length>200||typeof d.note!=='string'||d.note.length>2000||typeof d.closed!=='boolean'||!['recorded','adjusted'].includes(d.outcome)) throw new Error('记录内容不正确');
      const meals=d.meals.map(m=>{
        if(!m||typeof m.id!=='string'||m.id.length>80||typeof m.name!=='string'||!m.name.trim()||m.name.length>60||!Number.isFinite(m.kcal)||m.kcal<0||m.kcal>10000) throw new Error('食物记录不正确');
        return {id:m.id,name:m.name,kcal:m.kcal,slot:['dinner','water','other'].includes(m.slot)?m.slot:'other'};
      });
      const weight=d.weight===''?'':Number(d.weight);
      if(weight!==''&&(!Number.isFinite(weight)||weight<20||weight>400)) throw new Error('体重记录不正确');
      const waterChecks=d.waterChecks===undefined?[false,false,false,false,false]:d.waterChecks;
      if(!Array.isArray(waterChecks)||waterChecks.length!==5||!waterChecks.every(x=>typeof x==='boolean')) throw new Error('水杯记录不正确');
      return {checks:[...d.checks],waterChecks:[...waterChecks],meals,weight,note:d.note,closed:d.closed,outcome:d.outcome};
    });
    if(c.status==='complete'&&!days.every(d=>d.closed)) throw new Error('计划状态不一致');
    return {id:c.id,startDate:c.startDate,status:c.status,days};
  });
  const active=cycles.filter(c=>c.status==='active');
  if(active.length>1||((value.activeId||null)!==(active[0]?.id||null))) throw new Error('进行中的计划不一致');
  return {schema:1,activeId:active[0]?.id||null,cycles};
}
let data={schema:1,activeId:null,cycles:[]},storageBroken=false;
try{const raw=localStorage.getItem(KEY);if(raw)data=sanitize(JSON.parse(raw));}catch(error){storageBroken=true;}
let selectedDay=null,recordId=null;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),2800);}
function notice(title,message){$('notice-title').textContent=title;$('notice-body').textContent=message;$('notice').showModal();}
function transact(change){
  if(storageBroken){notice('记录未保存','本机原有记录无法读取。请先导出原始数据，勿清除网站数据。');return false;}
  const before=JSON.stringify(data);
  try{change();sanitize(data);localStorage.setItem(KEY,JSON.stringify(data));return true;}
  catch(error){data=JSON.parse(before);notice('没有保存成功','本机存储不可用、空间不足或记录格式异常。请先备份，再重试；本次操作没有显示为成功。');return false;}
}
function active(){return data.cycles.find(c=>c.id===data.activeId);}
function total(d){return Math.round(d.meals.reduce((sum,m)=>sum+m.kcal,0)*10)/10;}
function header(eyebrow,title,subtitle=''){return `<p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${subtitle?`<p class="subtitle">${subtitle}</p>`:''}`;}
function progress(c){const n=c.days.filter(d=>d.closed).length;return `<div class="progress"><span style="width:${n/3*100}%"></span></div><div class="progress-caption"><span>三日记录进度</span><span>${n} / 3 天</span></div>`;}
// Keep the app frame stable. System accessibility zoom can override web controls.
['gesturestart','gesturechange','gestureend'].forEach(name=>document.addEventListener(name,e=>e.preventDefault(),{passive:false}));
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
let lastTap=0;
document.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTap<300&&!e.target.closest('input,textarea,select,button,a,label'))e.preventDefault();lastTap=now;},{passive:false});
document.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault();},{passive:false});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','-','=','0'].includes(e.key))e.preventDefault();});
window.addEventListener('hashchange',()=>render(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>toast('离线缓存暂不可用，联网记录仍可使用'));}
