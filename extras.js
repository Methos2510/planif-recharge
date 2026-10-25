/* Planif Recharge — extras v2.0.0 : prix du jour Electra (créneaux), bornes favorites enrichies (commodités, notes, photos), import depuis G6 Suivi */
(function(){
'use strict';
const T=()=>window.TR;
const st=document.createElement('style');st.textContent=`
.xbox{margin-top:8px;padding:10px 12px;border:1px solid var(--line);border-left:3px solid var(--pink);border-radius:12px;background:var(--panel2);box-shadow:0 0 10px rgba(255,0,255,.08)}
.xbox .xc{display:flex;flex-wrap:wrap;gap:6px}
.xbox .xc label{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(0,0,0,.35);font-size:14px;cursor:pointer;color:var(--text)}
.xbox .xc label:has(input:checked){border-color:var(--pink);color:var(--pink);box-shadow:0 0 8px rgba(255,0,255,.35)}
.xbox textarea,#modalBody textarea{width:100%;min-height:44px;margin-top:8px;background:rgba(0,0,0,.45);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-family:inherit;font-size:15px;outline:none;resize:vertical}
.xbox textarea:focus{border-color:var(--blue);box-shadow:0 0 8px rgba(0,243,255,.3)}
.xbox textarea::placeholder{color:var(--mute)}
.xbox .xo{margin-top:6px;font-size:13px;color:var(--mute)}
`;document.head.appendChild(st);
const COMM=[['toilettes','🚻','Toilettes'],['restauration','🍽️','Restauration'],['commerce','🛒','Commerce'],['cafe','☕','Café / boisson'],['abri','☂️','Abrité'],['ouvert24','🌙','24 h/24']];
const PUBLIC={c:.39,s:.49,p:.61},NIV={c:{n:'creuses',col:'#7CFF6B'},s:{n:'standard',col:'#00F0FF'},p:{n:'pointe',col:'#FF2D95'}};
const JN=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],ORDRE=[1,2,3,4,5,6,0];
const rad=x=>x*Math.PI/180;
function dk(a,b,c,d){const dl=rad(c-a),dn=rad(d-b);const h=Math.sin(dl/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(h))}
const sansAcc=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const pidOf=sid=>'photo_'+String(sid).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,140);
const favId=sid=>'fav_'+String(sid).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,140);

/* ---------- données Electra ---------- */
const EL=()=>{const it=DB.items.electra;return it&&!it.deleted&&it.data?it.data:{profils:{},remise:{remise:0,carte:null}}};
const ELsave=d=>putItem('electra','electra',d);
function hDuJour(P,j){const J=P.jours||{};if(J[j])return J[j];for(let d=1;d<7;d++){const k=(j-d+7)%7;if(J[k])return J[k]}return P.h||'s'.repeat(24)}
function profilPour(s){if(!s||s.lat==null)return null;const E=EL().profils||{};let best=null,bd=.3;
  for(const k in E){const m=k.split(',');if(m.length<2)continue;const d=dk(+m[0],+m[1],s.lat,s.lon);if(d<bd){bd=d;best=E[k];best._k=k}}return best}
window.TR_electraPrix=function(cat,s){
  const t=T();if(cat!=='Electra'||!t||!t.tArr||!s)return null;
  const P=profilPour(s);if(!P)return null;
  const d=new Date(t.tArr),niv=hDuJour(P,d.getDay())[d.getHours()]||'s';
  const r=(window.TR_remiseAbos&&TR_remiseAbos())||EL().remise||{remise:0,carte:null};
  return{eur:Math.max(0,Math.round((PUBLIC[niv]-(r.remise||0))*100)/100),carte:r.carte||null,src:'créneau',niv,fs:0}};
/* heure d'arrivée estimée à un km donné (roulage + charges précédentes) */
window.TR_t0=()=>depart();
window.TR_tAt=function(km,stops,R){
  const t0=depart();const roul=(km/Math.max(20,R.kmh||80))*60;const ch=(stops||[]).reduce((a,s)=>a+(s.min||0)+(s.detMin||0),0);
  return t0+(roul+ch)*60000};
function depart(){const el=document.getElementById('tDep');if(el&&el.value){const d=new Date(el.value);if(!isNaN(d))return d.getTime()}return Date.now()}
window.TR_hr=function(s){if(!s.tArr)return '';const d=new Date(s.tArr),h=String(d.getHours()).padStart(2,'0')+'h'+String(d.getMinutes()).padStart(2,'0');
  const j=JN[d.getDay()];const n=s.prix&&s.prix.niv?NIV[s.prix.niv]:null;
  return ` · 🕒 ${j} <b>${h}</b>${n?` · <b style="color:${n.col}">tarif ${n.n}</b>`:''}`};

/* ---------- éditeur de créneaux ---------- */
let ed=null;
window.TR_elEdit=function(key,nom){
  const E=EL();const P=(E.profils||{})[key]||{nom:nom||'Borne Electra',jours:{},maj:null};
  ed={key,P:JSON.parse(JSON.stringify(P)),j:new Date().getDay()};if(!ed.P.jours)ed.P.jours={};
  if(!ed.P.jours[ed.j])ed.P.jours[ed.j]=hDuJour(ed.P,ed.j);
  edDraw()};
function edDraw(){
  const P=ed.P,h=P.jours[ed.j]||'s'.repeat(24);
  const tabs=ORDRE.map(j=>`<button class="btn s ${j===ed.j?'p':''}" onclick="TR_elJ(${j})">${JN[j]}${P.jours[j]?'':' ·'}</button>`).join(' ');
  const bars=h.split('').map((n,i)=>`<div onclick="TR_elB(${i})" title="${i}h–${i+1}h : ${NIV[n].n}" style="flex:1;min-width:11px;cursor:pointer;text-align:center"><div style="height:${22+58*PUBLIC[n]/PUBLIC.p}px;background:${NIV[n].col};border-radius:3px 3px 0 0;margin-top:${80-(22+58*PUBLIC[n]/PUBLIC.p)}px"></div><span style="font-size:9px">${i}</span></div>`).join('');
  openModal(`<h2>⚡ CRÉNEAUX ELECTRA</h2><p class="muted">${esc(P.nom)} — touche une heure pour changer : <span style="color:${NIV.c.col}">creuses</span> → <span style="color:${NIV.s.col}">standard</span> → <span style="color:${NIV.p.col}">pointe</span>.</p>
  <div style="margin:6px 0">${tabs}</div><div style="display:flex;gap:2px;align-items:flex-start;height:100px">${bars}</div>
  <p class="muted" style="font-size:12px">Prix public : creuses ${PUBLIC.c.toFixed(2)} · standard ${PUBLIC.s.toFixed(2)} · pointe ${PUBLIC.p.toFixed(2)} €/kWh, moins ta remise de carte (${(EL().remise||{}).remise||0} €).</p>
  <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap"><button class="btn s" onclick="TR_elCopie('sem')">Copier sur Lun→Ven</button><button class="btn s" onclick="TR_elCopie('tous')">Copier sur toute la semaine</button><button class="btn p" onclick="TR_elOk()">✅ Enregistrer</button><button class="btn s g" onclick="closeModal()">Annuler</button></div>`)}
window.TR_elJ=j=>{ed.j=j;if(!ed.P.jours[j])ed.P.jours[j]=hDuJour(ed.P,j);edDraw()};
window.TR_elB=i=>{const h=ed.P.jours[ed.j].split(''),o=['c','s','p'];h[i]=o[(o.indexOf(h[i])+1)%3];ed.P.jours[ed.j]=h.join('');edDraw()};
window.TR_elCopie=m=>{const h=ed.P.jours[ed.j];(m==='sem'?[1,2,3,4,5]:[0,1,2,3,4,5,6]).forEach(j=>ed.P.jours[j]=h);edDraw();toast('Copié')};
window.TR_elOk=()=>{const E=EL();const pr=Object.assign({},E.profils||{});ed.P.maj=new Date().toISOString().slice(0,10);ed.P.edit=Date.now();pr[ed.key]=ed.P;ELsave({profils:pr,remise:E.remise||{remise:0,carte:null}});closeModal();toast('✅ Créneaux enregistrés');if(T()&&T().route&&window.TR_replan)TR_replan()};
window.TR_elSuppr=k=>{const E=EL(),pr=Object.assign({},E.profils);delete pr[k];ELsave({profils:pr,remise:E.remise});if(window.renderTarifs)renderTarifs()};

/* ---------- commodités ---------- */
const INDICES=[[['aire de','aire d','autoroute','relais'],['toilettes','restauration','commerce','cafe','ouvert24']],
 [['leclerc','carrefour','auchan','intermarch','super u','hyper u','cora','casino','lidl','aldi','monoprix','geant','systeme u'],['toilettes','commerce','cafe']],
 [['mcdonald','burger king','quick','kfc','subway','brioche dor','paul '],['toilettes','restauration','cafe']]];
const OSM_REG=[['amenity',['toilets'],['toilettes']],['amenity',['restaurant','fast_food','pub'],['restauration']],['amenity',['cafe','bar','ice_cream'],['cafe']],['amenity',['fuel'],['commerce']],['shop',['supermarket','convenience','mall','department_store'],['commerce']],['shop',['bakery'],['commerce','cafe']]];
const OSM_TAGS=['amenity:toilets','amenity:restaurant','amenity:fast_food','amenity:cafe','amenity:bar','amenity:pub','amenity:fuel','shop:supermarket','shop:convenience','shop:bakery','shop:mall','shop:department_store'];
const okey=(la,lo)=>(+la).toFixed(4)+','+(+lo).toFixed(4);
const osmLire=()=>{try{return JSON.parse(localStorage.getItem('pr.osm')||'{}')}catch(e){return{}}};
const osmDe=s=>{const c=osmLire(),v=c[okey(s.lat,s.lon)];return v&&Date.now()-v.t<30*864e5?v:null};
function favDe(s){if(!s||s.lat==null)return null;let b=null,bd=.15;for(const i of items('fav')){const d=i.data;if(d.lat==null)continue;const x=dk(d.lat,d.lon,s.lat,s.lon);if(x<bd){bd=x;b=i}}return b}
function deduites(s){const t=sansAcc((s.nom||'')+' '+(s.adr||'')+' '+(s.op||'')+' '+(s.ens||''));const o=new Set();INDICES.forEach(([m,d])=>{if(m.some(x=>t.includes(x)))d.forEach(c=>o.add(c))});return[...o]}
const prefs=()=>{const it=DB.items.cprefs;return it&&!it.deleted&&it.data?it.data:{want:[],val:4}};
window.TR_bonus=function(s){const W=prefs();if(!W.want||!W.want.length)return 0;
  const f=favDe(s),ver=new Set((f&&f.data.commod)||[]),o=osmDe(s),osm=new Set((o&&o.c)||[]),de=new Set(deduites(s));
  let n=0;W.want.forEach(k=>{if(ver.has(k)||osm.has(k))n+=1;else if(de.has(k))n+=.5});return n*(+W.val||0)};
window.TR_osm=async function(lat,lon,sid){
  const btn=document.getElementById('osmB_'+sid);if(btn)btn.textContent='⏳ recherche…';
  try{const u='https://photon.komoot.io/reverse?lat='+lat+'&lon='+lon+'&radius=1&limit=30&lang=fr&'+OSM_TAGS.map(t=>'osm_tag='+encodeURIComponent(t)).join('&');
    const r=await fetch(u);if(!r.ok)throw 0;const j=await r.json();const com=new Set(),lieux=[],vus=new Set();
    (j.features||[]).forEach(f=>{const p=f.properties,g=f.geometry;if(!p||!g)return;let cl=[];OSM_REG.forEach(([k,v,d])=>{if(p.osm_key===k&&v.includes(p.osm_value))cl=cl.concat(d)});if(!cl.length)return;
      const m=Math.round(dk(lat,lon,g.coordinates[1],g.coordinates[0])*1000);if(m>200)return;cl.forEach(c=>com.add(c));const nom=(p.name||'').trim()||cl[0];if(vus.has(nom))return;vus.add(nom);lieux.push({nom,m})});
    lieux.sort((a,b)=>a.m-b.m);const c=osmLire();c[okey(lat,lon)]={c:[...com],l:lieux.slice(0,6),t:Date.now()};localStorage.setItem('pr.osm',JSON.stringify(c));
    if(T()&&T().plan)rendre_();else if(window.renderFavs)renderFavs()}catch(e){toast('Recherche indisponible, réessaie plus tard');if(btn)btn.textContent='🔎 Commodités autour'}};
function rendre_(){if(window.TR_replan)TR_replan()}
const chip=(k,on,sup)=>{const c=COMM.find(x=>x[0]===k);return c?`<span class="pill" style="${on?'':'opacity:.55;'}${sup?'border-style:dashed':''}">${c[1]} ${c[2]}${sup?' ?':''}</span>`:''};
window.TR_extraHtml=function(s){
  const f=favDe(s),ver=(f&&f.data.commod)||[],o=osmDe(s),osm=((o&&o.c)||[]).filter(c=>!ver.includes(c)),de=deduites(s).filter(c=>!ver.includes(c)&&!osm.includes(c));
  let h='';const all=[...ver.map(k=>chip(k,1)),...osm.map(k=>chip(k,1)),...de.map(k=>chip(k,1,1))].join(' ');
  if(all)h+=`<div style="margin-top:4px">${all}</div>`;
  if(o&&o.l&&o.l.length)h+=`<div class="muted" style="font-size:12px">À proximité : ${o.l.map(x=>esc(x.nom)+' ('+x.m+' m)').join(' · ')}</div>`;
  if(f&&f.data.note)h+=`<div style="margin-top:3px">📝 ${esc(f.data.note)}</div>`;
  if(f&&f.data.g6&&window.TR_photoThumb&&!(DB.items[pidOf(s.id)]))h+=`<div style="margin-top:4px">${TR_photoThumb(f.data.sid)}</div>`;
  const sid=String(s.id).replace(/[^A-Za-z0-9_]/g,'_');
  h+=`<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"><button class="btn s" id="osmB_${sid}" title="Cherche toilettes, restauration, commerces à moins de 200 m (OpenStreetMap)" onclick="TR_osm(${s.lat},${s.lon},'${sid}')">🔎 Commodités autour</button>`;
  if(s.cat==='Electra'||/electra/i.test((s.op||'')+(s.ens||'')))h+=`<button class="btn s" title="Saisir les créneaux heures creuses / standard / pointe de cette borne" onclick="TR_elEdit('${s.lat.toFixed(4)},${s.lon.toFixed(4)}','${String(s.nom||'Electra').replace(/['\\]/g,' ')}')">✏️ Créneaux Electra${profilPour(s)?' ✓':''}</button>`;
  return h+'</div>'};

/* ---------- bornes favorites : commodités + note ---------- */
window.TR_favExtra=function(i){
  const d=i.data,ver=d.commod||[];
  const ch=COMM.map(([k,ic,l])=>`<label><input type="checkbox" ${ver.includes(k)?'checked':''} onchange="TR_favC('${i.id}','${k}',this.checked)">${ic} ${l}</label>`).join('');
  const o=osmDe(d),osm=((o&&o.c)||[]).filter(c=>!ver.includes(c));
  return `<div class="xbox"><div class="xc">${ch}</div>${osm.length?`<div class="xo">Repérées sur OpenStreetMap : ${osm.map(k=>chip(k,1)).join(' ')}</div>`:''}
   <textarea placeholder="Ma note sur cette borne (accès, ambiance, conseils…)" onchange="TR_favN('${i.id}',this.value)">${esc(d.note||'')}</textarea>
   <div style="margin-top:8px"><button class="btn s" onclick="TR_osm(${d.lat},${d.lon},'f')">🔎 Commodités autour</button></div></div>`};
window.TR_favC=(id,k,on)=>{const it=DB.items[id];if(!it)return;const d=Object.assign({},it.data),c=new Set(d.commod||[]);on?c.add(k):c.delete(k);d.commod=[...c];putItem(id,'fav',d,false)};
window.TR_favN=(id,v)=>{const it=DB.items[id];if(!it)return;putItem(id,'fav',Object.assign({},it.data,{note:v}),false);toast('📝 Note enregistrée')};

/* ---------- import depuis G6 Suivi ---------- */
window.TR_importExtras=function(j){
  let nEl=0,nFav=0;
  if(j.electraProfils&&typeof j.electraProfils==='object'){const E=EL(),pr=Object.assign({},E.profils||{});
    for(const k in j.electraProfils){const n=j.electraProfils[k],l=pr[k];if(!l||(l.edit&&!n.edit&&l.edit>0&&false)||!l.edit){pr[k]=n;nEl++}}
    ELsave({profils:pr,remise:j.electraRemise||E.remise||{remise:0,carte:null}})}
  else if(j.electraRemise){const E=EL();ELsave({profils:E.profils||{},remise:j.electraRemise})}
  (j.stationsFav||[]).forEach(f=>{if(!f||f.lat==null||f.lng==null)return;
    const sid='g6:'+f.cle,id=favId(sid),cur=DB.items[id];
    const exist=favDe({lat:f.lat,lon:f.lng});
    const tgt=exist&&exist.id!==id?exist:cur&&!cur.deleted?cur:null;
    const kw=+f.kw||50,n=Math.max(1,+f.nbPrises||2);
    if(tgt){const d=Object.assign({},tgt.data);d.commod=[...new Set([...(d.commod||[]),...(f.commodites||[])])];if(f.note&&!d.note)d.note=f.note;putItem(tgt.id,'fav',d,false);
      if(f.photo&&!DB.items[pidOf(tgt.data.sid)])putItem(pidOf(tgt.data.sid),'photo',{sid:tgt.data.sid,img:f.photo})}
    else{putItem(id,'fav',{sid,nom:f.titre||'Station',op:f.reseau||'',ens:'',adr:f.adresse||'',lat:+f.lat,lon:+f.lng,pdc:Array.from({length:n},(_,i)=>({id:'g6-'+i,kw,ccs:kw>=50,t2:kw<50})),commod:f.commodites||[],note:f.note||'',g6:true},false);
      if(f.photo)putItem(pidOf(sid),'photo',{sid,img:f.photo})}
    nFav++});
  const nAb=window.TR_abosImport?TR_abosImport(j):false;
  return{nEl,nFav,nAb}};

/* ---------- panneau Tarifs : Electra + commodités souhaitées ---------- */
window.TR_tarifsExtra_=function(){
  const E=EL(),pr=E.profils||{},ks=Object.keys(pr),W=prefs();
  const lst=ks.length?ks.map(k=>`<div class="it" style="align-items:center"><div class="t">⚡ ${esc(pr[k].nom||k)} <span class="muted">· ${pr[k].maj||''}</span></div><button class="btn s" onclick="TR_elEdit('${k}')">✏️</button><button class="btn s g" onclick="TR_elSuppr('${k}')">🗑️</button></div>`).join(''):'<p class="muted">Aucun créneau enregistré. Ouvre une borne Electra dans un résultat de trajet → « ✏️ Créneaux Electra » pour saisir les prix horaires.</p>';
  const cb=COMM.map(([k,ic,l])=>`<label style="margin-right:12px;white-space:nowrap"><input type="checkbox" ${(W.want||[]).includes(k)?'checked':''} onchange="TR_wish('${k}',this.checked)"> ${ic} ${l}</label>`).join('');
  const ELc=`<div class="card" style="margin-top:12px"><h2>⚡ PRIX DU JOUR ELECTRA</h2><p class="muted">Remise de carte : <b>${(E.remise&&E.remise.remise)||0} €/kWh</b>${E.remise&&E.remise.carte?' ('+esc(E.remise.carte)+')':''}. Le prix utilisé dépend de l'heure d'arrivée estimée (champ « Heure de départ » de l'onglet Trajet).</p>${lst}</div>`;
  const COc=`<div class="card" style="margin-top:12px"><h2>🛍️ COMMODITÉS SOUHAITÉES</h2><p class="muted">Cochées : le planificateur préfère les bornes qui les ont (confirmées par toi ou OpenStreetMap = 100 %, supposées d'après l'enseigne = 50 %).</p><div style="line-height:2">${cb}</div>
  <div class="row" style="margin-top:6px"><label>Valeur d'une commodité (€) <input type="number" step="0.5" min="0" value="${W.val==null?4:W.val}" style="width:80px" onchange="TR_wishV(this.value)"></label></div></div>`;
  return {electra:ELc,commod:COc}};
window.TR_electraHtml=()=>TR_tarifsExtra_().electra;
window.TR_tarifsExtra=()=>`<p class="muted" style="margin-top:10px">💳 Tes abonnements et tes prix sont dans l'onglet <b>Abonnements</b>.</p>`+TR_tarifsExtra_().commod;
window.TR_wish=(k,on)=>{const W=prefs(),s=new Set(W.want||[]);on?s.add(k):s.delete(k);putItem('cprefs','cprefs',{want:[...s],val:W.val==null?4:W.val});if(T()&&T().route&&window.TR_replan)TR_replan()};
window.TR_wishV=v=>{const W=prefs();putItem('cprefs','cprefs',{want:W.want||[],val:+v||0})};

/* ---------- champ « Heure de départ » ---------- */
function inject(){const a=document.getElementById('tArr');if(!a||document.getElementById('tDep'))return;const f=a.closest('.f');if(!f)return;
  const d=document.createElement('div');d.className='f';let sv='';try{sv=localStorage.getItem('pr.tdep')||''}catch(e){}
  d.innerHTML='<label>Heure de départ <span class="muted">(vide = maintenant ; sert aux créneaux Electra)</span></label><input type="datetime-local" id="tDep" value="'+sv+'">';
  f.parentNode.insertBefore(d,f.nextSibling);
  document.getElementById('tDep').onchange=e=>{try{localStorage.setItem('pr.tdep',e.target.value)}catch(x){}if(T()&&T().route&&window.TR_replan)TR_replan()}}
setInterval(inject,1200);inject();
})();
