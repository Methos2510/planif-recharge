/* Planif Recharge — Trajet réel avec arrêts, tarifs et statuts en direct (v1.2.0)
   Chargé après index.html : utilise ses globales ($, esc, settings, DB, putItem, items, stations,
   dynCache, addRows, refreshDynFor, stPdcs, stMaxKw, stStatus, kwN, simCharge, fetchJson, API, RES_STAT,
   fmtH, fmtE, toast, map, showTab). */
(function(){
'use strict';
const CATS=['Atlante','Electra','Ionity','Fastned','TotalEnergies','Tesla','Allego','Freshmile','Izivia','Powerdot','IEcharge','Autres'];
const ALIAS={Atlante:['atlante'],Electra:['electra'],Ionity:['ionity'],Fastned:['fastned'],TotalEnergies:['totalenergies','total energies','total '],
  Tesla:['tesla'],Allego:['allego'],Freshmile:['freshmile'],Izivia:['izivia','sodetrel'],Powerdot:['powerdot','power dot'],IEcharge:['iecharge','ie charge']};
const LIEU={Tesla:'Tesla Supercharger'};   // nom du réseau dans la grille de tarifs de G6 Suivi
/* Pas de prix par défaut : l'appli utilise ton prix moyen (Réglages) puis tes abonnements */
const PRIX_DEFAUT={};
const MANQUANTES=[];
const VALHALLA='https://valhalla1.openstreetmap.de/route';
const MAX_DETOUR_KM=12;           // distance maxi route → borne
const PRIORITES={prix:3,equilibre:8,rapide:20};   // € par heure de ton temps

const TR={route:null,plan:null,imposed:[],cands:[],showAll:false,tmap:null,layers:null,busy:false,
  reseaux:new Set(CATS.filter(c=>c!=='Autres')),from:null,to:null,msg:''};
window.TR=TR;

/* ---------- petits outils ---------- */
const rad=x=>x*Math.PI/180;
function dkm(a,b,c,d){const R=6371,dl=rad(c-a),dn=rad(d-b);const h=Math.sin(dl/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function poly6(str){let i=0,la=0,ln=0;const out=[];while(i<str.length){let s=0,r=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);la+=(r&1)?~(r>>1):(r>>1);s=0;r=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);ln+=(r&1)?~(r>>1):(r>>1);out.push([la/1e6,ln/1e6])}return out}
function ptAuKm(pts,km){if(km<=0)return pts[0];for(let i=1;i<pts.length;i++){if(pts[i].km>=km){const a=pts[i-1],b=pts[i],t=(km-a.km)/Math.max(1e-4,b.km-a.km);return{lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t,km}}}return pts[pts.length-1]}
const num=id=>+($(id).value);
const lieuDe=c=>LIEU[c]||c;
function saveForm(){try{localStorage.setItem('pr.trajet',JSON.stringify({veh:$('tVeh').value,meteo:$('tMeteo').value,soc:$('tSoc').value,arr:$('tArr').value,mn:$('tMn').value,mx:$('tMx').value,cible:$('tCible').value,kw:$('tKw').value,prio:$('tPrio').value,marge:$('tMarge').value,peage:$('tPeage').checked,res:[...TR.reseaux]}))}catch(e){}}
function loadForm(){try{const j=JSON.parse(localStorage.getItem('pr.trajet')||'null');if(!j)return;
  $('tVeh').value=j.veh||'g6';$('tMeteo').value=j.meteo||'doux';$('tSoc').value=j.soc||100;$('tArr').value=j.arr||20;
  $('tMn').value=j.mn||10;$('tMx').value=j.mx||15;$('tCible').value=j.cible||80;$('tKw').value=j.kw||100;$('tPrio').value=j.prio||'equilibre';$('tMarge').value=j.marge==null?10:j.marge;$('tPeage').checked=!!j.peage;
  if(Array.isArray(j.res)&&j.res.length)TR.reseaux=new Set(j.res)}catch(e){}}

/* ---------- réseaux et tarifs ---------- */
function categorie(s){const h=((s.op||'')+' '+(s.ens||'')+' '+(s.nom||'')).toLowerCase();for(const c of CATS){if((ALIAS[c]||[]).some(a=>h.includes(a)))return c}
  if(/^FRATL/i.test(s.id))return 'Atlante';return s.cat||'Autres'}
const TAR=()=>{const it=DB.items.tarifs;return it&&!it.deleted&&it.data&&it.data.reseaux?it.data:null};
function prixReseau(cat,s){
  if(window.TR_electraPrix){const x=TR_electraPrix(cat,s);if(x)return x}
  if(s&&s.gratuit!==true&&window.TR_aboPrix){const y=TR_aboPrix(cat,s);if(y)return y}
  if(s&&s.gratuit===true)return{eur:0,carte:null,src:'gratuit'};
  const t=TAR(),l=t&&t.reseaux[lieuDe(cat)];
  if(l)return{eur:l.eur,carte:l.carte&&l.carte!=='sans abonnement'?l.carte:null,fs:l.fraisSession||0,src:'import',offres:l.offres};
  const d=PRIX_DEFAUT[cat];if(d)return{eur:d.eur,carte:d.carte,src:'départ'};
  return{eur:+settings.dc||0.49,carte:null,src:'moyenne'}}
window.TR_replan=()=>{if(TR.route)replanifier()};
window.TR_prixDe=function(s){try{return prixReseau(categorie(s),s)}catch(e){return null}};
window.TR_prixHtml=function(s){const p=prixReseau(categorie(s),s);return `<div style="margin-top:4px">💶 <b>${p.eur===0?'gratuit':p.eur.toFixed(3).replace('.',',')+' €/kWh'}</b>${p.carte?` · 🎫 ${esc(p.carte)}`:''}<span class="muted" style="font-size:12px"> (${p.src==='import'?'tes tarifs importés':p.src==='départ'?'valeur de départ':'moyenne'})</span></div>`};

/* ---------- consommation et véhicule ---------- */
function conso(v,meteo,kmh,marge){const t=v[meteo==='froid'?'consoFroid':'consoDoux'];let c;
  if(kmh<=35)c=t.ville;else if(kmh>=105)c=t.auto;else if(kmh<=70)c=t.ville+(t.mixte-t.ville)*(kmh-35)/35;else c=t.mixte+(t.auto-t.mixte)*(kmh-70)/35;
  return c*(1+(marge||0)/100)}

/* ---------- géocodage ---------- */
async function geocode(q){q=(q||'').trim();if(!q)throw new Error('vide');
  const m=q.match(/^(-?\d+[.,]\d+)\s*[,;]\s*(-?\d+[.,]\d+)$/);if(m)return{lat:+m[1].replace(',','.'),lon:+m[2].replace(',','.'),label:q};
  const j=await fetchJson('https://nominatim.openstreetmap.org/search?format=json&countrycodes=fr&limit=1&q='+encodeURIComponent(q));
  if(!j.length)throw new Error('Lieu introuvable : '+q);return{lat:+j[0].lat,lon:+j[0].lon,label:j[0].display_name.split(',').slice(0,2).join(',')}}

/* ---------- itinéraire ---------- */
function classeRoute(names){const n=(names||[]).map(x=>String(x).trim());
  if(n.some(x=>/^A\s?\d/i.test(x)))return 'A';if(n.some(x=>/^R?N\s?\d/i.test(x)))return 'N';if(n.some(x=>/^R?D\s?\d/i.test(x)))return 'D';return 'X'}
async function getRoute(places,peage){
  try{return await getRouteNet(places,peage)}catch(e){
    if(window.OFF&&OFF.approxRoute&&(!navigator.onLine||/Failed to fetch|abort|Load failed|NetworkError|indisponible/i.test(String((e&&e.message)||e)))){toast('📴 Hors ligne : trajet estimé en ligne droite (+30 %), moins précis');return OFF.approxRoute(places)}
    throw e}}
async function getRouteNet(places,peage){
  const body={locations:places.map(p=>({lat:p.lat,lon:p.lon})),costing:'auto',costing_options:{auto:{use_tolls:peage?0:1}},directions_options:{units:'kilometers'}};
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),25000);
  try{const r=await fetch(VALHALLA,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctl.signal});
    if(!r.ok)throw new Error('Itinéraire indisponible (HTTP '+r.status+')');const d=await r.json();
    if(!d.trip||!d.trip.legs)throw new Error('Itinéraire introuvable');
    let raw=[];const fin=[];d.trip.legs.forEach(l=>{poly6(l.shape).forEach(p=>raw.push(p));fin.push(raw.length-1)});
    const cumA=[0];for(let i=1;i<raw.length;i++)cumA.push(cumA[i-1]+dkm(raw[i-1][0],raw[i-1][1],raw[i][0],raw[i][1]));
    const pts=[];let last=null;
    raw.forEach((p,i)=>{if(!last||dkm(last[0],last[1],p[0],p[1])>=0.2||i===raw.length-1){pts.push({lat:p[0],lon:p[1],km:cumA[i]});last=p}});
    const cls={A:0,N:0,D:0,X:0};d.trip.legs.forEach(l=>(l.maneuvers||[]).forEach(m=>{cls[classeRoute(m.street_names)]+=m.length||0}));
    return{pts,cls,dist:d.trip.summary.length,min:d.trip.summary.time/60,toll:!!d.trip.summary.has_toll,wpKm:[0].concat(fin.map(i=>cumA[i]))}}
  finally{clearTimeout(to)}}

/* ---------- bornes le long du trajet ---------- */
function stationManq(m){const id=m.id||('manq_'+m.lat+'_'+m.lon);const pdc={};(m.pdc||[m.kw||50]).forEach((kw,k)=>{pdc[id+'#'+k]={id:id+'#'+k,kw,ccs:true,t2:false}});
  return{id,nom:m.nom,op:m.cat||'',ens:'',adr:m.adr||'',lat:m.lat,lon:m.lon,pdc,cat:m.cat,hsJusqu:m.hsJusqu,manquante:true,note:m.note||''}}
function projeter(s,pts){let best=null;for(const p of pts){const d=dkm(p.lat,p.lon,s.lat,s.lon);if(!best||d<best.d)best={d,km:p.km}}return best}
async function chargerCouloir(R,kwMin){
  const centres=[];for(let km=0;km<=R.dist+20;km+=35)centres.push(ptAuKm(R.pts,Math.min(km,R.dist)));
  if(window.OFF&&OFF.ready){for(const c of centres){const dla=0.17,dlo=0.17/Math.cos(rad(c.lat));await OFF.fill({south:c.lat-dla,north:c.lat+dla,west:c.lon-dlo,east:c.lon+dlo})}}else{
  let i=0;const worker=async()=>{while(i<centres.length){const c=centres[i++];const dla=0.17,dlo=0.17/Math.cos(rad(c.lat));
    let url=API+RES_STAT+'/data/?consolidated_latitude__greater='+(c.lat-dla).toFixed(4)+'&consolidated_latitude__less='+(c.lat+dla).toFixed(4)+'&consolidated_longitude__greater='+(c.lon-dlo).toFixed(4)+'&consolidated_longitude__less='+(c.lon+dlo).toFixed(4)+'&puissance_nominale__greater='+(kwMin-1)+'&page_size=200';
    let pg=0;while(url&&pg<8){try{const j=await fetchJson(url);addRows(j.data||[]);url=j.links&&j.links.next}catch(e){url=null}pg++}}};
  await Promise.all([worker(),worker(),worker()]);
  }
  /* bornes absentes des bases : les nôtres + celles que tu as ajoutées */
  const manq=MANQUANTES.concat(items('manq').map(x=>x.data));
  manq.forEach(m=>{const st=stationManq(m);if(!stations[st.id])stations[st.id]=st});
  const cands=[],vus=new Set();
  for(const s of Object.values(stations)){
    const ps=stPdcs(s).filter(p=>p.ccs);if(!ps.length)continue;
    const kw=Math.max(...ps.map(p=>kwN(p.kw)));if(kw<kwMin)continue;
    const pr=projeter(s,R.pts);if(!pr||pr.d>MAX_DETOUR_KM)continue;
    const cat=categorie(s),k=cat+s.lat.toFixed(3)+s.lon.toFixed(3);if(vus.has(k))continue;vus.add(k);
    cands.push({s,cat,kw,km:pr.km,det:pr.d*2})}
  /* même parking déclaré deux fois (une station par borne physique) : on garde la plus puissante */
  cands.sort((a,b)=>a.km-b.km);
  return cands}

/* ---------- statut ---------- */
function statut(s){
  if(s.hsJusqu&&Date.now()<Date.parse(s.hsJusqu)){const n=stPdcs(s).length;return{c:'hs',lib:0,occ:0,hs:n,inc:0,tot:n,known:n,manuel:true}}
  return stStatus(s)}
function ligneStatut(s){const st=statut(s);
  if(!st.known)return '<span class="muted">⚪ statut en direct non publié par ce réseau</span>';
  if(st.c==='hs')return '<span style="color:var(--red);font-weight:700">🔴 hors service</span>'+(st.manuel?' <span class="muted" style="font-size:12px">(signalé le 18/10)</span>':'');
  if(st.lib)return `<span style="color:var(--green);font-weight:700">🟢 ${st.lib} libre${st.lib>1?'s':''} sur ${st.tot}</span>`;
  return `<span style="color:var(--orange);font-weight:700">🟠 tout occupé (${st.occ}/${st.tot})</span>`}

/* ---------- moteur de planification ---------- */
function energieCout(v,socA,socB,c){const sim=simCharge(v,socA,socB,'dc',c.kw);const p=prixReseau(c.cat,c.s);return{min:sim.min,kWh:sim.eGrid,cout:sim.eGrid*p.eur+(p.fs||0),p}}
function planifier(R,P){
  const v=P.v,kpp=P.kpp,mn=P.mn,mx=P.mx,vt=P.vt,imp=P.imposed.slice().sort((a,b)=>a.km-b.km);
  let pos=0,batt=P.soc0;const stops=[];let alerte='';
  for(let g=0;g<12;g++){
    const battFin=batt-(R.dist-pos)/kpp;
    const nextImp=imp.find(c=>c.km>pos+1);
    if(!nextImp&&battFin>=P.arrSouhaitee)break;
    let choix=null;
    const mkStop=(c,imposee)=>{
      const socArr=batt-((c.km-pos)+c.det)/kpp;
      const nx=imp.find(x=>x.km>c.km+1);                                 // autre arrêt imposé plus loin ?
      const besoin=nx ? mn+3+((nx.km-c.km)+nx.det)/kpp : P.arrSouhaitee+P.marge+(R.dist-c.km)/kpp;
      let vise=Math.min(P.cible,Math.max(besoin,socArr+5));
      if(imposee&&besoin>P.cible)vise=P.cible;
      vise=Math.max(vise,socArr+3);
      const fz=(TR.force||{})[c.s.id];if(fz)vise=Math.min(100,Math.max(fz,socArr+1));
      TR.tArr=window.TR_tAt?TR_tAt(c.km,stops,R):null;
      const e=energieCout(v,socArr,Math.min(100,vise),c);
      const detMin=c.det/55*60;
      return{c,km:c.km,tArr:TR.tArr,socArr,socDep:vise,min:e.min,kWh:e.kWh,cout:e.cout,prix:e.p,imposee,detMin,
        score:e.cout-(window.TR_bonus?TR_bonus(c.s):0)+((e.min+detMin)/60)*vt+(statut(c.s).c==='occupe'?(5/60)*vt:0)}};
    if(nextImp){const sa=batt-((nextImp.km-pos)+nextImp.det)/kpp;
      if(sa>=mn-0.5){choix=mkStop(nextImp,true)}}
    if(!choix){
      const limite=nextImp?nextImp.km-5:R.dist;
      const lo=Math.max(pos+20,pos+(batt-mx)*kpp),hi=Math.min(pos+(batt-mn)*kpp,limite);
      const ok=c=>P.ok(c)&&c.km>pos+19&&c.km<=hi+0.5&&c.km<=limite&&(batt-((c.km-pos)+c.det)/kpp)>=mn-0.5;
      const toutes=P.cands.filter(ok);
      let pool=[];
      if(toutes.length){
        for(let seuil=lo;!pool.length&&seuil>=pos+20-20;seuil-=20)pool=toutes.filter(c=>c.km>=Math.max(seuil,pos+20)-0.5);
        if(pool.length){const dmin=Math.min(...pool.map(c=>c.det));
          pool=pool.concat(toutes.filter(c=>c.km<lo-0.5&&c.km>=lo-40&&c.det<=dmin*0.5&&!pool.includes(c)))}
      }
      if(!pool.length){alerte=`Aucune borne autorisée atteignable après le km ${Math.round(pos)} (il te reste ${Math.round(batt)} % de batterie). Autorise plus de réseaux, baisse la puissance minimale ou ajoute un arrêt de ton choix.`;break}
      const vivants=pool.filter(c=>statut(c.s).c!=='hs');if(vivants.length)pool=vivants;
      choix=pool.map(c=>mkStop(c,false)).sort((a,b)=>a.score-b.score)[0]}
    stops.push(choix);pos=choix.km;batt=choix.socDep;
  }
  const lastKm=stops.length?stops[stops.length-1].km:0,lastSoc=stops.length?stops[stops.length-1].socDep:P.soc0;
  const arr=lastSoc-(R.dist-lastKm)/kpp;
  return{stops,arr,alerte,coutTotal:stops.reduce((a,s)=>a+s.cout,0),minCharge:stops.reduce((a,s)=>a+s.min,0)}}

/* ---------- calcul complet ---------- */
async function calculer(){
  if(TR.busy)return;TR.busy=true;setMsg('⏳ Recherche de l\'itinéraire…');
  try{
    saveForm();
    const pts=TR.dest.filter(d=>d&&d.lat!=null);
    if(pts.length<2||!TR.dest[0]||TR.dest[0].lat==null||!TR.dest[TR.dest.length-1]||TR.dest[TR.dest.length-1].lat==null)throw new Error('Choisis un départ et une arrivée.');
    TR.from=pts[0];TR.to=pts[pts.length-1];TR.via=pts.slice(1,-1);
    TR.route=await getRoute(pts,$('tPeage').checked);
    const R=TR.route;R.kmh=R.dist/Math.max(0.1,R.min/60);
    setMsg('⏳ Lecture des bornes le long du trajet…');
    const kwMin=num('tKw');
    TR.cands=await chargerCouloir(R,kwMin);
    TR.exclus=[];TR.force={};TR.swapInfo={};
    /* arrêts de recharge choisis dans la liste : imposés, sur le trajet */
    TR.locked=[];
    TR.via.forEach((v,i)=>{if(!v.charge||!v.station)return;
      const s=stations[v.station.id]||(stations[v.station.id]=v.station);
      const ps=stPdcs(s).filter(p=>p.ccs);const kw=ps.length?Math.max(...ps.map(p=>kwN(p.kw))):kwMin;
      TR.cands=TR.cands.filter(c=>c.s.id!==s.id&&dkm(c.s.lat,c.s.lon,s.lat,s.lon)>0.08);
      TR.cands.push({s,cat:categorie(s),kw,km:R.wpKm[i+1],det:0,place:true});TR.locked.push(s.id)});
    TR.cands.sort((a,b)=>a.km-b.km);
    setMsg('⏳ Lecture des statuts en direct…');
    await refreshDynFor(TR.cands.map(c=>c.s),true);
    TR.imposed=TR.imposed.filter(id=>TR.cands.some(c=>c.s.id===id));
    replanifier();setMsg('');
  }catch(e){console.warn(e);setMsg('⚠ '+(e.message||'Calcul impossible'));}
  TR.busy=false;
  if(TR._again){TR._again=false;setTimeout(calculer,100)}
}
function params(){
  const v=settings.veh[$('tVeh').value],R=TR.route;
  const c=conso(v,$('tMeteo').value,R.kmh,num('tMarge'));
  return{v,kpp:v.bat/c,consoVeh:c,soc0:num('tSoc'),arrSouhaitee:num('tArr'),mn:num('tMn'),mx:Math.max(num('tMx'),num('tMn')+2),cible:num('tCible'),marge:5,
    vt:PRIORITES[$('tPrio').value]||8,cands:TR.cands,imposed:TR.cands.filter(c=>TR.imposed.includes(c.s.id)||(TR.locked||[]).includes(c.s.id)),ok:c=>(TR.reseaux.has(c.cat)||(TR.locked||[]).includes(c.s.id))&&!(TR.exclus||[]).includes(c.s.id)}}
function replanifier(){
  if(!TR.route)return;
  const P=params();
  TR.P=P;TR.plan=planifier(TR.route,P);saveForm();rendre()}
window.TR_replan=replanifier;

/* ---------- affichage ---------- */
function setMsg(t){TR.msg=t;const m=$('tMsg');if(m){m.textContent=t;m.style.display=t?'':'none'}}
function estimation(c){ // batterie à l'arrivée si on s'arrête ici, en repartant du dernier arrêt prévu avant
  const P=TR.P,pl=TR.plan;let kmP=0,sP=P.soc0,rang=null;
  pl.stops.forEach((s,i)=>{if(s.c.s.id===c.s.id)rang=i+1;else if(s.km<c.km-0.5){kmP=s.km;sP=s.socDep}});
  return{socArr:sP-((c.km-kmP)+c.det)/P.kpp,kmP,sP,rang}}
function favOui(sid){const it=DB.items['fav_'+String(sid).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,140)];return !!(it&&!it.deleted)}
window.TR_fav=sid=>{if(!stations[sid])return;toggleFav(sid);rendre()};
async function villeDe(p){try{const j=await fetchJson('https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=fr&lat='+p.lat+'&lon='+p.lon);const a=j.address||{};return a.city||a.town||a.village||a.municipality||a.county||p.label}catch(e){return p.label}}
window.TR_saveTrajetFav=async()=>{const R=TR.route;if(!R)return toast('Calcule d\'abord un trajet');toast('⭐ Enregistrement du trajet…');
  const [v1,v2]=await Promise.all([villeDe(TR.from),villeDe(TR.to)]);
  const nom=prompt('Nom de ce trajet favori ?',v1+' → '+v2);if(nom===null)return toast('Annulé');
  putItem('tfav_'+uid(),'tfav',{nom:nom.trim(),ville1:v1,ville2:v2,km:Math.round(R.dist),cls:R.cls,veh:$('tVeh').value,date:new Date().toISOString(),dest:TR.dest.filter(d=>d.lat!=null)});
  toast('⭐ Trajet ajouté aux favoris');renderTrajetsFavs()};
window.renderTrajetsFavs=function(){const el=$('tfList');if(!el)return;const q=(($('tfQ')||{}).value||'').trim().toLowerCase();
  const nomDe=d=>(d.nom||(d.ville1+' → '+d.ville2)).trim();
  const l=items('tfav').filter(i=>!q||(nomDe(i.data)+' '+i.data.ville1+' '+i.data.ville2).toLowerCase().includes(q)).sort((a,b)=>nomDe(a.data).localeCompare(nomDe(b.data),'fr'));
  const ouverts=new Set([...el.querySelectorAll('details[open]')].map(x=>x.dataset.id));
  const b=x=>`<span style="font-weight:700;color:var(--text)">${esc(x)}</span>`;
  const carte=(i,titre,dans)=>{const d=i.data,C=d.cls||{A:0,N:0,D:0,X:0},tot=(C.A+C.N+C.D+C.X)||1;
    const p=(k,n,col)=>`<span class="pill" style="color:${col};border-color:${col}">${n} ${Math.round(C[k]/tot*100)} %</span>`;
    return `<details data-id="${i.id}" ${ouverts.has(i.id)?'open':''} style="border:1px solid var(--line);border-radius:12px;margin:${dans?'6px 0':'8px 0'};background:rgba(255,255,255,.04)">
     <summary style="cursor:pointer;padding:11px 14px;list-style:none;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center" title="Touche pour ouvrir / fermer le détail"><span style="color:${dans?'var(--blue)':'var(--pink)'};font-weight:800">▸ ${esc(titre)}</span><span class="muted" style="font-size:13px">${esc(d.ville1)} → ${esc(d.ville2)} · ${d.km} km</span></summary>
     <div style="padding:4px 14px 14px;line-height:2">
      <div class="muted" style="font-size:12px">Nom complet : ${esc(nomDe(d))}</div>
      <div>🔵 Départ : ${b(d.ville1)}</div><div>🏁 Arrivée : ${b(d.ville2)}</div><div>📏 Kilométrage total : ${b(d.km+' km')}</div>
      <div>🛣️ ${p('A','Autoroute','#00f3ff')} ${p('N','Nationale','#ffb020')} ${p('D','Départementale','#39ff88')} ${p('X','Autres','#9a9ab0')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="btn s p" title="Recharger ce trajet dans l'onglet Trajet et le recalculer" onclick="TR_useFav('${i.id}')">🛣️ Refaire ce trajet</button><button class="btn s" title="Donner un autre nom à ce trajet (le premier mot sert à le ranger dans un groupe)" onclick="TR_renomme('${i.id}')">✏️ Renommer</button><button class="btn s g" title="Supprimer ce trajet favori (corbeille, restaurable)" onclick="TR_suppr('${i.id}')">🗑️</button></div></div></details>`};
  /* regroupement : le premier mot du nom = le groupe (ex. « EVE route », « EVE autoroute » → groupe EVE) */
  const G=new Map();l.forEach(i=>{const n=nomDe(i.data),m=n.match(/^(\S+)\s+(.+)$/);const cle=(m?m[1]:n).toLowerCase();
    if(!G.has(cle))G.set(cle,{nom:m?m[1]:n,items:[]});G.get(cle).items.push({i,reste:m?m[2]:n,seul:!m})});
  el.innerHTML=l.length?[...G.entries()].map(([cle,g])=>{
    if(g.items.length===1)return carte(g.items[0].i,nomDe(g.items[0].i.data),false);
    return `<details data-id="g:${esc(cle)}" ${ouverts.has('g:'+cle)?'open':''} style="border:1px solid rgba(255,0,255,.35);border-radius:12px;margin:8px 0;background:rgba(255,0,255,.04)">
     <summary style="cursor:pointer;padding:12px 14px;list-style:none;display:flex;gap:10px;align-items:center" title="Touche pour ouvrir / fermer ce groupe"><span style="color:var(--pink);font-weight:900;font-size:16px">📁 ${esc(g.nom)}</span><span class="pill">${g.items.length} trajets</span></summary>
     <div style="padding:0 10px 8px">${g.items.map(x=>carte(x.i,x.seul?'(sans précision)':x.reste,true)).join('')}</div></details>`}).join(''):'<div class="empty">Aucun trajet favori. Calcule un trajet puis touche ⭐ Trajet en favori.</div>'};
window.TR_suppr=id=>{delItem(id);renderTrajetsFavs()};
window.TR_renomme=id=>{const it=DB.items[id];if(!it)return;const n=prompt('Nom du trajet',it.data.nom||(it.data.ville1+' → '+it.data.ville2));if(n===null)return;
  putItem(id,'tfav',Object.assign({},it.data,{nom:n.trim()}));renderTrajetsFavs();toast('✏️ Nom enregistré')};
window.TR_useFav=id=>{const it=DB.items[id];if(!it)return;TR.dest=it.data.dest.map(x=>Object.assign({},x));if(it.data.veh)$('tVeh').value=it.data.veh;saveDest();renderDest();showTab('trajet');TR.route=null;calculer()};
/* ---------- photos des bornes (les miennes, enregistrées dans l'appli) ---------- */
const pid=sid=>'photo_'+String(sid).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,140);
function photoDe(sid){const it=DB.items[pid(sid)];return it&&!it.deleted&&it.data&&it.data.img?it.data:null}
window.TR_photoThumb=sid=>{const p=photoDe(sid);return p?`<img src="${p.img}" onclick="TR_photoVoir('${jsq(sid)}')" title="Ma photo de la borne — touche pour agrandir" style="height:84px;max-width:100%;border-radius:10px;border:1px solid var(--line);cursor:pointer;margin:6px 8px 0 0;object-fit:cover">`:''};
function photoBtn(sid){const p=photoDe(sid);return `<label class="btn s" style="cursor:pointer" title="Ajouter ma photo de l'emplacement (appareil photo ou galerie) : elle s'affichera à chaque prochaine consultation de cette borne">📷 ${p?'Changer ma photo':'Ajouter ma photo'}<input type="file" accept="image/*" style="display:none" onchange="TR_photoAjout('${jsq(sid)}',this)"></label>`}
window.TR_photoAjout=(sid,inp)=>{const f=inp.files&&inp.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);const img=c.toDataURL('image/jpeg',0.72);
    putItem(pid(sid),'photo',{sid,img,date:new Date().toISOString()});toast('📷 Photo enregistrée pour cette borne');try{rendre()}catch(e){}try{renderFavs()}catch(e){}};im.onerror=()=>toast('Image illisible');im.src=rd.result};
  rd.readAsDataURL(f)};
window.TR_photoVoir=sid=>{const p=photoDe(sid);if(!p)return;openModal(`<h2>📷 MA PHOTO</h2><img src="${p.img}" style="width:100%;border-radius:12px;margin:8px 0"><div class="row">${photoBtn(sid)}<button class="btn s g" onclick="TR_photoSuppr('${jsq(sid)}')" title="Retirer ma photo de cette borne">🗑️ Retirer la photo</button></div>`)};
window.TR_photoSuppr=sid=>{putItem(pid(sid),'photo',{sid,img:''});$('modal').classList.remove('on');try{rendre()}catch(e){}try{renderFavs()}catch(e){}toast('Photo retirée')};
function photoBloc(s){return `<div style="margin-top:4px">${TR_photoThumb(s.id)}<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"><a class="btn s" target="_blank" rel="noopener" title="Voir les photos de ce lieu sur Google Maps" href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}">🖼️ Photos sur Google Maps</a>${photoBtn(s.id)}</div></div>`}
/* ---------- changer de borne : retirer et choisir une voisine ---------- */
const ICO_ST={libre:'🟢',occupe:'🟠',hs:'🔴',inc:'⚪',res:'🟣'};
function swapHtml(s){const id=s.c.s.id;if((TR.locked||[]).includes(id))return `<div class="muted" style="font-size:12px;margin-top:6px">📌 Borne choisie dans ta liste de destinations : modifie-la là-haut.</div>`;
  const ex=TR.exclus||[];
  const alt=TR.cands.filter(c=>c.s.id!==id&&!ex.includes(c.s.id)&&!TR.plan.stops.some(x=>x.c.s.id===c.s.id)).map(c=>({c,d:dkm(c.s.lat,c.s.lon,s.c.s.lat,s.c.s.lon)})).filter(x=>x.d<=40).filter(x=>{const m=TR.swapMode||'tous',sortie=x.c.det/2>0.8;return m==='tous'||(m==='sortie'?sortie:!sortie)}).sort((a,b)=>a.d-b.d).slice(0,14);
  const sg=(v,sp)=>(v>=0?'+':'−')+Math.abs(v).toFixed(1).replace('.',',')+' km';
  const opts=alt.map(x=>{const c=x.c,pr=prixReseau(c.cat,c.s);const st=statut(c.s);
    return `<option value="${esc(c.s.id)}">${ICO_ST[st.c]||'⚪'} ${esc(c.cat)} · ${esc(String(c.s.nom).slice(0,34))} · ${Math.round(c.kw)} kW · ${x.d.toFixed(1).replace('.',',')} km d'ici · trajet ${sg(c.det-s.c.det)} · ${c.det/2>0.8?'sortie '+(c.det/2).toFixed(1).replace('.',',')+' km':'sur la voie/aire'} · ${pr.eur===0?'gratuit':pr.eur.toFixed(2).replace('.',',')+' €/kWh'}${TR.reseaux.has(c.cat)?'':' · réseau non autorisé'}</option>`}).join('');
  const mode=TR.swapMode||'tous';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center"><select style="width:auto" title="Filtrer les bornes proposées : sur la voie rapide (aires) ou en sortant de l'autoroute" onchange="TR_swapMode(this.value)"><option value="tous"${mode==='tous'?' selected':''}>🛣️ Toutes les bornes</option><option value="aire"${mode==='aire'?' selected':''}>🅿️ Sur l'autoroute / aires</option><option value="sortie"${mode==='sortie'?' selected':''}>↗️ Sortie de l'autoroute</option></select><select style="max-width:100%;flex:1;min-width:220px" title="Remplacer cette borne par une autre proche de cet emplacement" onchange="if(this.value)TR_swap('${jsq(id)}',this.value)"><option value="">🔄 Changer de borne (les plus proches d'ici)…</option>${opts||''}</select>
    <button class="btn s g" title="Retirer cette borne : le calcul en choisit une autre" onclick="TR_retirer('${jsq(id)}')">✖ Retirer cette borne</button></div>`}
window.TR_retirer=id=>{TR.exclus=(TR.exclus||[]).concat([id]);TR.imposed=TR.imposed.filter(x=>x!==id);replanifier()};
window.TR_swapMode=m=>{TR.swapMode=m;rendre()};
function swapInfoHtml(s){const i=(TR.swapInfo||{})[s.c.s.id];if(!i)return '';const dt=s.c.det-i.det,dp=s.c.km-i.km,f=v=>(v>=0?'+':'−')+Math.abs(v).toFixed(1).replace('.',',')+' km';
  return `<div style="margin-top:6px;padding:6px 10px;border:1px solid var(--line);border-left:3px solid var(--orange);border-radius:10px;background:rgba(255,176,32,.06)">↔️ Remplace <b>${esc(i.nom)}</b> : écart de trajet <b style="color:var(--orange)">${f(dt)}</b> · position sur la route <b>${f(dp)}</b> · ${s.c.det/2>0.8?'sortie de l\'autoroute '+(s.c.det/2).toFixed(1).replace('.',',')+' km':'sur la voie / aire'}</div>`}
window.TR_swap=(old,nw)=>{
  TR.swapInfo=TR.swapInfo||{};const os=TR.plan&&TR.plan.stops.find(s=>s.c.s.id===old);
  if(os)TR.swapInfo[nw]=TR.swapInfo[old]||{nom:os.c.s.nom,km:os.c.km,det:os.c.det};
TR.exclus=(TR.exclus||[]).concat([old]);TR.imposed=TR.imposed.filter(x=>x!==old&&x!==nw).concat([nw]);replanifier();
  const pris=TR.plan&&TR.plan.stops.some(s=>s.c.s.id===nw);
  if(!pris){TR.imposed=TR.imposed.filter(x=>x!==nw);TR.exclus=TR.exclus.filter(x=>x!==old);replanifier();toast('⚠ Cette borne n\'est pas atteignable avec la batterie prévue : choisis-en une plus proche ou monte « arriver aux bornes entre »')}};
window.TR_resetChoix=()=>{TR.swapInfo={};TR.exclus=[];TR.imposed=[];TR.force={};replanifier()};
function adrBorne(s){const a=(s.adr||'').trim();return a||('Adresse non renseignée — GPS '+s.lat.toFixed(5)+', '+s.lon.toFixed(5))}
const peageKm=()=>{const v=parseFloat(localStorage.getItem('pr.peagekm'));return v>=0?v:0.1055};
function peageEur(R){const ev=$('tPeage')&&$('tPeage').checked;return ev?0:((R.cls&&R.cls.A)||0)*peageKm()}
function peageTxt(R){const ev=$('tPeage')&&$('tPeage').checked;return ev?'0 €':'≈ '+fmtE(peageEur(R))}
function peageLegende(R){const ev=$('tPeage')&&$('tPeage').checked;return ev?'🛣️ Péage (évités)':`🛣️ Péage estimé · ${Math.round((R.cls&&R.cls.A)||0)} km × <input type="number" step="0.005" min="0" value="${peageKm()}" style="width:68px;padding:2px 4px;font-size:13px" title="Tarif moyen au km d'autoroute payante (classe 1). Les tronçons gratuits sont comptés aussi : c'est une estimation haute." onchange="TR_peageKm(this.value)"> €/km`}
window.renderTarifs=renderTarifs;
window.TR_peageKm=v=>{try{localStorage.setItem('pr.peagekm',String(parseFloat(String(v).replace(',','.'))||0))}catch(e){}rendre()};
function arriveeKpi(R,pl,kpi){
  const t0=window.TR_t0?TR_t0():Date.now(),tot=R.min+pl.minCharge+pl.stops.reduce((x,s)=>x+(s.detMin||0),0);
  const a=new Date(t0+tot*60000),r5=new Date(Math.round(a.getTime()/300000)*300000);
  const hm=d=>String(d.getHours()).padStart(2,'0')+'h'+String(d.getMinutes()).padStart(2,'0');
  const j=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][r5.getDay()];
  const jd=new Date(r5).toDateString()!==new Date(t0).toDateString();
  return kpi('≈ '+hm(r5),`🏁 Arrivée estimée · entre ${hm(new Date(r5.getTime()-15*60000))} et ${hm(new Date(r5.getTime()+15*60000))} (±15 min)${jd?' · '+j:''}<br>départ ${hm(new Date(t0))}`,1)}
function rendre(){
  const R=TR.route,pl=TR.plan,P=TR.P;if(!R||!pl)return;
  const kpi=(b,l,c)=>`<div class="kpi${c?' p':''}"><b>${b}</b><span>${l}</span></div>`;
  const strip=[`<span class="pill" style="color:var(--blue);border-color:var(--blue)">🔵 Départ ${Math.round(P.soc0)} %</span>`]
    .concat(pl.stops.map((s,i)=>`<span class="pill" style="color:var(--pink);border-color:var(--pink)">${i+1} · ${esc(s.c.s.nom.slice(0,22))} · ${Math.round(s.socArr)}→${Math.round(s.socDep)} %</span>`))
    .concat([`<span class="pill" style="color:${pl.arr>=P.arrSouhaitee-0.5?'var(--green)':'var(--red)'};border-color:currentColor">🏁 Arrivée ${Math.round(pl.arr)} %</span>`]).join(' → ');
  const lignes=pl.stops.map((s,i)=>`<div class="card" style="margin:8px 0;padding:10px">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:2px 12px"><div><b style="color:var(--pink)">Arrêt ${i+1}${s.imposee?' 📌':''} — ${esc(s.c.s.nom)}</b> <span class="muted"><b style="color:var(--blue);font-size:15px">${esc(s.c.cat)}</b> · ${Math.round(s.c.kw)} kW · km ${Math.round(s.km)} · détour ≈ ${(s.c.det/2).toFixed(1).replace('.',',')} km</span></div><div style="margin-left:auto;white-space:nowrap">${ligneStatut(s.c.s)}</div></div>
    🔋 arrivée <b>${Math.round(s.socArr)} %</b> → repart à <b>${Math.round(s.socDep)} %</b>${window.TR_hr?TR_hr(s):''}<br>
    ⏱ temps de charge <b>${fmtH(s.min)}</b><br>
    ⚡ <b>${s.kWh.toFixed(1).replace('.',',')} kWh</b> rechargés<br>
    💶 <b>${fmtE(s.cout)}</b> (${s.prix.eur===0?'gratuit':s.prix.eur.toFixed(3).replace('.',',')+' €/kWh'}${s.prix.carte?' · 🎫 '+esc(s.prix.carte):''})<br>

    <button class="btn s" style="float:right" title="Ajouter / retirer cette borne des bornes favorites" onclick="TR_fav('${jsq(s.c.s.id)}')">${favOui(s.c.s.id)?'★ Favori':'☆ Favori'}</button>
    📍 ${esc(adrBorne(s.c.s))} · <a href="https://www.google.com/maps/search/?api=1&query=${s.c.s.lat},${s.c.s.lon}" target="_blank" rel="noopener">ouvrir dans Maps</a><br>
    ${photoBloc(s.c.s)}
    ${window.TR_extraHtml?TR_extraHtml(s.c.s):''}
    <div style="margin-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:6px"><span style="${(TR.force||{})[s.c.s.id]?'color:var(--pink);font-weight:700':''}">🔋 Repart de cette borne à :</span><select style="width:auto" title="Force le niveau de charge au départ de cette borne : le trajet est recalculé avec cette valeur" onchange="TR_force('${jsq(s.c.s.id)}',this.value)"><option value="">Auto (calcul du planificateur)</option>${[60,70,80,90,100].map(n=>`<option value="${n}"${(TR.force||{})[s.c.s.id]===n?' selected':''}>${n} % (forcé)</option>`).join('')}</select></div>
    ${swapInfoHtml(s)}
    ${swapHtml(s)}
    ${s.imposee&&!(TR.locked||[]).includes(s.c.s.id)?`<a href="javascript:void(0)" onclick="TR_toggle('${jsq(s.c.s.id)}')">✖ retirer cet arrêt imposé</a>`:''}${(TR.locked||[]).includes(s.c.s.id)?'📌 choisi dans ta liste':''}</div>`).join('');
  const C=R.cls||{A:0,N:0,D:0,X:0},tot=(C.A+C.N+C.D+C.X)||1;
  const rp=(k,l,col)=>`<span class="pill" style="color:${col};border-color:${col}" title="${C[k].toFixed(0)} km">${l} ${Math.round(C[k]/tot*100)} % <span style="opacity:.7">· ${Math.round(C[k])} km</span></span>`;
  const routes=[rp('A','Autoroute','#00f3ff'),rp('N','Nationale','#ffb020'),rp('D','Départementale','#39ff88'),rp('X','Autres','#9a9ab0')].join(' ');
  $('tResOut').innerHTML=`<div style="margin:6px 0;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 16px"><div style="line-height:2.1">${strip}</div><div style="margin-left:auto;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end">🛣️ ${routes}</div></div>
    <div class="res">${kpi(Math.round(R.dist)+' km','Distance')}${kpi(fmtH(R.min),'🚗 Temps de conduite (sans recharge)')}${kpi(pl.stops.length,'Arrêt(s)',1)}${kpi(fmtH(pl.minCharge),'Temps de charge')}${kpi(fmtH(R.min+pl.minCharge+pl.stops.reduce((x,s)=>x+(s.detMin||0),0)),'⏱ Durée totale (conduite + charge)')}${kpi(fmtE(pl.coutTotal),'Coût des recharges',1)}${kpi(peageTxt(R),peageLegende(R))}${arriveeKpi(R,pl,kpi)}${kpi(fmtE(pl.coutTotal+peageEur(R)),'💰 Coût total (recharges + péage)',1)}${kpi(Math.round(pl.arr)+' %','Batterie à l\'arrivée')}</div>
    ${pl.alerte?`<p style="color:var(--orange);margin-top:8px">⚠️ ${esc(pl.alerte)}</p>`:''}${lignes||'<p class="muted" style="margin-top:8px">✅ Aucun arrêt nécessaire.</p>'}
    <p class="muted" style="margin-top:6px;font-size:13px">Consommation retenue : ${P.consoVeh.toFixed(1).replace('.',',')} kWh/100 km (vitesse moyenne ${Math.round(R.kmh)} km/h, marge incluse). ${R.toll?'Trajet avec péages.':'Sans péage.'} ${controle()}</p>`;
  $('tResCard').style.display='';
  dessiner()}
/* Contrôle : réseaux écartés moins chers que les arrêts, arrêts sans statut */
function controle(){
  const pl=TR.plan,P=TR.P;if(!pl||!pl.stops.length)return '';
  const seuil=Math.max(...pl.stops.map(s=>s.prix.eur));const moins={};
  TR.cands.filter(c=>!TR.reseaux.has(c.cat)).forEach(c=>{const p=prixReseau(c.cat,c.s).eur;if(p<seuil-0.02&&(!moins[c.cat]||p<moins[c.cat]))moins[c.cat]=p});
  const l=Object.keys(moins).map(r=>`<br>⚠️ <b>${esc(r)}</b> est moins cher (${moins[r].toFixed(2).replace('.',',')} €/kWh) mais n'est pas autorisé — <a href="javascript:void(0)" onclick="TR_net('${r}',true)">autoriser et recalculer</a>`);
  pl.stops.filter(s=>(TR.locked||[]).includes(s.c.s.id)&&statut(s.c.s).c==='hs').forEach(s=>l.push(`<br>🔴 <b>${esc(s.c.s.nom)}</b> (choisie par toi) est signalée hors service — prévois une autre borne ou vérifie sur place.`));
  const nr=pl.stops.filter(s=>!statut(s.c.s).known).length;
  if(nr)l.push(`<br>⚪ ${nr} arrêt${nr>1?'s':''} sur un réseau qui ne publie pas son état en direct : vérifie sur ABRP ou Electroverse avant de partir.`);
  if((TR.exclus||[]).length)l.unshift(`<br>↺ ${TR.exclus.length} borne(s) écartée(s) par toi — <a href="javascript:void(0)" onclick="TR_resetChoix()">tout réinitialiser</a>`);
  return l.join('')}
window.TR_net=(r,on)=>{if(on)TR.reseaux.add(r);else TR.reseaux.delete(r);renderNets();replanifier()};
window.TR_toggle=id=>{if((TR.locked||[]).includes(id))return;const i=TR.imposed.indexOf(id);if(i>=0){TR.imposed.splice(i,1);if(TR.force)delete TR.force[id]}else TR.imposed.push(id);replanifier()};
window.TR_force=(id,v)=>{TR.force=TR.force||{};v=+v;if(v){TR.force[id]=v;if(!TR.imposed.includes(id)&&!(TR.locked||[]).includes(id))TR.imposed.push(id)}else delete TR.force[id];replanifier()};
function jsq(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;')}
function renderNets(){$('tNets').innerHTML=CATS.map(c=>`<button class="btn s ${TR.reseaux.has(c)?'':'g'}" onclick="TR_net('${c}',${!TR.reseaux.has(c)})">${c}</button>`).join(' ')}

/* ---------- carte ---------- */
function initTmap(){
  if(TR.tmap||!window.L||!$('tMapEl'))return;
  TR.tmap=L.map('tMapEl',{zoomControl:true}).setView([47.2,0.4],6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,crossOrigin:true,className:'tiles-dark',attribution:'© OpenStreetMap'}).addTo(TR.tmap);
  TR.layers=L.layerGroup().addTo(TR.tmap)}
function popCand(c){
  const e=estimation(c),pr=prixReseau(c.cat,c.s),ok=e.socArr>=TR.P.mn-0.5;
  const col=!ok?'#ff4466':(e.socArr<TR.P.mn+8?'#ffb020':'#39ff88');
  const imp=TR.imposed.includes(c.s.id);
  return `<div class="pop"><h3>${esc(c.s.nom)}</h3><div class="muted">${esc(c.cat)} · ${Math.round(c.kw)} kW · km ${Math.round(c.km)} · détour ≈ ${(c.det/2).toFixed(1).replace('.',',')} km</div>
   <div style="margin-top:4px">${ligneStatut(c.s)}</div>
   <div style="margin-top:4px">💶 <b>${pr.eur===0?'gratuit':pr.eur.toFixed(3).replace('.',',')+' €/kWh'}</b>${pr.carte?' · 🎫 '+esc(pr.carte):''}</div>
   <div style="margin-top:6px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.07)">🔋 Arrivée à environ <b style="color:${col};font-size:18px">${Math.round(e.socArr)} %</b><br><span class="muted" style="font-size:12px">depuis ${e.kmP?'l\'arrêt à '+Math.round(e.kmP)+' km':'le départ'} (${Math.round(e.sP)} %)</span></div>
   ${ok?'':'<div style="color:var(--red);font-weight:700;margin-top:4px">⚠️ Hors de portée sans recharger avant</div>'}
   ${c.s.note?`<div class="muted" style="font-size:12px;margin-top:4px">${esc(c.s.note)}</div>`:''}
   <div class="acts"><button class="btn s p" onclick="TR_toggle('${jsq(c.s.id)}')">${imp?'✖ Retirer cet arrêt':'➕ Ajouter comme arrêt'}</button><a class="btn s" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.s.lat},${c.s.lon}">🧭</a></div></div>`}
function dessiner(){
  initTmap();if(!TR.tmap)return;const L_=TR.layers;L_.clearLayers();const R=TR.route,pl=TR.plan;
  const line=L.polyline(R.pts.filter((p,i)=>i%3===0||i===R.pts.length-1).map(p=>[p.lat,p.lon]),{color:'#00f3ff',weight:5,opacity:.85}).addTo(L_);
  L.circleMarker([TR.from.lat,TR.from.lon],{radius:8,color:'#00f3ff',fillColor:'#00f3ff',fillOpacity:1}).addTo(L_).bindPopup('Départ : '+esc(TR.from.label||''));
  (TR.via||[]).forEach(v=>{if(v.charge)return;L.circleMarker([v.lat,v.lon],{radius:7,color:'#ffb020',fillColor:'#ffb020',fillOpacity:1}).addTo(L_).bindPopup('Étape : '+esc(v.label||''))});
  L.circleMarker([TR.to.lat,TR.to.lon],{radius:8,color:'#39ff88',fillColor:'#39ff88',fillOpacity:1}).addTo(L_).bindPopup('Arrivée : '+esc(TR.to.label||''));
  const stopIds=new Set(pl.stops.map(s=>s.c.s.id));
  if(TR.showAll)TR.cands.forEach(c=>{if(stopIds.has(c.s.id))return;const st=statut(c.s);const col={libre:'#39ff88',occupe:'#ffb020',hs:'#ff4466',inc:'#6c6c78'}[st.c]||'#6c6c78';
    L.circleMarker([c.s.lat,c.s.lon],{radius:TR.imposed.includes(c.s.id)?9:6,color:TR.reseaux.has(c.cat)?col:'#555',fillColor:col,fillOpacity:TR.reseaux.has(c.cat)?.85:.3,weight:2}).addTo(L_).bindPopup(()=>popCand(c),{maxWidth:300})});
  pl.stops.forEach((s,i)=>{const icon=L.divIcon({className:'',html:`<div class="mk" style="width:34px;height:34px;border-color:${s.imposee?'#ffb020':'#ff00ff'};box-shadow:0 0 10px #ff00ff;font-size:15px">${i+1}</div>`,iconSize:[34,34],iconAnchor:[17,17]});
    L.marker([s.c.s.lat,s.c.s.lon],{icon,zIndexOffset:1000}).addTo(L_).bindPopup(()=>popCand(s.c),{maxWidth:300})});
  if(!TR.fitted||TR.fitted!==R){TR.tmap.fitBounds(line.getBounds(),{padding:[20,20]});TR.fitted=R}
  setTimeout(()=>TR.tmap.invalidateSize(),50)}

/* ---------- Google Maps / ABRP / enregistrement ---------- */
function etapes(){const R=TR.route,pl=TR.plan;
  const a=pl.stops.map(s=>({lat:s.c.s.lat,lon:s.c.s.lon,label:s.c.s.nom,km:s.km,ch:1}));
  const b=(TR.via||[]).map((v,i)=>({lat:v.lat,lon:v.lon,label:v.label,km:R.wpKm[i+1],ch:0})).filter(v=>!a.some(x=>dkm(x.lat,x.lon,v.lat,v.lon)<0.15));
  return a.concat(b).sort((x,y)=>x.km-y.km)}
function lienGMaps(){const F=TR.from,T=TR.to;
  const w=etapes().slice(0,9).map(s=>s.lat.toFixed(5)+','+s.lon.toFixed(5)).join('|');
  return 'https://www.google.com/maps/dir/?api=1&origin='+F.lat+','+F.lon+'&destination='+T.lat+','+T.lon+(w?'&waypoints='+encodeURIComponent(w):'')+'&travelmode=driving'}
function lienABRP(){const pts=[TR.from].concat(etapes(),[TR.to]);
  return 'https://abetterrouteplanner.com/?destinations='+encodeURIComponent(JSON.stringify(pts.map(p=>({lat:p.lat,lon:p.lon,address:p.label||undefined}))))}

function renderTarifs(){
  let c=$('tarifsCard');if(!c){c=document.createElement('div');c.className='card';c.id='tarifsCard';$('t-reglages').insertBefore(c,$('t-reglages').children[2]||null)}
  const t=TAR();const age=t?Math.round((Date.now()-Date.parse(t.date))/86400000):null;
  const lignes=t?Object.keys(t.reseaux).map(r=>{const x=t.reseaux[r];return `<tr><td>${esc(r)}</td><td><b>${x.eur.toFixed(3).replace('.',',')} €</b></td><td>${x.carte?'🎫 '+esc(x.carte):'<span class="muted">plein tarif</span>'}</td></tr>`}).join(''):'';
  const abos=t&&t.abonnements?t.abonnements.filter(a=>a.type==='abonnement'||a.prixMensuel>0).map(a=>`${esc(a.nom)} (${a.prixMensuel.toFixed(2).replace('.',',')} €/mois${a.enPauseCeMois?', en pause':''})`).join(' · '):'';
  c.innerHTML=`<h2>💳 TARIFS ET ABONNEMENTS</h2><p class="muted">Gère tes abonnements et le prix de chaque réseau dans l'onglet « Abonnements ». Sans réglage, l'appli utilise ton prix moyen de recharge rapide (Réglages).</p>`;
  if(window.TR_tarifsExtra){try{c.insertAdjacentHTML('beforeend',TR_tarifsExtra())}catch(e){console.error(e);c.insertAdjacentHTML('beforeend','<p style="color:var(--red);margin-top:10px">⚠ Affichage des abonnements impossible : '+esc(e.message||e)+'</p>')}}
}

/* ---------- borne manquante ---------- */
window.TR_addManq=()=>{
  const m=$('tmCoord').value.match(/(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)/);if(!m){toast('Colle les coordonnées comme sur Google Maps : 48.7529, 0.9230');return}
  const lat=+m[1].replace(',','.'),lon=+m[2].replace(',','.');const kw=+$('tmKw').value||150;
  putItem('manq_'+uid(),'manq',{nom:$('tmNom').value.trim()||'Borne ajoutée',lat,lon,cat:$('tmRes').value,kw,pdc:[kw,kw],adr:''});
  $('tmBox').style.display='none';toast('✅ Borne ajoutée');if(TR.route)calculer()};

/* ---------- construction de l'onglet ---------- */
/* ---------- liste de destinations déplaçables (comme ABRP) ---------- */
const HOME_DEF=null;
const COMMOD=[['🍴','Restaurant','restaurant'],['🛍️','Shopping','supermarché'],['🛏️','Hôtel','hôtel'],['☕','Café','café']];
function saveDest(){try{localStorage.setItem('pr.dest',JSON.stringify(TR.dest))}catch(e){}}
function lireHist(){try{return JSON.parse(localStorage.getItem('pr.hist')||'[]')}catch(e){return[]}}
function pushHist(p){if(!p||p.lat==null||p.label==='Ma position')return;try{const h=lireHist().filter(x=>x.label!==p.label);h.unshift({label:p.label,lat:p.lat,lon:p.lon});localStorage.setItem('pr.hist',JSON.stringify(h.slice(0,12)))}catch(e){}}
function homePref(){const it=DB.items.dest_prefs;return it&&!it.deleted&&it.data&&it.data.home||null}
async function domicile(){return homePref()||null}
function changed(){saveDest();renderDest();
  if(TR.route){clearTimeout(TR._t);TR._t=setTimeout(()=>{const d=TR.dest;if(d.length>=2&&d[0].lat!=null&&d[d.length-1].lat!=null){if(TR.busy)TR._again=true;else calculer()}},800)}}
function initDest(){let d=null;try{d=JSON.parse(localStorage.getItem('pr.dest')||'null')}catch(e){}
  TR.dest=Array.isArray(d)&&d.length>=2?d:[{free:true},{free:true}];renderDest();
  const el=$('tDest');
  el.onclick=e=>{const t=e.target.closest('[data-a]');if(!t)return;const i=+t.dataset.i,a=t.dataset.a;
    if(a==='edit')ouvrirRecherche(i);
    else if(a==='del'){if(TR.dest.length>2)TR.dest.splice(i,1);else TR.dest[i]={free:true};changed()}
    else if(a==='ico'){const d=TR.dest[i];if(d&&d.station&&i>0&&i<TR.dest.length-1){d.charge=d.charge===false;changed()}}};
  dragInit();
  if(TR.dest[0].free)domicile().then(h=>{if(h&&TR.dest[0]&&TR.dest[0].free){TR.dest[0]=Object.assign({},h);renderDest();saveDest()}}).catch(()=>{})}
function renderDest(){const el=$('tDest');if(!el)return;const n=TR.dest.length;
  el.innerHTML=TR.dest.map((d,i)=>{
    const vide=d.lat==null;
    const ico=d.station?((i>0&&i<n-1&&d.charge===false)?'🔌':'⚡'):(i===0?'🔵':i===n-1?'🏁':'📍');
    const txt=vide?(i===0?'Départ : choisir un lieu…':i===n-1?'Arrivée : choisir un lieu…':'Quelque part sur votre route'):esc(d.label||'');
    const sub=!vide&&d.station&&i>0&&i<n-1?`<div class="muted" style="font-size:11px">${d.charge===false?'passage sans recharge':'arrêt de recharge imposé'} · touche ⚡ pour changer</div>`:'';
    return `<div class="drow" data-i="${i}" style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:12px;padding:8px 8px;margin:6px 0">
      <span class="dh" style="cursor:grab;touch-action:none;font-size:18px;opacity:.75;padding:6px 8px;user-select:none;-webkit-user-select:none" title="Glisser pour changer l'ordre">⋮⋮</span>
      <span data-a="ico" data-i="${i}" title="${d.station&&i>0&&i<n-1?'Arrêt de recharge / simple passage (touche pour changer)':''}" style="font-size:16px;cursor:pointer">${ico}</span>
      <div data-a="edit" data-i="${i}" style="flex:1;min-width:0;cursor:pointer;${vide?'opacity:.55':''}"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${txt}</div>${sub}</div>
      <span data-a="del" data-i="${i}" title="Retirer cette étape" style="cursor:pointer;opacity:.75;padding:6px 10px">✕</span></div>`}).join('')}
function dragInit(){const el=$('tDest');
  el.addEventListener('pointerdown',e=>{const h=e.target.closest('.dh');if(!h)return;e.preventDefault();
    const row=h.closest('.drow'),rs=[...el.querySelectorAll('.drow')],from=rs.indexOf(row);
    const hs=rs.map(r=>r.getBoundingClientRect()),step=hs[from].height+12,startY=e.clientY;let to=from;
    row.style.position='relative';row.style.zIndex='5';row.style.boxShadow='0 0 14px #00f3ff';row.style.transition='none';
    const move=ev=>{const dy=ev.clientY-startY;row.style.transform=`translateY(${dy}px)`;
      const ctr=hs[from].top+hs[from].height/2+dy;
      to=rs.filter((r,k)=>k!==from&&hs[k].top+hs[k].height/2<ctr).length;
      rs.forEach((r,k)=>{if(k===from)return;let sh=0;if(from<to&&k>from&&k<=to)sh=-step;else if(from>to&&k>=to&&k<from)sh=step;r.style.transition='transform .12s';r.style.transform=sh?`translateY(${sh}px)`:'none'})};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);
      if(to!==from){const it=TR.dest.splice(from,1)[0];TR.dest.splice(to,0,it);changed()}else renderDest()};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up)})}
function lieuxSauves(){const out=[];const h=homePref();
  out.push({label:'Domicile',ico:'🏠',home:true,place:h});
  items('fav').forEach(f=>{const d=f.data;if(d.lat==null)return;out.push({label:d.nom,ico:'⚡',place:{label:d.nom,lat:d.lat,lon:d.lon,station:favToStation(d),charge:true}})});
  MANQUANTES.concat(items('manq').map(x=>x.data)).forEach(m=>{const st=stationManq(m);if(out.some(o=>o.place&&o.place.station&&o.place.station.id===st.id))return;
    out.push({label:m.nom,ico:'⚡',place:{label:m.nom,lat:m.lat,lon:m.lon,station:st,charge:true}})});
  return out}
function ouvrirRecherche(i,mode){
  const old=$('tSrch');if(old)old.remove();
  const ov=document.createElement('div');ov.id='tSrch';
  ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(5,5,12,.97);overflow:auto;padding:14px';
  ov.innerHTML=`<div style="max-width:600px;margin:0 auto"><div style="display:flex;gap:8px;align-items:center"><button class="btn s" id="sBack" title="Retour">←</button><input id="sQ" placeholder="Où voulez-vous aller ?" style="flex:1" autocomplete="off"></div>
    <div class="muted" style="margin:12px 0 4px;font-size:13px" id="sSavT">Destinations sauvegardées</div><div id="sSav" style="display:flex;flex-wrap:wrap;gap:6px"></div>
    <div class="muted" style="margin:12px 0 4px;font-size:13px">Recherche de commodités</div><div id="sCom" style="display:flex;flex-wrap:wrap;gap:6px"></div>
    <div id="sList" style="margin-top:12px"></div></div>`;
  document.body.appendChild(ov);
  const close=()=>{ov.remove()};let md=mode||null,res=[],tmr=null,tout=0;
  const choisir=p=>{if(md==='home'){const h={label:'Domicile',lat:p.lat,lon:p.lon,home:true};putItem('dest_prefs','dest_prefs',{home:h});toast('🏠 Domicile enregistré');md=null;$('sQ').placeholder='Où voulez-vous aller ?';$('sQ').value='';$('sSavT').textContent='Destinations sauvegardées';chips();liste();return}
    TR.dest[i]=Object.assign({},p);pushHist(p);close();changed()};
  const ref=()=>{const d=TR.dest;for(let k=i-1;k>=0;k--)if(d[k]&&d[k].lat!=null)return d[k];for(let k=i+1;k<d.length;k++)if(d[k]&&d[k].lat!=null)return d[k];return null};
  const chips=()=>{const sv=lieuxSauves();res=[];$('sSav').innerHTML='';
    const tot=sv.length;let ouvert=false;
    const draw=()=>{$('sSav').innerHTML=sv.slice(0,ouvert?99:5).map((o,k)=>`<button class="btn s" data-k="${k}" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.ico} ${esc(o.label.slice(0,34))}</button>`).join('')
      +(tot>5?`<button class="btn s g" id="sMore">${ouvert?'▲':'▼ '+(tot-5)+' de plus'}</button>`:'')+`<button class="btn s g" id="sHome">✏️ Changer domicile</button>`;
      $('sSav').querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const o=sv[+b.dataset.k];if(o.home&&!o.place){domicile().then(h=>{if(h)choisir(Object.assign({},h));else $('sHome').click()})}else choisir(o.place)});
      const m=$('sMore');if(m)m.onclick=()=>{ouvert=!ouvert;draw()};
      $('sHome').onclick=()=>{md='home';$('sQ').placeholder='Adresse du domicile…';$('sQ').focus();$('sSavT').textContent='Tape l\'adresse de ton domicile'}};draw()};
  $('sCom').innerHTML=COMMOD.map((c,k)=>`<button class="btn s" data-c="${k}">${c[0]} ${c[1]}</button>`).join('');
  const chercher=async(q,vb)=>{const my=++tout;$('sList').innerHTML='<p class="muted">⏳ Recherche…</p>';
    try{let u='https://nominatim.openstreetmap.org/search?format=json&countrycodes=fr&limit=8&q='+encodeURIComponent(q);
      if(vb)u+='&viewbox='+vb+'&bounded=1';
      const j=await fetchJson(u);if(my!==tout)return;
      res=j.map(r=>({label:r.display_name.split(',').slice(0,3).join(',').trim(),lat:+r.lat,lon:+r.lon}));
      const loc=q.length>=2?lieuxSauves().filter(o=>o.place&&o.label.toLowerCase().includes(q.toLowerCase())).map(o=>Object.assign({ico:'⚡'},o.place)):[];
      const all=loc.map(p=>Object.assign({ico:'⚡'},p)).concat(res.map(p=>Object.assign({ico:'📍'},p)));res=all;
      $('sList').innerHTML=all.length?all.map((p,k)=>`<div data-r="${k}" style="padding:12px 6px;border-bottom:1px solid var(--line);cursor:pointer">${p.ico} ${esc(p.label)}</div>`).join(''):'<p class="muted">Aucun résultat.</p>'}
    catch(e){if(my===tout)$('sList').innerHTML='<p style="color:var(--orange)">⚠ Recherche impossible : '+esc(e.message||'')+'</p>'}};
  const liste=()=>{res=[];const h=lireHist();
    $('sList').innerHTML=`<div data-p="1" style="padding:12px 6px;border-bottom:1px solid var(--line);cursor:pointer">📍 Ma position</div>`+h.map((p,k)=>`<div data-h="${k}" style="padding:12px 6px;border-bottom:1px solid var(--line);cursor:pointer">🕘 ${esc(p.label)}</div>`).join('')};
  $('sList').onclick=e=>{const r=e.target.closest('[data-r]'),hh=e.target.closest('[data-h]'),pp=e.target.closest('[data-p]');
    if(r){const p=res[+r.dataset.r];choisir(p.station?Object.assign({},p):{label:p.label,lat:p.lat,lon:p.lon})}
    else if(hh){const p=lireHist()[+hh.dataset.h];choisir({label:p.label,lat:p.lat,lon:p.lon})}
    else if(pp){if(!navigator.geolocation)return toast('Géolocalisation indisponible');toast('📍 Recherche de ta position…');navigator.geolocation.getCurrentPosition(g=>choisir({label:'Ma position',lat:g.coords.latitude,lon:g.coords.longitude}),()=>toast('Position refusée ou introuvable'),{enableHighAccuracy:true,timeout:10000})}};
  $('sCom').onclick=e=>{const b=e.target.closest('[data-c]');if(!b)return;const c=COMMOD[+b.dataset.c],r=ref();if(!r)return toast('Choisis d\'abord un autre lieu pour chercher à côté');
    const dl=0.15,dn=0.15/Math.cos(rad(r.lat));$('sQ').value=c[1];chercher(c[2],(r.lon-dn).toFixed(4)+','+(r.lat+dl).toFixed(4)+','+(r.lon+dn).toFixed(4)+','+(r.lat-dl).toFixed(4))};
  $('sQ').addEventListener('input',()=>{clearTimeout(tmr);const q=$('sQ').value.trim();if(q.length<3){if(!q)liste();return}tmr=setTimeout(()=>chercher(q),500)});
  $('sQ').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(tmr);const q=$('sQ').value.trim();if(q.length>=2)chercher(q)}});
  $('sBack').onclick=close;chips();liste();setTimeout(()=>$('sQ').focus(),100)}

function construire(){
  const sec=$('t-trajet');if(!sec)return;
  sec.innerHTML=`<div class="card"><h2>🛣️ PLANIFIER UN TRAJET</h2>
   <label class="muted" style="font-size:13px">Destinations</label><div id="tDest"></div>
   <div class="row" style="margin-top:6px"><button class="btn s" id="tAdd" title="Ajouter une étape entre le départ et l'arrivée">＋ Ajouter un arrêt</button></div>
   <div class="row" style="margin-top:10px">
    <div class="f"><label>Véhicule</label><select id="tVeh">${window.vehOpts?vehOpts():'<option value="g6">Mon véhicule</option>'}</select></div>
    <div class="f"><label>Météo</label><select id="tMeteo"><option value="doux">Doux</option><option value="froid">Froid (hiver)</option></select></div>
    <div class="f"><label>Marge sur la conso (%)</label><input type="number" id="tMarge" value="10" min="0" max="40"></div>
    <div class="f"><label>Priorité</label><select id="tPrio"><option value="prix">💶 Le moins cher</option><option value="equilibre" selected>⚖️ Équilibré</option><option value="rapide">⏱ Le plus rapide</option></select></div></div>
   <div class="row" style="margin-top:10px">
    <div class="f"><label>Batterie au départ : <b id="tSocL">100 %</b></label><input type="range" id="tSoc" min="10" max="100" value="100"></div>
    <div class="f"><label>Arrivée souhaitée : <b id="tArrL">20 %</b></label><input type="range" id="tArr" min="5" max="60" value="20"></div>
    <div class="f"><label>Arriver aux bornes entre (%)</label><div class="row" style="gap:6px;flex-wrap:nowrap"><input type="number" id="tMn" value="10" min="5" max="30"><input type="number" id="tMx" value="15" min="8" max="40"></div></div>
    <div class="f"><label>Charger jusqu'à (%)</label><input type="number" id="tCible" value="80" min="50" max="100"></div>
    <div class="f"><label>Puissance mini des bornes</label><select id="tKw"><option value="50">50 kW</option><option value="100" selected>100 kW</option><option value="150">150 kW</option><option value="200">200 kW</option></select></div></div>
   <div style="margin-top:10px"><label class="muted" style="font-size:13px">Réseaux autorisés</label><div id="tNets" style="margin-top:4px"></div></div>
   <div class="row" style="margin-top:10px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="tPeage"> Éviter les péages</label>
    <button class="btn p" id="tGo">⚡ Calculer le trajet</button><button class="btn" id="tAll">🔌 Voir toutes les bornes du trajet</button></div>
   <p id="tMsg" class="muted" style="margin-top:8px;display:none"></p></div>
  <div class="card" id="tResCard" style="display:none"><h2>📍 TON TRAJET</h2><div id="tResOut"></div>
   <div class="row" style="margin-top:10px"><a class="btn" id="tGm" target="_blank" rel="noopener">🧭 Ouvrir dans Google Maps</a><a class="btn" id="tAbrp" target="_blank" rel="noopener">⚡ Planifier dans ABRP</a><button class="btn p" id="tSave">💾 Enregistrer le trajet</button><button class="btn" id="tFav" onclick="TR_saveTrajetFav()">⭐ Trajet en favori</button></div>
   <p class="muted" style="font-size:13px;margin-top:6px">Touche une borne sur la carte pour voir ta batterie à l'arrivée, son prix, son statut — et l'ajouter comme arrêt de ton choix.</p></div>
  <div class="card"><div class="row" style="margin-bottom:6px"><button class="btn s" id="tBig">⤢ Agrandir la carte</button></div><div id="tMapEl" style="height:max(640px,80vh);border-radius:14px;border:1px solid var(--line)"></div></div>
  <div class="card"><p><a href="javascript:void(0)" onclick="$('tmBox').style.display=$('tmBox').style.display==='none'?'':'none'">➕ Une borne que tu connais manque ?</a></p>
   <div id="tmBox" style="display:none;margin-top:8px"><div class="row"><div class="f" style="flex:2"><label>Nom</label><input id="tmNom" placeholder="ex. IE Charge Verneuil"></div>
    <div class="f" style="flex:2"><label>Coordonnées (Google Maps)</label><input id="tmCoord" placeholder="48.7529, 0.9230"></div>
    <div class="f"><label>Réseau</label><select id="tmRes">${CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
    <div class="f"><label>kW</label><input type="number" id="tmKw" value="150"></div><button class="btn p" onclick="TR_addManq()">Ajouter</button></div></div></div>`;
  loadForm();renderNets();initDest();
  ['tVeh','tMeteo','tMarge','tPrio','tSoc','tArr','tMn','tMx','tCible','tKw'].forEach(i=>$(i).addEventListener('input',()=>{
    $('tSocL').textContent=$('tSoc').value+' %';$('tArrL').textContent=$('tArr').value+' %';saveForm();
    if(TR.route&&['tKw'].indexOf(i)<0)replanifier()}));
  $('tKw').addEventListener('change',()=>{if(TR.route)calculer()});
  $('tSocL').textContent=$('tSoc').value+' %';$('tArrL').textContent=$('tArr').value+' %';
  $('tGo').onclick=calculer;
  $('tAll').onclick=()=>{TR.showAll=!TR.showAll;$('tAll').classList.toggle('p',TR.showAll);if(TR.route)dessiner()};
  $('tBig').onclick=()=>{const g=$('tMapEl'),big=g.dataset.big!=='1';g.dataset.big=big?'1':'';g.style.height=big?'max(900px,96vh)':'max(640px,80vh)';$('tBig').textContent=big?'⤡ Réduire la carte':'⤢ Agrandir la carte';if(TR.tmap)setTimeout(()=>{TR.tmap.invalidateSize();g.scrollIntoView({behavior:'smooth',block:'start'})},80)};
  $('tAdd').onclick=()=>{TR.dest.splice(TR.dest.length-1,0,{free:true});renderDest();saveDest();ouvrirRecherche(TR.dest.length-2)};
  $('tGm').addEventListener('click',()=>{$('tGm').href=lienGMaps()});$('tAbrp').addEventListener('click',()=>{$('tAbrp').href=lienABRP()});
  $('tSave').onclick=()=>{const R=TR.route,pl=TR.plan,P=TR.P;if(!R||!pl)return;
    putItem('plan_'+uid(),'plan',{kind:'trajet',veh:$('tVeh').value,vehNom:P.v.nom,km:Math.round(R.dist),soc:P.soc0,res:P.mn,arr:Math.round(pl.arr),stops:pl.stops.length,chargeMin:Math.round(pl.minCharge),cout:Math.round(pl.coutTotal*100)/100,route:'valhalla',meteo:$('tMeteo').value,date:new Date().toISOString()});
    toast('💾 Trajet enregistré');renderHist()};
  renderTarifs()}
/* L'ancien calcul est remplacé : l'onglet ne se met à jour que sur demande */
const _renderAll=window.renderAll;
window.renderAll=function(){_renderAll();try{renderTarifs();renderTrajetsFavs()}catch(e){}};
setTimeout(()=>{const q=$('tfQ');if(q)q.addEventListener('input',()=>renderTrajetsFavs());renderTrajetsFavs()},0);
window.calcTrajet=function(){if(TR.tmap)setTimeout(()=>TR.tmap.invalidateSize(),60)};
construire();
})();
