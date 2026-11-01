'use strict';
const KEY = 'threeDayMealCheckin.v1';
const VERSION = '2026.11.01-2';
const PLANS = [
  {name:'正常饮食日',title:'正常吃，晚饭后收餐',description:'第一天正常均衡饮食，不提前少吃。晚饭后停止进食；如有身体不适或医疗需要，及时调整。',checks:[['记录今天的正常饮食','保持均衡，不为第二天提前节食。'],['记录晚餐结束时间或备注','时间按实际记录，不强制规定几点。'],['记录今天的身体感受','如实记录，不以饥饿程度评判完成。']]},
  {name:'轻断食记录日',title:'白天空腹，晚餐一顿',description:'第二天按所选方案白天空腹，晚餐吃一顿约500大卡。不限定下午16点进食，也不要求硬撑到某个时间。',checks:[['记录白天的实际情况','如需进食或中止，照实写下即可。'],['记录晚餐和全天实际热量','约500大卡为方案参考，不是越低越好。'],['记录身体感受与是否调整','不适时优先停止计划，不必补做。']]},
  {name:'恢复均衡日',title:'恢复正常，好好吃饭',description:'第三天恢复正常均衡饮食。不补偿性大吃，也不以继续禁食补偿前一天。三日结束后不会自动开始新一轮。',checks:[['记录恢复正常饮食','正常吃饭，不继续压低热量。'],['回顾这次三日安排','记下是否适合自己、哪里需要调整。'],['记录今天的身体感受','体重可选；单次掉秤不等于同量脂肪。']]}
];
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function validDate(value){return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function dayDate(start,offset){const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function elapsed(start){return Math.floor((Date.parse(localDate()+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);}
function formatted(date){return date.replace(/^(\d+)-(\d+)-(\d+)$/,'$1年$2月$3日');}
function newDay(){return {checks:[false,false,false],meals:[],weight:'',note:'',closed:false,outcome:'recorded'};}
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
        return {id:m.id,name:m.name,kcal:m.kcal};
      });
      const weight=d.weight===''?'':Number(d.weight);
      if(weight!==''&&(!Number.isFinite(weight)||weight<20||weight>400)) throw new Error('体重记录不正确');
      return {checks:[...d.checks],meals,weight,note:d.note,closed:d.closed,outcome:d.outcome};
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
function todayView(){
  const c=active();
  if(!c){const last=data.cycles.at(-1);return header('THREE DAYS, AT YOUR PACE','把今天，轻轻记下。','一个三日饮食记录工具。没有减重承诺，也不以忍饿或少吃作为成绩。')+`<article class="card hero"><p class="eyebrow">本次三日安排</p><h2>正常吃 → 轻断食记录<br>→ 恢复均衡</h2><p>第二天：白天空腹，晚餐吃一顿约500大卡。</p><div class="chips"><span class="chip">四页轻量记录</span><span class="chip">不自动重复</span><span class="chip">离线可用</span></div></article>${last?`<article class="card"><h2>${last.status==='complete'?'三日记录已完成':'本轮已停止'}</h2><p class="note">${formatted(last.startDate)} 开始的记录已保留。下一轮需要你手动选择，不会每三天自动断食。</p>${progress(last)}<button class="secondary" data-open="${last.id}">查看这轮记录</button></article>`:''}<article class="card start-panel"><h2>开始一次计划</h2><p class="note">约500大卡不是通用处方。请先确认适用性，不要同时叠加其他断食或极低热量方案。</p><form id="start-form"><label><span>第一天日期</span><input type="date" id="start-date" required value="${localDate()}" min="2020-01-01" max="2100-12-31"></label><label class="check-label"><input type="checkbox" id="eligibility" required><span>我已阅读<a href="#about">健康与适用提醒</a>，知道这不是医疗建议，身体不适时应停止而非硬撑打卡。</span></label><button class="primary" ${storageBroken?'disabled':''}>开始三日记录</button></form><p class="note">原帖是每周选一次轻断食。本工具不会自动安排频繁循环。</p></article><div class="warning">未成年人、孕哺期、有进食障碍史者不应自行断食。患糖尿病、使用降糖药或有其他疾病，请先由医生评估。</div>`;}
  const index=selectedDay===null?Math.min(2,Math.max(0,elapsed(c.startDate))):selectedDay;
  const d=c.days[index],p=PLANS[index],date=dayDate(c.startDate,index),future=date>localDate();
  return header('YOUR THREE-DAY JOURNAL','今天，记得照顾自己。',formatted(localDate())+` · 这轮从 ${formatted(c.startDate)} 开始`)+`<div class="steps">${c.days.map((x,i)=>`<button class="step ${i===index?'active':''} ${x.closed?'done':''}" data-day="${i}" aria-pressed="${i===index}"><strong>第${i+1}天${x.closed?' ✓':''}</strong><small>${PLANS[i].name}</small></button>`).join('')}</div><article class="card hero"><p class="eyebrow">第 ${index+1} 天 · ${formatted(date)}${date<localDate()?' · 可补记':''}</p><h2>${p.title}</h2><p>${p.description}</p></article>${future?'<div class="warning">这一天尚未开始，可以预览安排；到当天再如实记录，不提前打卡。</div>':''}${index===1?'<div class="warning">约500大卡是这一天所选方案的参考量，不是每顿500大卡。不适时优先进食、停止计划并按需就医，不为打卡延长空腹。</div>':''}<section class="section"><div class="section-head"><h2>今天的三个记录点</h2><span>${d.checks.filter(Boolean).length} / 3</span></div><article class="card">${p.checks.map((item,i)=>`<button class="check-row ${d.checks[i]?'checked':''}" data-check="${i}" aria-pressed="${d.checks[i]}" ${future?'disabled':''}><span class="check-box">${d.checks[i]?'✓':''}</span><span class="check-copy">${item[0]}<small>${item[1]}</small></span></button>`).join('')}<p class="note">勾选表示已记录，并不表示一定按原方案吃。调整或停止也可以如实记录。</p></article></section><section class="section"><div class="section-head"><h2>${index===1?'晚餐与全天摄入':'饮食热量记录'}</h2><span>手动填写</span></div><article class="card"><div class="metric"><strong>${total(d)}</strong><span>大卡${index===1?' · 方案参考约500':''}</span></div><p class="note">${d.meals.length?'已合计下方已录入食物；没有录入的内容不会自动计算。':'还没有食物记录，0只表示未录入，不代表实际未进食。'}</p>${d.meals.map(m=>`<div class="meal-item"><div><strong>${escapeHtml(m.name)}</strong><small>${m.kcal} 大卡</small></div><button class="remove" data-remove="${escapeHtml(m.id)}" ${future?'disabled':''}>移除</button></div>`).join('')}<form id="meal-form" class="form-stack"><label><span>食物或餐食名称</span><input id="meal-name" maxlength="60" placeholder="例如：今天的晚餐" required ${future?'disabled':''}></label><label><span>热量（大卡）</span><input type="number" id="meal-kcal" min="0" max="10000" step="0.1" inputmode="decimal" placeholder="按包装或实际份量填写" required ${future?'disabled':''}></label><button class="secondary" ${future?'disabled':''}>添加并合计热量</button></form><p class="note">这是手动估算记录，不自动识别食物，也不把越少吃视为越好。</p></article></section><article class="card"><h2>给自己留一句话</h2><form id="day-form" class="form-stack"><label><span>体重（kg，可选）</span><input id="weight" type="number" step="0.1" min="20" max="400" inputmode="decimal" value="${d.weight}" placeholder="可以不称" ${future?'disabled':''}></label><label><span>身体感受 / 实际调整</span><textarea id="day-note" maxlength="2000" placeholder="例如：今天提前吃了东西，已调整安排。" ${future?'disabled':''}>${escapeHtml(d.note)}</textarea></label><label><span>今天的实际情况</span><select id="outcome" ${future?'disabled':''}><option value="recorded" ${d.outcome==='recorded'?'selected':''}>按实际情况记录</option><option value="adjusted" ${d.outcome==='adjusted'?'selected':''}>已调整原安排 / 优先照顾身体</option></select></label><button class="secondary" ${future?'disabled':''}>保存当日记录</button></form></article><section class="section"><button class="primary" id="close-day" ${future||d.closed?'disabled':''}>${d.closed?'这一天已归档':'归档这一天的记录'}</button><p class="note">归档前先勾选三个记录点。不要求吃到指定热量；三天均归档后显示完成反馈。修改文字后请先保存。</p>${progress(c)}<button class="quiet-button" id="stop-cycle">需要调整？停止这轮计划</button></section>`;
}
function planView(){return header('THE THREE-DAY PLAN','三天，各有自己的节奏。','这是你选择的记录安排，不是适用于所有人的标准减肥处方。')+PLANS.map((p,i)=>`<article class="card"><span class="number-badge">${i+1}</span><h2>${p.title}</h2><p class="subtitle">${p.description}</p><ul class="plan-list">${p.checks.map(item=>`<li>${item[0]}</li>`).join('')}</ul></article>`).join('')+'<div class="warning">本次仅安排三日，不会每三天自动循环。原帖为每周选一次轻断食；不要自行叠加频率或继续压低摄入。</div><button class="secondary section" data-go="today">回到今日记录</button>';}
function recordsView(){
  const c=recordId?data.cycles.find(c=>c.id===recordId):null;
  if(c)return header('YOUR JOURNAL','这一轮，已经留下记录。',formatted(c.startDate)+` 开始 · ${c.status==='complete'?'三日已完成':c.status==='stopped'?'已停止':'进行中'}`)+`<button class="quiet-button" id="back-records">← 返回记录列表</button>${progress(c)}${c.days.map((d,i)=>`<article class="card"><p class="eyebrow">第${i+1}天 · ${dayDate(c.startDate,i)}</p><h2>${PLANS[i].name}</h2><p class="subtitle">${d.closed?'已归档':'尚未归档'} · ${d.outcome==='adjusted'?'已调整安排':'按实际情况记录'}</p><div class="chips"><span class="chip">${total(d)} 大卡${d.meals.length?'（已录入）':'（未录入）'}</span><span class="chip">${d.weight!==''?d.weight+' kg':'未记录体重'}</span><span class="chip">${d.checks.filter(Boolean).length}/3记录点</span></div>${d.meals.map(m=>`<div class="meal-item"><strong>${escapeHtml(m.name)}</strong><span class="inline-tag">${m.kcal} 大卡</span></div>`).join('')}${d.note?`<hr class="divider"><p class="detail-note">${escapeHtml(d.note)}</p>`:''}<button class="quiet-button" data-edit="${c.id}" data-edit-day="${i}">更正这一天的记录</button></article>`).join('')}`;
  return header('YOUR JOURNAL','记录，是为了了解自己。','不计算“燃烧了多少脂肪”，也不根据三天的体重变化承诺减重效果。')+`<section class="section">${data.cycles.length?[...data.cycles].reverse().map(c=>`<article class="card"><button class="archive" data-open="${c.id}"><span><strong>${formatted(c.startDate)} 开始</strong><small>${c.status==='complete'?'三日已完成':c.status==='stopped'?'已停止':'进行中'} · ${c.days.filter(d=>d.closed).length}/3天已归档</small></span><span>查看 →</span></button></article>`).join(''):'<div class="empty"><div class="symbol">▤</div><p>还没有记录。</p><p class="note">从今日开始，或导入自己的备份。</p></div>'}</section><article class="card"><h2>把记录留在自己手里</h2><p class="note">本机存储不是云备份。导出文件可能含饮食与体重，请自行保管。</p><div class="button-row"><button class="secondary" id="export">导出备份</button><button class="secondary" id="import">导入备份</button></div><input type="file" id="backup-file" accept="application/json,.json" class="hidden"><p class="note">导入会合并未出现的计划，同一ID保留本机记录，不覆盖已有记录。</p>${storageBroken?'<button class="danger-button" id="export-raw">导出原始异常数据</button>':''}</article>`;
}
function aboutView(){return header('GOOD TO KNOW','温和记录，安全优先。','三日轻记是饮食安排记录工具，不提供个体医疗建议。')+`<article class="card"><h2>开始前，请先读这里</h2><ul class="help-list"><li>未成年人、孕哺期、有进食障碍史者不应自行尝试断食。</li><li>患糖尿病、使用胰岛素或其他降糖药、体重偏低或有其他疾病时，请先由医生评估；不要自行停药。</li><li>约500大卡是所选方案的参考量，不是通用处方，也不是越低越好。</li><li>明显头晕、心慌、出汗、乏力等不适时停止计划，按需寻求医疗帮助。不要为了完成打卡硬撑。</li><li>没有“不掉肌肉、保证不低血糖、优先减内脏脂肪、三天必瘦”等承诺。</li><li>一轮结束不自动重复，不设置忍饿排行榜或断食挑战。</li></ul><a class="long-link" href="https://www.hopkinsmedicine.org/health/expert-qa/intermittent-fasting-what-is-it-and-how-does-it-work" target="_blank" rel="noopener noreferrer">阅读医学中心的断食适用与风险说明 ↗</a></article><article class="card"><h2>添加到 iPhone 主屏幕</h2><ol class="help-list"><li>用 Safari 打开本应用；微信内请先转到 Safari。</li><li>点分享按钮，再点“添加到主屏幕”。</li><li>以后点主屏幕图标，像 APP 一样打开。</li></ol><p class="note">这是 PWA，不是 App Store 原生应用。首次联网加载后可离线读取缓存。</p></article><article class="card"><h2>固定布局与缩放</h2><p class="note">头部、底部导航固定，内容区域上下滚动。已设置页面缩放限制、手势拦截及16px输入字号，避免常见的双击、双指与输入放大。iOS辅助功能和浏览器设置可能覆盖网页限制，系统级放大无法由网页完全禁止。</p></article><article class="card"><h2>你的记录不会公开</h2><p class="note">网站代码公开，不等于你的记录公开。饮食、体重和备注仅写入当前浏览器本地，没有登录、广告、统计SDK或数据上传接口。</p><p class="note">更换设备、浏览器或域名，清理网站数据，可能导致数据隔离或丢失。定期在“记录”里导出备份；与其他旧APP不自动共享数据。</p></article><article class="card"><h2>关于这个版本</h2><p class="note">版本 ${VERSION} · 一轮三日 · 四页独立导航</p><p class="note">热量由你按包装或实际份量填写，合计为估算值，不是食物自动识别结果。</p></article>`;}
function render(resetScroll=false){
  const tab=['today','plan','records','about'].includes(location.hash.slice(1))?location.hash.slice(1):'today';
  const scroll=$('main').scrollTop;
  $('main').innerHTML=(storageBroken?'<div class="storage-error">本机旧记录读取失败，暂不覆盖。请到“记录”导出原始数据，先不要清理浏览器。</div>':'')+({today:todayView,plan:planView,records:recordsView,about:aboutView}[tab])();
  document.querySelectorAll('[data-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.tab===tab);if(el.dataset.tab===tab)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('main').scrollTop=resetScroll?0:scroll;
  bind(tab);
}
function readDraft(d){const form=$('day-form');if(!form||!form.reportValidity())return false;d.weight=$('weight').value===''?'':Number($('weight').value);d.note=$('day-note').value;d.outcome=$('outcome').value;return true;}
function download(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function bind(tab){
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.go;});
  document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selectedDay=Number(b.dataset.day);render(true);});
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{recordId=b.dataset.open;if(location.hash==='#records')render(true);else location.hash='records';});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const c=data.cycles.find(c=>c.id===b.dataset.edit),i=Number(b.dataset.editDay);
    const html=`<h2>更正第${i+1}天的记录</h2><p class="note">${dayDate(c.startDate,i)} · 仅修改文字和体重，不重新开启计划。</p><form id="correction-form" class="form-stack"><label><span>体重（kg，可选）</span><input id="correct-weight" type="number" min="20" max="400" step=".1" inputmode="decimal" value="${c.days[i].weight}"></label><label><span>身体感受 / 更正说明</span><textarea id="correct-note" maxlength="2000">${escapeHtml(c.days[i].note)}</textarea></label><button class="primary">保存更正</button></form><button id="cancel-correct" class="quiet-button">取消</button>`;
    $('main').innerHTML=html;$('main').scrollTop=0;
    $('cancel-correct').onclick=()=>render(true);
    $('correction-form').onsubmit=e=>{e.preventDefault();if(transact(()=>{c.days[i].weight=$('correct-weight').value===''?'':Number($('correct-weight').value);c.days[i].note=$('correct-note').value;})){toast('更正已保存');render(true);}};
  });
  if($('back-records'))$('back-records').onclick=()=>{recordId=null;render(true);};
  if($('start-form'))$('start-form').onsubmit=e=>{
    e.preventDefault();const startDate=$('start-date').value;
    if(!validDate(startDate)||!$('eligibility').checked)return;
    const c={id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(16).slice(2),startDate,status:'active',days:[newDay(),newDay(),newDay()]};
    if(transact(()=>{data.cycles.push(c);data.activeId=c.id;})){selectedDay=null;toast('已开始一次三日记录');render(true);}
  };
  const c=active();
  if(tab==='today'&&c){
    const i=selectedDay===null?Math.min(2,Math.max(0,elapsed(c.startDate))):selectedDay,d=c.days[i];
    document.querySelectorAll('[data-check]').forEach(b=>b.onclick=()=>{if(transact(()=>{d.checks[Number(b.dataset.check)]=!d.checks[Number(b.dataset.check)];if(d.closed){d.closed=false;c.status='active';}}))render();});
    if($('meal-form'))$('meal-form').onsubmit=e=>{e.preventDefault();const name=$('meal-name').value.trim(),kcal=Number($('meal-kcal').value);if(!name||!Number.isFinite(kcal)||kcal<0||kcal>10000||d.meals.length>=200)return;if(transact(()=>d.meals.push({id:String(Date.now())+'-'+Math.random().toString(16).slice(2),name,kcal}))){render();toast('已添加，热量已合计');}};
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(transact(()=>{d.meals=d.meals.filter(m=>m.id!==b.dataset.remove);}))render();});
    if($('day-form'))$('day-form').onsubmit=e=>{e.preventDefault();if(transact(()=>{if(!readDraft(d))throw new Error('输入有误');})){toast('当日记录已保存');render();}};
    ['weight','day-note','outcome'].forEach(id=>{if($(id))$(id).onchange=()=>{if($('day-form').checkValidity()&&transact(()=>readDraft(d)))toast('当日记录已保存');};});
    if($('close-day'))$('close-day').onclick=()=>{
      if(!d.checks.every(Boolean)){notice('先记录，再归档','请先完成三个记录点。它们只确认你已记录，不要求坚持空腹或吃到某个热量。');return;}
      if(!$('day-form').reportValidity())return;
      if(transact(()=>{readDraft(d);d.closed=true;if(c.days.every(x=>x.closed)){c.status='complete';data.activeId=null;}})){toast(c.status==='complete'?'三日记录已完成，不会自动开始下一轮':'这一天的记录已归档');render();}
    };
    if($('stop-cycle'))$('stop-cycle').onclick=()=>{if(confirm('停止这轮计划？已有记录会保留。身体不适时不必继续打卡。')&&transact(()=>{c.status='stopped';data.activeId=null;})){selectedDay=null;render(true);toast('已停止，记录仍然保留');}};
  }
  if($('export'))$('export').onclick=()=>{download(JSON.stringify(data,null,2),'三日轻记备份-'+localDate()+'.json');toast('已下载备份，请自行保管');};
  if($('export-raw'))$('export-raw').onclick=()=>download(localStorage.getItem(KEY)||'','三日轻记原始数据-'+localDate()+'.json');
  if($('import'))$('import').onclick=()=>$('backup-file').click();
  if($('backup-file'))$('backup-file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>2*1024*1024){notice('无法导入','请选择2MB以内的本应用JSON备份。');return;}
    try{const incoming=sanitize(JSON.parse(await file.text()));let count=0;
      if(transact(()=>{const ids=new Set(data.cycles.map(x=>x.id));incoming.cycles.forEach(c=>{if(ids.has(c.id))return;const copy=JSON.parse(JSON.stringify(c));if(copy.status==='active'&&data.activeId)copy.status='stopped';else if(copy.status==='active')data.activeId=copy.id;data.cycles.push(copy);count++;});})){toast(`已合并${count}轮，已有记录未覆盖`);recordId=null;render();}
    }catch(error){notice('导入失败','文件不是有效备份或内容不完整，现有记录没有改变。');}
  };
}
// Keep the app frame stable. System accessibility zoom can override web controls.
['gesturestart','gesturechange','gestureend'].forEach(name=>document.addEventListener(name,e=>e.preventDefault(),{passive:false}));
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
let lastTap=0;
document.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTap<300&&!e.target.closest('input,textarea,select,button,a,label'))e.preventDefault();lastTap=now;},{passive:false});
document.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault();},{passive:false});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','-','=','0'].includes(e.key))e.preventDefault();});
window.addEventListener('hashchange',()=>render(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
render(true);
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>toast('离线缓存暂不可用，联网记录仍可使用'));}
