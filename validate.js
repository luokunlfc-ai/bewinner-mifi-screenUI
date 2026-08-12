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
;Object.assign(global,{ROWS,VIEWS,TITLES,TILES,NOCHROME,S,buildList,focusable,activeLinks,allLinks,
  ethLink,sigRat,confirm,back,home,lock,unlock,startHold,cancelHold,maxFocus,moveFocus,
  viewHomeNormal,viewHomeAgg,viewMenu,viewLock,renderStatus,renderFooter,renderHeader,wifiBar,
  maskPhone,rowsAcct,rowsDev,rowsBright,rowsLinkset,rowsWifi,rowsAggLink,viewClients,
  banClient,disconnectClient,unbanClient,openLinkset,toggleAgg,
  startAggHold,cancelAggHold,
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
    /* linkset renders four different sheets depending on the link id */
    const ids=p==='linkset'?['A','B','U','W']:['A'];
    for(const id of ids){
      S.linkId=id;
      try{
        const h=ROWS[p]?buildList(ROWS[p]()):VIEWS[p]();
        if(/undefined|NaN|\[object/.test(h))bad.push(`${p}/${st}/${id}:dirty`);
      }catch(e){bad.push(`${p}/${st}/${id}:${e.message}`)}
    }
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
  /* menu is the 3x3 grid: probe every tile, not just the first */
  const cnt=p==='menu'?TILES.length
    :ROWS[p]?focusable(ROWS[p]()).length
    :(p==='clients'?S.clients.length:0);
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
  console.log('   tiles:',TILES.map(t=>t.t).join(' | '));
  console.log('   dev :',focusable(ROWS.dev()).map(r=>r.t).join(' | '));
}
const unreach=pages.filter(p=>!seen.has(p));
// homes / onboarding / lock are driven by state and the lock timer, not confirm()
const expected=['home','home-normal','unact','nosim','lock'];
const bogus=unreach.filter(p=>!expected.includes(p));
ok(`reachable ${seen.size}/${pages.length}`,bogus.length===0,'unexpected: '+bogus.join(','));
console.log(`     (by-design unreachable via confirm: ${unreach.filter(p=>expected.includes(p)).join(',')})`);

/* ── 3. titles present for every non-home page ── */
console.log('3) titles');
const noTitle=pages.filter(p=>!expected.includes(p)&&!TITLES[p]);
ok('all pages titled',noTitle.length===0,noTitle.join(','));

/* ── 4. Modem A/B exclusivity + max 4 paths (v3.0: wired joins) ── */
console.log('4) link model');
let vio=[];
for(const a of [0,2])for(const b of [1,3])for(const up of [true,false])for(const ep of [true,false]){
  S.linkA=a;S.linkB=b;S.eth.plugged=ep;
  S.sims[4].st=up?'ok':'empty';          // USB plugged ⇔ its card is present
  S.connA=true;S.connB=true;S.act='online';
  const L=activeLinks();
  if(L.length>4)vio.push(`A${a}B${b}U${up}E${ep}:${L.length} paths`);
  const gs=L.map(x=>x.grp);
  if(gs.filter(g=>g==='A').length>1)vio.push(`A${a}B${b}:dup A`);
  if(gs.filter(g=>g==='B').length>1)vio.push(`A${a}B${b}:dup B`);
  /* v3.3: USB and wired auto-join only when actually plugged in */
  if(!ep&&L.some(x=>x.wired))vio.push(`E${ep}:wired leaks in`);
  if(up&&!L.some(x=>x.grp==='U'))vio.push(`U${up}:usb missing`);
  if(!up&&L.some(x=>x.grp==='U'))vio.push(`U${up}:usb leaks in`);
}
S.linkA=0;S.linkB=1;S.sims[4].st='ok';S.eth.plugged=true;
ok('A/B exclusive, max 4, wired gated',vio.length===0,vio.join(', '));
ok('default state aggregates 4 paths',activeLinks().length===4,activeLinks().length+' paths');
S.connA=false;
ok('数据连接 off drops the path from the total but keeps it listed',
  aggTotals().n===3&&activeLinks().some(l=>l.grp==='A'&&l.conn===false),
  'closed link still counted, or missing from the list');
S.connA=true;

/* ── 5. status bar & link rows ── */
console.log('5) status bar');
ok('no CMCC/CTCC latin operator names',!/CMCC|CTCC|CBN\b/.test(src),'latin operator name still present');
ok('battery fill is a block element',/\.batt-fill\{[^}]*display:block/.test(src),'width/height would not apply');
S.wifi.on=true;S.wifi.nfc=true;renderStatus();
ok('wifi icon shows in status bar when on',/M5 12\.5/.test(cache.sbar.innerHTML),'missing');
ok('nfc icon is the nfc.png N-mark',/viewBox="0 0 14 24"/.test(cache.sbar.innerHTML),'old arc icon still there');
S.wifi.on=false;renderStatus();
ok('wifi icon hides when wifi off',!/M5 12\.5/.test(cache.sbar.innerHTML),'still shown');
ok('nfc hides with wifi off too',!/viewBox="0 0 14 24"/.test(cache.sbar.innerHTML),'nfc without wifi');
S.wifi.on=true;
/* v3.3: the status bar no longer carries any signal cluster — time sits left */
S.act='online';S.agg=true;renderStatus();
const barRat=cache.sbar.innerHTML;
ok('status bar has no signal cluster',!/sigrat/.test(barRat),barRat);
ok('status bar puts the time on the left',
  new RegExp(`^<span[^>]*>${S.time}<\\/span>`).test(barRat),barRat);
const aggHtml=viewHomeAgg();
ok('link rows carry signal clusters',
  (aggHtml.match(/sigrat/g)||[]).length===activeLinks().length,'link rows missing sig');
S.act='nosim';renderStatus();
ok('status bar stays clean offline',!/sigrat|class="rat"/.test(cache.sbar.innerHTML),cache.sbar.innerHTML);
S.act='online';

/* ── 5b. WiFi settings: 多频合一 + per-band split (v3.5) ── */
console.log('5b) wifi settings');
S.wifi.band=true;S.wifi.band5.on=true;S.wifi.band24.on=true;
const wf=focusable(rowsWifi());
ok('多频合一 sits directly above NFC 分享',
  wf.findIndex(r=>r.t==='多频合一')+1===wf.findIndex(r=>r.t==='NFC 分享'),
  wf.map(r=>r.t||'sect').join(' | '));
ok('band on shows one merged 名称/密码 pair',
  wf.filter(r=>/名称|密码/.test(r.t)).length===2,wf.map(r=>r.t).join(' | '));
ok('wifi page no longer lists 接入设备',!wf.some(r=>r.t==='接入设备'),'still routes to clients');
S.wifi.band=false;
const wf2=focusable(rowsWifi());
ok('5 GHz section sits above 2.4 GHz',
  rowsWifi().findIndex(r=>'sect' in r&&r.sect==='5 GHz')
  <rowsWifi().findIndex(r=>'sect' in r&&r.sect==='2.4 GHz'),
  rowsWifi().map(r=>r.sect||r.t||'').join(' | '));
ok('each band carries its own switch',
  wf2.some(r=>r.t==='5 GHz Wi-Fi'&&r.sw!==undefined)
  &&wf2.some(r=>r.t==='2.4 GHz Wi-Fi'&&r.sw!==undefined),'band switch missing');
ok('name/pwd labels drop the band prefix',
  wf2.filter(r=>/名称|密码/.test(r.t)).length===4
  &&!wf2.some(r=>r.t==='2.4G Wi-Fi 名称'||r.t==='5G Wi-Fi 名称'),
  wf2.map(r=>r.t||'sect').join(' | '));
S.page='wifi';S.fx=wf2.findIndex(r=>r.t==='Wi-Fi 密码'&&r.band==='5');
S.modal=null;S.stack=[{p:'menu',f:0}];confirm();
ok('5G pwd row opens its own sheet',S.page==='pwd'&&S.pwdLink==='5',`${S.page}/${S.pwdLink}`);
S.page='wifi';S.fx=wf2.findIndex(r=>r.t==='5 GHz Wi-Fi');
S.modal=null;S.stack=[{p:'menu',f:0}];S.wifi.band5.on=true;confirm();
ok('band switch flips',S.wifi.band5.on===false,'band switch no-op');
S.wifi.band5.on=true;
ok('off band hides its name/pwd rows',
  (S.wifi.band5.on=false,!focusable(rowsWifi()).some(r=>r.band==='5'))
  &&(S.wifi.band5.on=true,true),'off band rows still rendered');
S.wifi.band=true;S.page='wifi';
S.fx=wf.findIndex(r=>r.t==='Wi-Fi 密码');S.modal=null;S.stack=[{p:'menu',f:0}];confirm();
ok('tapping merged password opens the pwd sheet',S.page==='pwd'&&S.pwdLink==='u',`${S.page}/${S.pwdLink}`);

/* ── 6. meta strip & home layout ── */
console.log('6) homes & meta strip');
ok('guest wifi removed',!/访客/.test(src),'still referenced');
ok('bind page is single-QR with the 5-step guide',
  /扫码下载松果智联APP或绑定设备/.test(src)
  &&/松果智联 APP 注册 \/ 登录账号/.test(src)
  &&/购买套餐或插入外置卡/.test(src),'wording mismatch');
ok('bind page carries exactly one QR',
  /class="qr bind"/.test(src)&&!/qr dl/.test(src),'dual-code layout or missing code');
ok('home does not scroll',/nohome/.test(src)&&/overflow:hidden/.test(src),'scroll not disabled');
ok('home overflow alarm wired',/checkFit/.test(src)&&/fitWarn/.test(src)&&/主页溢出/.test(src),
  'nohome would crop silently');
ok('remaining traffic is derived, not stored',
  !/data\.(left|remain)/.test(src)&&/S\.data\.total-S\.data\.used/.test(src),
  'two sources of truth for remaining traffic');
const hn=viewHomeNormal();
/* v3.0: the normal home LISTS every live link (was: no link rows at all).
   v3.3: USB/wired rows render without the tap affordance — no config */
ok('normal home lists every live link',
  (hn.match(/class="lrow/g)||[]).length===allLinks().length,'link list wrong');
ok('normal home rows: only modem links are tappable',
  !/data-link="U"|data-link="W"/.test(hn)
  &&/class="lrow tap" data-link="A"/.test(hn),'USB/wired should not open config');
/* v3.1: the meta strip is gone — its slot carries the big aggregation button */
ok('meta strip fully removed from both homes',
  !/mstrip|metaStrip/.test(hn+viewHomeAgg())&&!/function metaStrip/.test(src),'strip still rendered');
/* v3.2: the button is hold-2s — markup carries a progress fill + hold label */
ok('agg toggle is the big hold button, not the badge pill',
  /class="bigagg" id="aggBtn"/.test(hn)&&/class="bigagg on" id="aggBtn"/.test(viewHomeAgg())
  &&/id="aggFill"/.test(hn)&&/长按开启聚合/.test(hn)&&/长按关闭聚合/.test(viewHomeAgg())
  &&!/abtn/.test(src),'hold button markup wrong or old badge pill still there');
ok('normal badge is 智能单网',/智能单网/.test(hn)&&!/普通模式|单卡模式/.test(src),'badge wrong or old mode name left in source');
ok('mode chip centered on both homes',/\.hrow\{[^}]*justify-content:center/.test(src.replace(/\s+/g,'')),'hrow not centered');
ok('agg home lists the two modem links always',
  /data-link="A"/.test(aggHtml)&&/data-link="B"/.test(aggHtml),'modem links lost');
ok('built-in cards read 内置-移动 / 内置-电信',
  /内置-移动/.test(aggHtml)&&/内置-电信/.test(aggHtml),'built-in label rule wrong');
ok('agg home has tappable link rows',/class="lrow tap"/.test(aggHtml),'link rows lost');
S.connA=false;const aggHtmlOff=viewHomeAgg();S.connA=true;
ok('agg home 数据连接-off modem shows -- rates',/↑--/.test(aggHtmlOff),'off state not shown');
ok('agg home still lists the off modem row',/内置-移动/.test(aggHtmlOff),'off row dropped');
ok('temperature has one source',
  (src.match(/42 °C/g)||[]).length===0&&/S\.temp/.test(src),'hardcoded 42 °C remains');
ok('no orphaned .solo rules',!/\.solo\b/.test(src),'dead single-link CSS left behind');
/* v3.1: home Wi-Fi password is masked until the eye is tapped */
ok('home wifi password masked by default',
  /\*\*\*\*\*\*\*\*/.test(hn)&&!hn.includes(S.wifi.pwd),'plaintext leaks onto home');
ok('eye toggle present and reveals on demand',
  /id="pwEye"/.test(hn)&&(S.showPwd=true,wifiBar().includes(S.wifi.pwd))&&(S.showPwd=false,true),
  'eye missing or reveal broken');

/* ── 7. client disconnect / ban (v3.5: MAC below name, 断开 before 禁用) ── */
console.log('7) clients');
S.banned=[];
const vc=viewClients();
ok('clients show MAC below the device name',/[0-9A-F]{2}(:[0-9A-F]{2}){5}/.test(vc),'mac line missing');
ok('clients keep the 禁用 / 断开 actions',/data-act="ban"/.test(vc)&&/data-act="dc"/.test(vc),'action buttons missing');
ok('断开 button sits before 禁用',vc.indexOf('data-act="dc"')<vc.indexOf('data-act="ban"'),'button order wrong');
ok('no ip field survives',!/\bip\b/.test(src),'stale ip reference');
ok('clients page carries the banned-list section',/禁用设备 · 0/.test(vc),'banned section missing');
const n0=S.clients.length;
S.page='clients';S.fx=0;confirm();
ok('opens confirm modal',!!S.modal,'no modal');
if(S.modal&&S.modal.onYes){S.modal.onYes();S.modal=null}
ok('removes the device',S.clients.length===n0-1,`${S.clients.length} vs ${n0-1}`);
ok('count stays derived',!/wifi\.clients/.test(src),'stale S.wifi.clients reference');
const n1=S.clients.length;
banClient(0);
ok('ban opens a confirm modal',!!S.modal,'no modal');
if(S.modal&&S.modal.onYes){S.modal.onYes();S.modal=null}
ok('ban disconnects into 禁用设备',S.clients.length===n1-1&&S.banned.length===1,
  `${S.clients.length} connected / ${S.banned.length} banned`);
ok('banned device listed with 恢复',/data-act="unban"/.test(viewClients()),'banned row missing');
ok('banned entry carries the mac',!!S.banned[0]&&!!S.banned[0].mac&&!S.banned[0].ip,'mac lost on ban');
unbanClient(0);
ok('restore returns the device',S.banned.length===0,'still banned');
S.page='menu';S.fx=0;

/* ── 8. footers, account page, grid order ── */
console.log('8) footers & account');
S.act='online';S.page='home';S.agg=true;S.fx=0;S.defIdx=0;
renderFooter();
const fAgg=cache.footSlot.innerHTML;
ok('agg home footer drops uptime',!/运行/.test(fAgg),'uptime still in the corner');
/* v3.1: settings entry moved to a left-swipe; BOTH homes show pooled traffic */
ok('home footers have no settings button',!/fSet/.test(src),'gear button still in source');
ok('agg home footer shows pooled traffic too',
  /聚合流量/.test(fAgg)&&/已用/.test(fAgg)&&/剩余/.test(fAgg),'traffic missing on agg home');
S.agg=false;S.page='home-normal';renderFooter();
const fSolo=cache.footSlot.innerHTML;
ok('normal footer shows pooled traffic',
  /聚合流量/.test(fSolo)&&/已用/.test(fSolo)&&/剩余/.test(fSolo),'traffic missing or mislabeled');
S.data.used=140;renderFooter();
/* assert on the captured traffic figure itself, not the whole footer markup
   (SVG path data elsewhere has bitten this assertion before) */
ok('footer remaining never negative',
  !/-/.test(cache.footSlot.innerHTML.match(/剩余 <b>([^<]*)</)[1]),'negative GB shown');
S.data.used=12.4;S.agg=true;

ok('account page registered',!!ROWS.acct&&TITLES.acct==='账号设置','route or title missing');
/* the grid replaced the list menu — TILES order is the menu order now */
const tNames=TILES.map(t=>t.t);
ok('grid has exactly 9 tiles',TILES.length===9,tNames.join(' | '));
ok('数据卡 removed from the grid',!tNames.includes('数据卡'),tNames.join(' | '));
ok('接入设备 is a first-level tile',
  tNames.indexOf('接入设备')===1&&TILES[1].dst==='clients',tNames.join(' | '));
ok('account sits directly below device settings',
  tNames.indexOf('账号设置')===tNames.indexOf('设备设置')+1,tNames.join(' | '));
ok('firmware upgrade left the grid',!tNames.includes('系统升级'),tNames.join(' | '));
ok('channel selection took its slot',
  tNames[tNames.indexOf('账号设置')+1]==='信道优选',tNames.join(' | '));
ok('grid tile 3 is the link-device page',
  TILES[2].t==='聚合链路'&&TILES[2].dst==='agglink'&&TITLES.agglink==='聚合链路设备',
  TILES[2].t+' → '+TILES[2].dst);
/* a tile with no page must not route anywhere */
S.act='online';S.page='menu';S.fx=tNames.indexOf('信道优选');S.modal=null;S.stack=[];
const beforeCh=S.page;confirm();
ok('channel selection stays put and toasts',S.page===beforeCh&&!S.modal,`routed to ${S.page}`);
ok('phone masks the middle 4 digits',maskPhone('13856726721')==='138****6721',
  maskPhone('13856726721'));
ok('phone stored whole, masked at render',
  /phone:'\d{11}'/.test(src)&&/maskPhone/.test(src),'pre-masked copy would drift');
const dvr=focusable(rowsDev()).map(r=>r.t);
ok('upgrade sits inside device settings',
  dvr.indexOf('系统升级')===dvr.indexOf('设备信息')+1,dvr.join(' | '));
ok('upgrade greys out when offline',
  (S.act='no-sim',!!focusable(rowsDev()).find(r=>r.t==='系统升级').dis),
  'update check needs the network');
S.act='online';
S.page='dev';S.fx=dvr.indexOf('系统升级');S.modal=null;S.stack=[{p:'menu',f:5}];confirm();
ok('device settings reaches the upgrade screen',S.page==='upg',`landed on ${S.page}`);
S.page='dev';S.fx=dvr.indexOf('恢复出厂设置');S.modal=null;confirm();
ok('factory reset still guarded after the shift',
  !!S.modal&&/不可撤销/.test(cache.mDesc.textContent),cache.mDesc.textContent);
S.modal=null;

const ar=focusable(rowsAcct());
ok('account page has name / phone / unbind',ar.length===3&&ar[2].t==='解除绑定',
  ar.map(r=>r.t).join(','));
S.page='acct';S.fx=2;S.modal=null;S.acct.unbindAt=0;
confirm();
ok('unbind opens a confirm modal',!!S.modal,'fires without confirmation');
ok('modal states the 10-minute validity',/10 分钟内有效/.test(cache.mDesc.textContent),
  cache.mDesc.textContent);
if(S.modal&&S.modal.onYes){S.modal.onYes();S.modal=null}
ok('unbind only sends a request',unbindPending()===true,'request not recorded');
ok('pending row shows the remaining validity',
  /剩余 09:5\d|剩余 10:00/.test(buildList(rowsAcct())),buildList(rowsAcct()).match(/剩余[^<（]*/)+'');
S.page='acct';S.fx=2;S.modal=null;confirm();
ok('second press re-toasts instead of re-opening',!S.modal,'duplicate request modal');
S.acct.unbindAt=Date.now()-UNBIND_TTL-1000;
ok('request expires after 10 minutes',!unbindPending(),'still pending past the TTL');
S.page='acct';S.fx=2;S.modal=null;confirm();
ok('a new request can be sent after expiry',!!S.modal,'retry blocked');
if(S.modal&&S.modal.onYes){S.modal.onYes();S.modal=null}
ok('pending state is derived, not stored',
  !/acct\.pending/.test(src)&&/unbindPending\(\)/.test(src),
  'a stored boolean would survive its own expiry');
S.acct.unbindAt=0;

/* ── 9. link page structure (v3.4: 聚合模式 entry + page removed) ── */
console.log('9) link page');
ok('old agg hub page removed',!ROWS.agg&&!TITLES.agg&&!/rowsAgg\b|case 'agg'/.test(src),
  'hub still registered');
ok('数据卡 page removed (smart-select moved to APP)',
  !ROWS.sim&&!TITLES.sim&&!/rowsSim|smart:/.test(src),'sim page still registered');
ok('聚合模式 page removed',!ROWS.aggmode&&!TITLES.aggmode&&!/rowsAggMode|MODES|aggmode/.test(src),
  'aggmode still registered');
S.act='online';
S.page='menu';S.fx=2;S.stack=[];S.modal=null;confirm();
ok('grid tile 3 routes to the link page',S.page==='agglink',`landed on ${S.page}`);
const alr=focusable(ROWS.agglink());
ok('link page lists the four paths',
  alr.length===4&&['链路 1','链路 2','USB 外扩','有线网络'].every((t,i)=>alr[i].t===t),
  alr.map(r=>r.t).join(' | '));
ok('聚合模式 entry is gone from the link page',
  !alr.some(r=>r.t==='聚合模式'),alr.map(r=>r.t).join(' | '));
/* v3.3: the wired row is an info row — no config, reports the cable state */
S.eth.plugged=false;
const wrow=focusable(ROWS.agglink()).find(r=>r.t==='有线网络');
ok('wired row reports unplugged',/未插入网线/.test(wrow.s)&&!wrow.chev,'row not informative');
S.eth.plugged=true;
S.page='home';S.fx=0;

/* ── 10. header back / home slots (v3.1: moved off the footer) ── */
console.log('10) header back/home');
S.act='online';S.agg=true;
let backBad=[];
for(const p of Object.keys(ROWS)){
  S.page=p;S.fx=0;S.linkId='A';const m=maxFocus();
  S.fx=m-2;S.stack=[{p:'menu',f:0}];S.modal=null;S.brightEdit=false;
  try{confirm()}catch(e){backBad.push(p+':'+e.message);continue}
  if(S.page!=='menu')backBad.push(p+'->'+S.page);
}
ok('every list page backs out from its back slot',backBad.length===0,backBad.join(','));
/* the settings grid has NO nav slots — its focus range is exactly the 9 tiles */
S.page='menu';S.fx=0;
ok('menu has no back/home slots',maxFocus()===TILES.length,'grid should not carry nav slots');
renderHeader();
ok('menu header shows no nav buttons',
  !/id="fBack"/.test(cache.hdrSlot.innerHTML)&&!/id="fHome"/.test(cache.hdrSlot.innerHTML),
  cache.hdrSlot.innerHTML);
S.page='dev';S.fx=0;renderHeader();
ok('subpage header has tappable back/home buttons',
  /id="fBack"/.test(cache.hdrSlot.innerHTML)&&/id="fHome"/.test(cache.hdrSlot.innerHTML),
  cache.hdrSlot.innerHTML);
renderFooter();
ok('subpage footer is gone',cache.footSlot.innerHTML==='','nav should live in the header only');
S.fx=maxFocus()-2;renderHeader();
ok('back button lights up on its slot',cache.hdrSlot.innerHTML.indexOf('hb-btn fx')<cache.hdrSlot.innerHTML.indexOf('主页'),cache.hdrSlot.innerHTML);
S.fx=0;
ok('brightness is a list page',!!ROWS.bright&&!VIEWS.bright,'registration wrong');
S.page='bright';S.fx=0;S.autoBright=false;S.brightEdit=false;S.modal=null;S.stack=[{p:'dev',f:0}];
confirm();
ok('tap enters brightness adjust',S.brightEdit===true,'did not enter');
const b0=S.bright;
moveFocus(1);
ok('↑↓ tunes inside adjust mode',S.bright===Math.min(100,b0+10),`${b0} -> ${S.bright}`);
confirm();
ok('tap exits brightness adjust',S.brightEdit===false,'did not exit');
S.autoBright=true;S.page='bright';S.fx=0;S.modal=null;confirm();
ok('auto-brightness blocks adjust with a reason',
  S.brightEdit===false&&/自动亮度/.test(cache.toast.textContent),cache.toast.textContent);
S.autoBright=false;
S.diag=null;S.page='diag';S.fx=maxFocus()-2;S.stack=[{p:'menu',f:3}];S.modal=null;confirm();
ok('diag back slot returns',S.page==='menu',S.page);
S.diag=null;
S.upg=null;S.page='upg';S.fx=maxFocus()-2;S.stack=[{p:'dev',f:4}];S.modal=null;confirm();
ok('upg back slot returns',S.page==='dev',S.page);
S.upg=null;
S.page='pwd';S.fx=maxFocus()-2;S.stack=[{p:'wifi',f:3}];S.modal=null;confirm();
ok('pwd backs to wifi',S.page==='wifi',S.page);
S.page='devinfo';S.fx=0;const dm=maxFocus();
S.fx=dm-1;S.stack=[{p:'dev',f:3},{p:'menu',f:5}];S.modal=null;confirm();
ok('home slot jumps straight home',S.page==='home'&&S.stack.length===0,`${S.page} stack=${S.stack.length}`);

/* ── 11. v3.0: touch, lock screen, grid menu, per-link settings ── */
console.log('11) v3.0 touch & lock');
ok('physical deck fully removed',
  !/aggr-key|dpad|bAggr|class="deck"|class="btn /.test(src),'deck markup/CSS still in source');
ok('no key-hint copy left in footers',!/点击确认键|按聚合键|OK<\/b>/.test(src),'stale key hints');
ok('rows are tappable (data-fi)',/data-fi="\$\{fi\}"/.test(src)||/data-fi=/.test(src),'missing tap routing');
/* lock screen */
S.act='online';S.agg=true;S.page='home';S.stack=[];
lock();
ok('lock() enters the lock screen',S.page==='lock',S.page);
/* pin every path on so the 4-way readout is deterministic (BFS may have flipped 数据连接) */
S.connA=true;S.connB=true;S.sims[4].st='ok';S.eth.plugged=true;S.agg=true;
const lk=viewLock();
ok('lock shows the aggregation state',/多网聚合 · 4 路/.test(lk),lk.match(/lk-title">([^<]*)/)?.[1]);
ok('lock shows the connected device count',/已连接 \d+ 台设备/.test(lk),'missing');
ok('lock shows the hold-to-unlock hint',/长按屏幕解锁/.test(lk),'missing');
ok('lock has the hexagon ring',/L112\.5 36/.test(lk),'hexagon path missing');
ok('lock has the hold progress ring',/id="lkRing"/.test(lk),'ring missing');
renderHeader();renderFooter();
ok('lock hides header and footer',
  cache.hdrSlot.innerHTML===''&&cache.footSlot.innerHTML==='','chrome leaked onto lock screen');
unlock();
ok('unlock() returns home',S.page==='home',S.page);
S.act='unactivated';S.page='unact';
lock();
ok('lock is suppressed before activation',S.page==='unact',S.page);
S.act='online';S.page='home';
/* aggregation toggle button on BOTH homes (v3.2: hold-2s labels) */
ok('agg home has the off button',
  /id="aggBtn"/.test(viewHomeAgg())&&/长按关闭聚合/.test(viewHomeAgg()),'missing');
ok('normal home has the on button',
  /id="aggBtn"/.test(viewHomeNormal())&&/长按开启聚合/.test(viewHomeNormal()),'missing');
ok('the old 聚合键 hint bar is gone',!/聚合键/.test(viewHomeNormal()),'hint still there');
/* grid menu */
S.act='online';
const gm=viewMenu();
ok('grid renders 9 tappable tiles',(gm.match(/data-tile="/g)||[]).length===9,'tile count wrong');
S.act='no-sim';
const gmOff=viewMenu();
ok('network-dependent tiles grey out offline',
  (gmOff.match(/tile dis/g)||[]).length===2,'agg/diag tiles still live offline');
S.act='online';
/* home link rows route into the link settings page (v3.3: modem rows only —
   USB/wired have no config and no data-link) */
ok('agg home exposes link A',/data-link="A"/.test(aggHtml),'row missing');
ok('agg home exposes link B',/data-link="B"/.test(aggHtml),'row missing');
ok('agg home exposes no config for USB/wired',
  !/data-link="U"|data-link="W"/.test(aggHtml),'USB/wired should not open config');
S.page='home';S.stack=[];openLinkset('B');
ok('tapping a link opens its settings',S.page==='linkset'&&S.linkId==='B',`${S.page}/${S.linkId}`);
/* per-link settings sheet — modem groups only */
S.linkId='A';
const rA=focusable(rowsLinkset());
ok('modem link offers 数据连接 + 内置-移动/插拔卡',
  rA.length===3&&rA[0].sw!==undefined&&rA[1].t==='内置-移动'&&rA[2].t==='插拔卡',
  rA.map(r=>r.t).join(' | '));
ok('数据连接 describes the no-data consequence',
  /无数据连接/.test(rowsLinkset()[0].s),'wording wrong');
S.page='linkset';S.linkId='A';S.fx=0;S.modal=null;S.stack=[{p:'agglink',f:0}];
const wasA=S.connA;confirm();
ok('数据连接 switch flips',S.connA===!wasA,'no-op');
S.fx=2;confirm();
ok('picking 插拔卡 moves the group',S.linkA===2,`linkA=${S.linkA}`);
S.linkA=0;
S.linkId='B';
const rB=focusable(rowsLinkset());
ok('empty 插拔卡 is disabled',rB[2].dis===true,'empty card still selectable');
S.linkId='U';
ok('USB has no config sheet',rowsLinkset().length===0,'USB sheet should be empty');
S.linkId='W';
ok('wired has no config sheet',rowsLinkset().length===0,'wired sheet should be empty');
S.page='home';S.connA=true;S.connB=true;S.eth.plugged=true;S.sims[4].st='ok';
/* hold-to-unlock machinery */
ok('hold-to-unlock wired up',
  /startHold/.test(src)&&/cancelHold/.test(src)&&/pointerdown/.test(src)&&/keyup/.test(src),
  'missing hold handlers');
ok('idle timer locks from home',
  /lock\(\);return/.test(src.split('function resetIdle')[1]||''),'home idle does not lock');
/* v3.1: swipe navigation */
ok('left-swipe on homes opens settings',
  /S\.page==='home'\|\|S\.page==='home-normal'\|\|S\.page==='nosim'\)&&dx<0\)go\('menu'\)/.test(src.replace(/\s+/g,'')),
  'swipe-to-settings missing');
ok('right-swipe on settings goes home',
  /S\.page==='menu'&&dx>0\)home\(\)/.test(src.replace(/\s+/g,'')),'swipe-to-home missing');
ok('swipe suppresses the trailing click',
  /swiped/.test(src)&&/pointerup/.test(src),'a swipe would also fire a row tap');
ok('Escape demos back for the keyboard path',/Escape/.test(src),'missing');
/* v3.2: swipes survive a release outside the screen frame */
ok('pointer captured on down (off-screen release still navigates)',
  /setPointerCapture/.test(src),'a swipe leaving the frame never fires pointerup');
/* v3.2: aggregation bar is hold-2s with JS-driven progress */
ok('agg hold wired to pointerdown, not click',
  /pointerdown',e=>\{[\s\S]{0,500}startAggHold\(\)/.test(src)
  &&!/if\(ab\)\{toggleAgg/.test(src),'tap on the bar would flip aggregation');
ok('agg hold is 1s with a ticking fill',
  /\},1000\)/.test(src)&&/aggTick/.test(src)&&/aggFill/.test(src),
  'hold timeout or progress fill missing');
ok('early release cancels with a hint toast',
  /cancelAggHold\(!?swiped\)/.test(src.replace(/\s+/g,''))&&/长按 1 秒/.test(src),
  'cancel path or hint missing');
/* v3.3: onboarding footers have no action buttons; status bar is clean */
S.page='unact';renderFooter();
ok('unact footer has no left action',
  !/bk-btn|id="fBoot"/.test(cache.footSlot.innerHTML),cache.footSlot.innerHTML);
S.page='nosim';renderFooter();
ok('nosim footer has no left action',
  !/bk-btn|id="fBoot"/.test(cache.footSlot.innerHTML),cache.footSlot.innerHTML);
S.page='home';
ok('no dead fBoot wiring left',!/id="fBoot"/.test(src),'fBoot still referenced');
/* v3.2 follow-up: capture retargets the trailing click to #scr — the handler
   must recover the real target or every delegated route (tiles, rows…) dies */
ok('click recovers the real target under pointer capture',
  /elementFromPoint/.test(src)&&/tgt\.closest\('\[data-tile\]'\)/.test(src),
  'captured clicks would all route to #scr and die');

console.log(`\nsize ${(Buffer.byteLength(src)/1024).toFixed(0)}KB`);
console.log(fail===0?'ALL PASS':`${fail} FAILED`);
process.exit(fail?1:0);
