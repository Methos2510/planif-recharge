/* Planif Recharge Libre — mode hors ligne : bornes de France dans le téléphone, cartes pré-chargées, installation, sauvegarde */
(function(){
const RES_ID='eb76d20a-8501-400e-b336-d85724de5435';
const DS_URL='https://www.data.gouv.fr/api/1/datasets/base-nationale-des-irve-infrastructures-de-recharge-pour-vehicules-electriques/';
const TC='pl-tiles-v1',CELL=0.25;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OFF=window.OFF={ready:false,meta:null};
/* ---------- IndexedDB ---------- */
let idb=null;
function openDb(){return new Promise((ok,ko)=>{const r=indexedDB.open('planifLibre',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('kv');d.createObjectStore('cells')};r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error)})}
const rq=r=>new Promise((ok,ko)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error)});
const st=(n,m)=>idb.transaction(n,m||'readonly').objectStore(n);
const kvGet=k=>rq(st('kv').get(k));
const kvSet=(k,v)=>rq(st('kv','readwrite').put(v,k));
const cellKey=(la,lo)=>Math.floor(la/CELL)+','+Math.floor(lo/CELL);
/* ---------- lecture locale des bornes ---------- */
OFF.fill=async function(b){
  if(!OFF.ready||!idb)return null;
  const s=b.getSouth?b.getSouth():b.south,n=b.getNorth?b.getNorth():b.north,w=b.getWest?b.getWest():b.west,e=b.getEast?b.getEast():b.east;
  const i0=Math.floor(s/CELL),i1=Math.floor(n/CELL),j0=Math.floor(w/CELL),j1=Math.floor(e/CELL);
  if((i1-i0+1)*(j1-j0+1)>600)return null;
  const ver=OFF.meta.ver,jobs=[];
  for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const c=ver+'|'+i+','+j+'|';jobs.push(rq(st('cells').getAll(IDBKeyRange.bound(c,c+'￿'))))}
  const res=await Promise.all(jobs);let n2=0;
  for(const chunks of res)for(const arr of chunks)for(const r of arr){
    const sid=r[0];let S=stations[sid];
    if(!S){S=stations[sid]={id:sid,nom:r[1]||'Borne',op:r[2]||'',ens:r[3]||'',adr:r[4]||'',cp:r[5]||'',ville:r[6]||'',lat:r[7],lon:r[8],horaires:r[9]||'',tarif:r[10]||'',cb:r[11],gratuit:r[12],acces:r[13]||'',pdc:{}};n2++}
    for(const p of r[14]){if(!S.pdc[p[0]])S.pdc[p[0]]={id:p[0],kw:p[1],ccs:!!(p[2]&1),t2:!!(p[2]&2),cha:!!(p[2]&4),ef:!!(p[2]&8)}}}
  return n2};
/* ---------- téléchargement de la base nationale ---------- */
function splitCsv(line){const out=[];let f='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'){if(line[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){out.push(f);f=''}else f+=c}out.push(f);return out}
const qcount=s=>{let n=0,i=-1;while((i=s.indexOf('"',i+1))>=0)n++;return n};
OFF.download=async function(prog,ctl){
  const meta=await (await fetch(DS_URL)).json();
  let res=(meta.resources||[]).find(r=>r.id===RES_ID)||(meta.resources||[]).find(r=>/derni.re version/i.test(r.title||'')&&r.format==='csv')||(meta.resources||[]).find(r=>r.format==='csv');
  if(!res)throw new Error('Fichier introuvable');
  const total=res.filesize||110e6,ver='v'+Date.now(),old=OFF.meta&&OFF.meta.ver;
  let wl=null;try{wl=await navigator.wakeLock.request('screen')}catch(e){}
  try{
  const resp=await fetch(res.url,{signal:ctl.signal});if(!resp.ok)throw new Error('HTTP '+resp.status);
  const rd=resp.body.getReader(),dec=new TextDecoder('utf-8');
  let carry='',pend='',H=null,ix={},bytes=0,seq=0,nSt=0,nPdc=0,cur=null;const buf=new Map();let bufN=0;
  const flush=async()=>{if(!buf.size)return;const os=st('cells','readwrite');const t=os.transaction;for(const [c,arr] of buf){os.put(arr,ver+'|'+c+'|'+String(++seq).padStart(7,'0'))}await new Promise((ok,ko)=>{t.oncomplete=ok;t.onerror=()=>ko(t.error)});buf.clear();bufN=0};
  const fin=()=>{if(!cur)return;const c=cellKey(cur[7],cur[8]);let a=buf.get(c);if(!a){a=[];buf.set(c,a)}a.push(cur);bufN++;nSt++;cur=null};
  const onRow=row=>{
    if(!H){H=row;H.forEach((h,i)=>ix[h]=i);return}
    const g=n=>{const i=ix[n];return i==null?'':row[i]};
    const lat=+g('consolidated_latitude'),lon=+g('consolidated_longitude');if(!isFinite(lat)||!isFinite(lon)||(!lat&&!lon))return;
    const nom=g('nom_station'),sid=g('id_station_itinerance')||(nom+'@'+lat.toFixed(5)+','+lon.toFixed(5));
    if(!cur||cur[0]!==sid){fin();const tr=v=>v==='true'||v==='True'||v==='1';
      cur=[sid,nom||g('nom_enseigne'),g('nom_operateur'),g('nom_enseigne'),g('adresse_station'),g('consolidated_code_postal'),g('consolidated_commune'),lat,lon,g('horaires').slice(0,100),g('tarification').slice(0,150),tr(g('paiement_cb')),tr(g('gratuit')),g('condition_acces'),[]]}
    const T=v=>v==='true'||v==='True'||v==='1';
    const pid=g('id_pdc_itinerance')||g('id_pdc_local')||(sid+'#'+cur[14].length);
    cur[14].push([pid,+g('puissance_nominale')||0,(T(g('prise_type_combo_ccs'))?1:0)|(T(g('prise_type_2'))?2:0)|(T(g('prise_type_chademo'))?4:0)|(T(g('prise_type_ef'))?8:0)]);nPdc++};
  const lines=txt=>{const L=txt.split('\n');carry=L.pop();for(let ln of L){if(ln.endsWith('\r'))ln=ln.slice(0,-1);if(pend){pend+='\n'+ln;if(qcount(pend)%2===0){onRow(splitCsv(pend));pend=''}continue}
      if(ln.indexOf('"')<0){onRow(ln.split(','));continue}
      if(qcount(ln)%2===1){pend=ln;continue}onRow(splitCsv(ln))}};
  let last=0;
  for(;;){const {value,done}=await rd.read();if(done)break;bytes+=value.length;lines(carry+dec.decode(value,{stream:true}));
    if(bufN>6000)await flush();
    if(bytes-last>1.5e6){last=bytes;prog(Math.min(0.99,bytes/total),nSt);await sleep(0)}}
  if(carry)lines(carry+'\n');fin();await flush();
  const m={ver,date:Date.now(),stations:nSt,pdc:nPdc,src:(res.title||'')+'',maj:res.last_modified||''};
  await kvSet('meta',m);OFF.meta=m;OFF.ready=true;
  if(old){const os=st('cells','readwrite');os.delete(IDBKeyRange.bound(old+'|',old+'|￿'))}
  prog(1,nSt);return m}
  finally{try{wl&&wl.release()}catch(e){}}};
/* ---------- cartes ---------- */
const TILE=(z,x,y)=>`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const tx=(lon,z)=>Math.floor((lon+180)/360*2**z),ty=(lat,z)=>{const r=lat*Math.PI/180;return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**z)};
function bboxOf(lat,lon,rkm){const dl=rkm/111,dn=rkm/(111*Math.cos(lat*Math.PI/180));return{s:lat-dl,n:lat+dl,w:lon-dn,e:lon+dn}}
function tilesList(bb,zmin,zmax){const out=[];for(let z=zmin;z<=zmax;z++){const x0=tx(bb.w,z),x1=tx(bb.e,z),y0=ty(bb.n,z),y1=ty(bb.s,z);for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)out.push([z,x,y])}return out}
OFF.countTiles=(bb,zmin,zmax)=>{let n=0;for(let z=zmin;z<=zmax;z++)n+=(tx(bb.e,z)-tx(bb.w,z)+1)*(ty(bb.s,z)-ty(bb.n,z)+1);return n};
OFF.tiles=async function(bb,zmin,zmax,prog,ctl){
  const list=tilesList(bb,zmin,zmax);if(list.length>20000)throw new Error('Zone trop grande');
  const cache=await caches.open(TC);let i=0,done=0,fail=0;
  const w=async()=>{while(i<list.length&&!ctl.stop){const [z,x,y]=list[i++];const u=TILE(z,x,y);
    try{if(!(await cache.match(u))){const r=await fetch(u,{mode:'cors'});if(r.ok)await cache.put(u,r);else fail++;await sleep(45)}}catch(e){fail++;if(!navigator.onLine){ctl.stop=true;break}}
    done++;if(done%20===0)prog(done,list.length,fail)}};
  await Promise.all([w(),w(),w()]);prog(done,list.length,fail);return{done,fail,total:list.length}};
OFF.clearTiles=async()=>{try{await caches.delete(TC)}catch(e){}};
OFF.persist=async()=>{try{return navigator.storage&&navigator.storage.persist?await navigator.storage.persist():false}catch(e){return false}};
/* ---------- itinéraire estimé (sans réseau) ---------- */
OFF.approxRoute=function(places){
  const R=6371,rad=x=>x*Math.PI/180,dk=(a,b,c,d)=>{const dl=rad(c-a),dn=rad(d-b);const h=Math.sin(dl/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
  const pts=[],wpKm=[0];let km=0;
  for(let i=0;i<places.length-1;i++){const a=places[i],b=places[i+1],d=dk(a.lat,a.lon,b.lat,b.lon)*1.3,n=Math.max(1,Math.ceil(d));
    for(let t=(i?1:0);t<=n;t++)pts.push({lat:a.lat+(b.lat-a.lat)*t/n,lon:a.lon+(b.lon-a.lon)*t/n,km:km+d*t/n});km+=d;wpKm.push(km)}
  return{pts,cls:{A:km*.55,N:km*.2,D:km*.25,X:0},dist:km,min:km/78*60,toll:false,wpKm,approx:true}};
/* ---------- état de la connexion + statuts mis en mémoire ---------- */
function net(){try{setSync(navigator.onLine?'🟢':'📴')}catch(e){}}
addEventListener('online',()=>{net();paint()});addEventListener('offline',()=>{net();paint()});
try{const j=JSON.parse(localStorage.getItem('pl.dyn')||'null');if(j)for(const k in j)dynCache[k]={etat:j[k][0],occ:j[k][1],ts:j[k][2]}}catch(e){}
function saveDyn(){try{const ids=Object.keys(dynCache);if(!ids.length)return;const keep=ids.slice(-4000),o={};for(const k of keep){const d=dynCache[k];o[k]=[d.etat,d.occ,d.ts]}localStorage.setItem('pl.dyn',JSON.stringify(o))}catch(e){}}
setInterval(()=>{if(navigator.onLine)saveDyn()},45000);addEventListener('pagehide',saveDyn);
/* ---------- installation ---------- */
let defer=null;addEventListener('beforeinstallprompt',e=>{e.preventDefault();defer=e;paint()});
const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
/* ---------- panneau « Hors ligne » dans Réglages ---------- */
const fmtMo=b=>b>1e9?(b/1e9).toFixed(1).replace('.',',')+' Go':Math.round(b/1e6)+' Mo';
let ctl=null,busy=null,est=null,pr={};
async function estimate(){try{est=await navigator.storage.estimate()}catch(e){est=null}paint()}
function ctrCenter(w){const it=DB.items.dest_prefs,h=it&&!it.deleted&&it.data&&it.data.home;if(w==='home'&&h)return[h.lat,h.lon];const c=map?map.getCenter():{lat:46.6,lng:2.4};return[c.lat,c.lng]}
function paint(){const el=document.getElementById('offCard');if(!el)return;
  const m=OFF.meta,age=m?Math.round((Date.now()-m.date)/86400000):0;
  const bar=(k)=>pr[k]!=null?`<div style="background:rgba(255,255,255,.1);border-radius:8px;height:10px;margin:8px 0"><div style="width:${Math.round(pr[k]*100)}%;height:10px;border-radius:8px;background:linear-gradient(90deg,var(--blue),var(--pink))"></div></div><div class="muted" style="font-size:13px">${pr[k+'t']||''}</div>`:'';
  const bk=+localStorage.getItem('pl.lastBk')||0,bkAge=bk?Math.round((Date.now()-bk)/86400000):null;
  el.innerHTML=`<h2>📴 MODE HORS LIGNE</h2>
  <p class="muted">${navigator.onLine?'🟢 Tu es en ligne.':'📴 Tu es hors ligne : l\'appli fonctionne avec ce qui est enregistré ci-dessous.'} Fais ces préparations <b>une fois, en wifi</b>.</p>
  <div class="vehCard"><div class="vh">🔌 1. Bornes de France</div>${m?`<div>✅ <b>${m.stations.toLocaleString('fr-FR')}</b> stations enregistrées <span class="muted">· téléchargées il y a ${age} j${age>30?' — <b style="color:var(--orange)">à mettre à jour</b>':''}</span></div>`:'<div class="muted">Pas encore téléchargées : la liste des bornes de France entière (environ 110 Mo à télécharger, 40 Mo enregistrés).</div>'}
   <div class="row" style="margin-top:8px">${busy==='st'?'<button class="btn g" id="offStop">⏹ Annuler</button>':`<button class="btn p" id="offDl">${m?'⟳ Mettre à jour':'⬇️ Télécharger les bornes'}</button>`}</div>${bar('st')}</div>
  <div class="vehCard"><div class="vh">🗺️ 2. Cartes</div><div class="muted" style="font-size:13px">Autour de :</div><div class="row" style="margin:4px 0"><select id="offWhere"><option value="home">mon domicile</option><option value="map">le centre de la carte affichée</option></select><select id="offSize"><option value="25">25 km (rapide)</option><option value="50" selected>50 km</option><option value="100">100 km</option><option value="fr">Toute la France (vue d'ensemble)</option></select></div>
   <div class="row">${busy==='ti'?'<button class="btn g" id="offStop">⏹ Annuler</button>':'<button class="btn p" id="offTl">⬇️ Télécharger la carte</button>'}<button class="btn g" id="offTc">🗑️ Vider les cartes</button></div>${bar('ti')}
   <div class="muted" style="font-size:12px;margin-top:6px">Toutes les cartes que tu regardes sont aussi gardées automatiquement. Fond de carte OpenStreetMap : téléchargement modéré et limité à de petites zones, comme le demande leur règlement.</div></div>
  <div class="vehCard"><div class="vh">💾 3. Sauvegarde</div><div class="muted">Tes véhicules, favoris, historique et réglages sont <b>uniquement dans ce téléphone</b>. ${bkAge==null?'<b style="color:var(--orange)">Aucune sauvegarde faite.</b>':'Dernière sauvegarde il y a '+bkAge+' j.'+(bkAge>30?' <b style="color:var(--orange)">Pense à en refaire une.</b>':'')}</div>
   <div class="row" style="margin-top:8px"><button class="btn" onclick="document.getElementById('bkExport').click()">⬇️ Sauvegarder mes données</button><button class="btn g" id="offPers">🛡️ Protéger les données</button></div></div>
  <div class="row" style="margin-top:10px"><button class="btn" id="offShare">📤 Partager l\'appli</button></div>
  ${(defer&&!standalone())?'<div class="row" style="margin-top:10px"><button class="btn p" id="offInst">📲 Installer l\'appli sur ce téléphone</button></div>':''}
  ${(ios&&!standalone())?'<p class="muted" style="margin-top:10px">📲 <b>iPhone / iPad</b> : dans Safari, touche le bouton Partager <b>⎙</b> puis « Sur l\'écran d\'accueil ».</p>':''}
  ${(!ios&&!defer&&!standalone())?'<p class="muted" style="margin-top:10px">📲 <b>Android</b> : dans Chrome, menu ⋮ puis « Installer l\'application ».</p>':''}
  <p class="muted" style="font-size:12px;margin-top:8px">${est&&est.quota?`Espace utilisé : ${fmtMo(est.usage||0)} sur ${fmtMo(est.quota)} disponibles.`:''}</p>`;
  const $$=id=>document.getElementById(id);
  const stop=$$('offStop');if(stop)stop.onclick=()=>{if(ctl){ctl.stop=true;try{ctl.abort()}catch(e){}}};
  const dl=$$('offDl');if(dl)dl.onclick=async()=>{if(!navigator.onLine)return toast('Il faut du réseau pour télécharger');busy='st';ctl=new AbortController();pr.st=0;pr.stt='Connexion…';paint();
    try{const m=await OFF.download((p,n)=>{pr.st=p;pr.stt=`${Math.round(p*100)} % — ${n.toLocaleString('fr-FR')} stations lues`;const b=$$('offCard');if(b)paintBar('st')},ctl);pr.st=null;busy=null;toast('✅ '+m.stations.toLocaleString('fr-FR')+' bornes enregistrées');try{if(map){loadedBox=null;loadArea(true)}}catch(e){}}
    catch(e){pr.st=null;busy=null;toast(e&&e.name==='AbortError'?'Téléchargement annulé':'⚠ Téléchargement interrompu : réessaie en wifi')}
    estimate()};
  const tl=$$('offTl');if(tl)tl.onclick=async()=>{if(!navigator.onLine)return toast('Il faut du réseau pour télécharger');
    const sz=$$('offSize').value,[la,lo]=ctrCenter($$('offWhere').value);let bb,z0,z1;
    if(sz==='fr'){bb={s:41.2,n:51.2,w:-5.3,e:9.7};z0=5;z1=10}else{bb=bboxOf(la,lo,+sz);z0=6;z1=13}
    const n=OFF.countTiles(bb,z0,z1);if(!confirm(`Télécharger environ ${n.toLocaleString('fr-FR')} images de carte (≈ ${fmtMo(n*22e3)}) ?`))return;
    busy='ti';ctl={stop:false,abort(){}};pr.ti=0;paint();
    try{const r=await OFF.tiles(bb,z0,z1,(d,t,f)=>{pr.ti=d/t;pr.tit=`${d.toLocaleString('fr-FR')} / ${t.toLocaleString('fr-FR')} images${f?' ('+f+' ratées)':''}`;paintBar('ti')},ctl);toast(ctl.stop?'Carte interrompue (la partie reçue est gardée)':'✅ Carte enregistrée')}catch(e){toast('⚠ '+(e.message||'Échec'))}
    pr.ti=null;busy=null;estimate()};
  const tc=$$('offTc');if(tc)tc.onclick=async()=>{if(confirm('Supprimer toutes les cartes enregistrées ?')){await OFF.clearTiles();toast('Cartes supprimées');estimate()}};
  const pe=$$('offPers');if(pe)pe.onclick=async()=>{const ok=await OFF.persist();toast(ok?'🛡️ Données protégées par le téléphone':'Le navigateur n\'a pas confirmé : fais surtout des sauvegardes')};
  const sh=$$('offShare');if(sh)sh.onclick=()=>{const url=location.origin+location.pathname.replace(/index\.html$/,'');if(navigator.share)navigator.share({title:'Planif Recharge',text:'Planificateur de recharge pour voiture électrique : sans compte, fonctionne hors ligne.',url}).catch(()=>{});else{try{navigator.clipboard.writeText(url);toast('🔗 Lien copié')}catch(e){toast(url)}}};
  const ins=$$('offInst');if(ins)ins.onclick=async()=>{try{defer.prompt();await defer.userChoice}catch(e){}defer=null;paint()}}
function paintBar(k){const el=document.getElementById('offCard');if(!el)return;const bars=el.querySelectorAll('div[style*="linear-gradient"]');const i=k==='st'?0:bars.length-1;const b=bars[i];if(b)b.style.width=Math.round(pr[k]*100)+'%';const t=b&&b.parentNode&&b.parentNode.nextElementSibling;if(t)t.textContent=pr[k+'t']||''}
function mount(){const sec=document.getElementById('t-reglages');if(!sec||document.getElementById('offCard'))return;const c=document.createElement('div');c.className='card';c.id='offCard';sec.insertBefore(c,sec.children[0]);paint();estimate()}
/* ---------- démarrage ---------- */
(async()=>{try{idb=await openDb();const m=await kvGet('meta');if(m){OFF.meta=m;OFF.ready=true}}catch(e){console.warn('IndexedDB',e)}
  net();mount();
  if(OFF.ready&&typeof map!=='undefined'&&map){try{loadedBox=null;loadArea(true)}catch(e){}}
  const bk=+localStorage.getItem('pl.lastBk')||0;setTimeout(()=>{try{if(Object.keys(DB.items).length>4&&bk&&Date.now()-bk>30*86400000)toast('💾 Pense à sauvegarder tes données (Réglages)')}catch(e){}},4000);
  document.addEventListener('click',e=>{if(e.target&&e.target.dataset&&e.target.dataset.t==='reglages')setTimeout(()=>{mount();paint()},50)});
})();
})();
