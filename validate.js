/* headless validation — stub just enough DOM for the prototype's render path */
const fs=require('fs');
const src=fs.readFileSync('index.html','utf8');
const js=src.split('<script>')[1].split('</script>')[0];

const mkEl=()=>{
  const e={
    innerHTML:'',textContent:'',className:'',style:{},children:[],
    classList:{
      _s:new Set(),
      add(...c){c.forEach(x=>this._s.add(x))},
      remove(...c){c.forEach(x=>this._s.delete(x))},
      toggle(c,f){f===undefined?(this._s.has(c)?this._s.delete(c):this._s.add(c)):(f?this._s.add(c):this._s.delete(c))},
      contains(c){return this._s.has(c)},
    },
    appendChild(c){this.children.push(c);return c},
    querySelector(){return mkEl()},
    querySelectorAll(){return []},
    addEventListener(){},removeEventListener(){},
    getBoundingClientRect(){return {width:320,height:480,top:0,left:0}},
    focus(){},blur(){},remove(){},scrollIntoView(){},
  };
  return e;
};
const cache={};
global.document={
  getElementById(id){return cache[id]||(cache[id]=mkEl())},
  querySelector(){return mkEl()},
  querySelectorAll(){return []},
  createElement(){return mkEl()},
  addEventListener(){},
  body:mkEl(),documentElement:mkEl(),
};
global.window={addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})};
global.requestAnimationFrame=cb=>cb(0);
global.navigator={userAgent:'node'};

/* eval'd const/let stay in eval's scope, so hoist what the checks need onto global */
eval(js+`
;Object.assign(global,{ROWS,VIEWS,TITLES,S,buildList,focusable,activeLinks,
  confirm,back,home,maxFocus,metaStrip,viewHomeNormal,viewHomeAgg,renderStatus,
  renderFooter,curLink,maskPhone,rowsAcct,rowsMenu,rowsDev,
  unbindPending,unbindLeft,UNBIND_TTL,mmss});
`);

let fail=0;
const ok=(n,c,d)=>{console.log(`${c?'  OK ':'  ** '} ${n}${c?'':' — '+d}`);if(!c)fail++};

/* ── 1. every page renders in all three activation states ── */
const pages=[...new Set([...Object.keys(ROWS),...Object.keys(VIEWS)])];
let bad=[];
for(const st of ['online','no-sim','unactivated']){
  S.act=st;
  for(const p of pages){
    S.page=p;S.fx=0;
    try{
      const h=ROWS[p]?buildList(ROWS[p]()):VIEWS[p]();
      if(/undefined|NaN|\[object/.test(h))bad.push(`${p}/${st}:dirty`);
    }catch(e){bad.push(`${p}/${st}:${e.message}`)}
  }
}
S.act='online';
console.log(`1) render ${pages.length} pages x3`);
ok('all render clean',bad.length===0,bad.join(', '));

/* ── 2. reachability via confirm() BFS ── */
console.log('2) reachability');
const seen=new Set(['menu']);
const q=['menu'];
while(q.length){
  const p=q.shift();
  const cnt=ROWS[p]?focusable(ROWS[p]()).length:(p==='clients'?S.clients.length:0);
  for(let i=0;i<Math.max(cnt,1);i++){
    /* a leftover modal from a previous danger row would swallow the next confirm() */
    S.modal=null;
    S.page=p;S.fx=i;S.stack=[{p:'menu',f:0}];
    const before=S.page;
    try{confirm()}catch(e){}
    if(S.page!==before&&!seen.has(S.page)){seen.add(S.page);q.push(S.page)}
  }
}
if(process.env.DBG){
  S.act='online';
  console.log('   menu:',focusable(ROWS.menu()).map(r=>r.t).join(' | '));
  console.log('   dev :',focusable(ROWS.dev()).map(r=>r.t).join(' | '));
  for(const [p,f] of [['menu',5],['dev',0]]){
    S.page=p;S.fx=f;S.stack=[];
    try{confirm();console.log(`   ${p} f=${f} -> ${S.page}`)}
    catch(e){console.log(`   ${p} f=${f} threw ${e.message}`)}
  }
}
const unreach=pages.filter(p=>!seen.has(p));
// these three are entered by the aggregation key / activation state, not confirm()
const expected=['home','home-normal','unact','nosim'];
const bogus=unreach.filter(p=>!expected.includes(p));
ok(`reachable ${seen.size}/${pages.length}`,bogus.length===0,'unexpected: '+bogus.join(','));
console.log(`     (by-design unreachable via confirm: ${unreach.filter(p=>expected.includes(p)).join(',')})`);

/* ── 3. titles present for every non-home page ── */
console.log('3) titles');
const noTitle=pages.filter(p=>!expected.includes(p)&&!TITLES[p]);
ok('all pages titled',noTitle.length===0,noTitle.join(','));

/* ── 4. Modem A/B exclusivity + max 3 paths ── */
console.log('4) modem grouping');
let vio=[];
for(const a of [0,2])for(const b of [1,3])for(const u of [true,false]){
  S.linkA=a;S.linkB=b;S.useUsb=u;S.act='online';
  const L=activeLinks();
  if(L.length>3)vio.push(`A${a}B${b}U${u}:${L.length} paths`);
  const gs=L.map(x=>x.grp);
  if(gs.filter(g=>g==='A').length>1)vio.push(`A${a}B${b}:dup A`);
  if(gs.filter(g=>g==='B').length>1)vio.push(`A${a}B${b}:dup B`);
}
S.linkA=0;S.linkB=1;S.useUsb=true;
ok('A/B exclusive, max 3',vio.length===0,vio.join(', '));

/* ── 5. this round's changes ── */
console.log('5) this round');
ok('no CMCC/CTCC latin operator names',!/CMCC|CTCC|CBN\b/.test(src),'latin operator name still present');
ok('battery fill is a block element',/\.batt-fill\{[^}]*display:block/.test(src),'width/height would not apply');
ok('NFC icon in status bar',/icoNfc/.test(src)&&/S\.wifi\.nfc/.test(src.split('function renderStatus')[1]||''),'missing');
/* v2.6: Wi-Fi indicator joins the right cluster, NFC restyled to the nfc.png N-mark */
S.wifi.on=true;S.wifi.nfc=true;renderStatus();
ok('wifi icon shows in status bar when on',/M5 12\.5/.test(cache.sbar.innerHTML),'missing');
ok('nfc icon is the nfc.png N-mark',/viewBox="0 0 14 24"/.test(cache.sbar.innerHTML),'old arc icon still there');
S.wifi.on=false;renderStatus();
ok('wifi icon hides when wifi off',!/M5 12\.5/.test(cache.sbar.innerHTML),'still shown');
ok('nfc hides with wifi off too',!/viewBox="0 0 14 24"/.test(cache.sbar.innerHTML),'nfc without wifi');
S.wifi.on=true;renderStatus();
ok('guest wifi removed',!/访客/.test(src),'still referenced');
ok('auto-brightness present',/autoBright/.test(src)&&/自动亮度/.test(src),'missing');
ok('disconnect button present',/dc-btn/.test(src)&&/断开/.test(src),'missing');
ok('bind page wording updated',
  /使用松果智联 APP 扫码绑定设备/.test(src)
  &&/松果智联 APP 注册 \/ 登录账号/.test(src)
  &&/APP 内完成内置卡实名认证 \/ 二次认证/.test(src)
  &&/扫码下载松果智联 APP/.test(src)
  &&/在手机应用市场搜索/.test(src),'wording mismatch');
ok('two QR codes on bind page',/qr bind/.test(src)&&/qr dl/.test(src),'missing');
ok('home does not scroll',/nohome/.test(src)&&/overflow:hidden/.test(src),'scroll not disabled');
ok('home overflow alarm wired',/checkFit/.test(src)&&/fitWarn/.test(src)&&/主页溢出/.test(src),
  'nohome would crop silently');

/* ── 6. previous round: editor gone, status bar trimmed, meta strip reworked ── */
console.log('6) previous round');
ok('char editor fully removed',
  !/openEdit|editCycle|editConfirm|viewEdit|CHARSET|S\.edit|\.edt/.test(src),
  'editor leftovers still in source');
ok('no edit page registered',!TITLES.edit&&!VIEWS.edit,'edit route still present');
ok('wifi name row is read-only',
  /\{t:'Wi-Fi 名称',v:S\.wifi\.ssid\}/.test(src),'still has a chevron / edit affordance');

S.act='online';S.agg=true;S.page='home';
renderStatus();
const bar=cache.sbar.innerHTML;
ok('status bar drops the path count',!/路聚合/.test(bar),'still shows N路聚合');
ok('status bar keeps signal bars',/class="sig/.test(bar),'bars missing');

const strip=metaStrip(true);
ok('meta strip shows traffic used/left',/聚合流量/.test(strip)&&/已用\/剩余/.test(strip),'missing');
ok('meta strip shows temperature',/系统温度/.test(strip)&&/°C/.test(strip),'missing');
ok('meta strip shows uptime',/运行时长/.test(strip),'missing');
ok('battery and agg-mode cells dropped from strip',
  !/电量/.test(strip)&&!/带宽叠加/.test(strip),'old cells still there');
ok('remaining traffic is derived, not stored',
  !/data\.(left|remain)/.test(src)&&/S\.data\.total-S\.data\.used/.test(src),
  'two sources of truth for remaining traffic');
S.data.used=99.5;
ok('remaining never goes negative',
  !/-\d/.test(metaStrip(true).match(/dim">([^<]*)</)[1]),'negative remaining shown');
S.data.used=12.4;

const hn=viewHomeNormal();
/* the old 当前链路 *block* is gone; the phrase now belongs to the meta strip label,
   so only the row markup can be asserted absent here */
ok('single-card home has no link row',!/class="lrow/.test(hn),'link block still rendered');
ok('single-card home carries the meta strip',/mstrip/.test(hn)&&/系统温度/.test(hn),'missing');
ok('single-card home keeps the aggregation hint',/聚合键/.test(hn),'hint lost');
ok('single-card badge present',/单卡模式/.test(hn),'badge missing');
ok('agg home still has link rows',/class="lrow/.test(viewHomeAgg()),'link rows lost');
ok('no orphaned .solo rules',!/\.solo\b/.test(src),'dead single-link CSS left behind');
ok('temperature has one source',
  (src.match(/42 °C/g)||[]).length===0&&/S\.temp/.test(src),'hardcoded 42 °C remains');

/* ── 8. this round: footer split, single-card strip cell 1, account page ── */
console.log('8) this round');
/* the reachability BFS walked the SIM list and left defIdx on the USB slot */
S.act='online';S.page='home';S.agg=true;S.fx=0;S.defIdx=0;
renderFooter();
const fAgg=cache.footSlot.innerHTML;
ok('agg home footer drops uptime',!/运行/.test(fAgg),'uptime still in the corner');
ok('agg home footer keeps the OK hint',/设置/.test(fAgg),'menu hint lost');

S.agg=false;S.page='home-normal';renderFooter();
const fSolo=cache.footSlot.innerHTML;
ok('single-card footer shows traffic',
  /已用/.test(fSolo)&&/剩余/.test(fSolo)&&/GB/.test(fSolo),'traffic missing');
ok('single-card footer labels it as pooled traffic',
  /聚合流量/.test(fSolo),'label must read 聚合流量, not bare 流量');
ok('single-card footer drops uptime',!/运行/.test(fSolo),'uptime still there');
S.data.used=140;renderFooter();
ok('footer remaining never negative',!/-\d/.test(cache.footSlot.innerHTML),'negative GB shown');
S.data.used=12.4;S.agg=true;

const hn2=viewHomeNormal();
/* assert on metaStrip(false) directly: viewHomeNormal() never contains the footer,
   so testing the whole screen for "no traffic" would silently pass either way */
const strip1=metaStrip(false);
ok('single-card strip cell 1 is the active link',
  /当前链路/.test(strip1)&&!/聚合流量/.test(strip1),'strip still shows traffic');
ok('active link names slot + operator',/内置-中国移动/.test(hn2),`got ${curLink()}`);
ok('slot label derived from S.sims, not hardcoded',/d\.sl/.test(src),'literal slot label');
ok('agg strip still pools traffic',/聚合流量/.test(metaStrip(true)),'pooled traffic lost');
ok('agg strip keeps uptime',/运行时长/.test(metaStrip(true)),'uptime lost from strip');
ok('single-card badge has no card name',
  /单卡模式<\/span>|>单卡模式</.test(hn2)&&!/单卡模式 · /.test(hn2),'card name still appended');
ok('CJK strip value cannot wrap',/\.mc-v\.zh\{[^}]*white-space:nowrap/.test(src),
  'a second line would break the 410px budget');

ok('account page registered',!!ROWS.acct&&TITLES.acct==='账号设置','route or title missing');
const mrows=focusable(rowsMenu()).map(r=>r.t);
ok('account sits directly below device settings',
  mrows.indexOf('账号设置')===mrows.indexOf('设备设置')+1,mrows.join(' | '));
ok('firmware upgrade left the main menu',!mrows.includes('系统升级'),mrows.join(' | '));
ok('channel selection took its slot',
  mrows[mrows.indexOf('账号设置')+1]==='信道优选',mrows.join(' | '));
/* an entry with no page must not carry a chevron — it would promise a screen */
ok('channel selection promises no page',
  !focusable(rowsMenu()).find(r=>r.t==='信道优选').chev,'chevron on a dead-end row');
S.page='menu';S.fx=mrows.indexOf('信道优选');S.modal=null;
const beforeCh=S.page;confirm();
ok('channel selection stays put and toasts',S.page===beforeCh&&!S.modal,`routed to ${S.page}`);
ok('phone masks the middle 4 digits',maskPhone('13856726721')==='138****6721',
  maskPhone('13856726721'));
ok('phone stored whole, masked at render',
  /phone:'\d{11}'/.test(src)&&/maskPhone/.test(src),'pre-masked copy would drift');
/* 系统升级 moved into 设备设置, one row below 设备信息 */
const dvr=focusable(rowsDev()).map(r=>r.t);
ok('upgrade sits inside device settings',
  dvr.indexOf('系统升级')===dvr.indexOf('设备信息')+1,dvr.join(' | '));
ok('upgrade greys out when offline',
  (S.act='no-sim',!!focusable(rowsDev()).find(r=>r.t==='系统升级').dis),
  'update check needs the network');
S.act='online';
/* the row index shifted the danger rows down by one — confirm() must agree */
S.page='dev';S.fx=dvr.indexOf('系统升级');S.modal=null;S.stack=[{p:'menu',f:5}];confirm();
ok('device settings reaches the upgrade screen',S.page==='upg',`landed on ${S.page}`);
S.page='dev';S.fx=dvr.indexOf('恢复出厂设置');S.modal=null;confirm();
ok('factory reset still guarded after the shift',
  !!S.modal&&/不可撤销/.test(cache.mDesc.textContent),cache.mDesc.textContent);
S.modal=null;

const ar=focusable(rowsAcct());
ok('account page has name / phone / unbind',ar.length===3&&ar[2].t==='解除绑定',
  ar.map(r=>r.t).join(','));
ok('unbind row is marked danger',!!ar[2].danger,'not styled as destructive');
S.page='acct';S.fx=2;S.modal=null;S.acct.unbindAt=0;
confirm();
ok('unbind opens a confirm modal',!!S.modal,'fires without confirmation');
ok('modal states the 10-minute validity',/10 分钟内有效/.test(cache.mDesc.textContent),
  cache.mDesc.textContent);
if(S.modal&&S.modal.onYes){S.modal.onYes();S.modal=null}
ok('unbind only sends a request',unbindPending()===true,'request not recorded');
ok('device stays bound until the APP agrees',
  /等待 APP 端确认/.test(buildList(rowsAcct()))&&!!S.acct.name,'unbound locally');
ok('pending row shows the remaining validity',
  /剩余 09:5\d|剩余 10:00/.test(buildList(rowsAcct())),buildList(rowsAcct()).match(/剩余[^<（]*/)+'');
S.page='acct';S.fx=2;S.modal=null;confirm();
ok('second press re-toasts instead of re-opening',!S.modal,'duplicate request modal');

/* expiry: the request must lapse on its own, not linger as a stuck flag */
S.acct.unbindAt=Date.now()-UNBIND_TTL-1000;
ok('request expires after 10 minutes',!unbindPending(),'still pending past the TTL');
ok('expired row offers a fresh request',
  /向该账号发送解绑请求/.test(buildList(rowsAcct())),'row still says 等待 APP 端确认');
S.page='acct';S.fx=2;S.modal=null;confirm();
ok('a new request can be sent after expiry',!!S.modal,'retry blocked');
if(S.modal&&S.modal.onYes){S.modal.onYes();S.modal=null}
ok('retry records a fresh timestamp',unbindPending(),'timestamp not refreshed');
ok('pending state is derived, not stored',
  !/acct\.pending/.test(src)&&/unbindPending\(\)/.test(src),
  'a stored boolean would survive its own expiry');
S.acct.unbindAt=0;

/* ── 7. client disconnect ── */
console.log('7) clients');
const n0=S.clients.length;
S.page='clients';S.fx=0;confirm();
ok('opens confirm modal',!!S.modal,'no modal');
if(S.modal&&S.modal.onYes){S.modal.onYes();S.modal=null}
ok('removes the device',S.clients.length===n0-1,`${S.clients.length} vs ${n0-1}`);
ok('count stays derived',!/wifi\.clients/.test(src),'stale S.wifi.clients reference');

console.log(`\nsize ${(Buffer.byteLength(src)/1024).toFixed(0)}KB`);
console.log(fail===0?'ALL PASS':`${fail} FAILED`);
process.exit(fail?1:0);
