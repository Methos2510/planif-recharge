/* Planif Recharge — abonnements & grille de prix (repris de G6 Suivi) : tous les prix sont calculés automatiquement */
(function(){
'use strict';
const T=()=>window.TR;
const AB=()=>{const it=DB.items.abos;return it&&!it.deleted&&it.data&&it.data.tarifs?it.data:null};
const save=d=>{d.maj=Date.now();putItem('abos','abos',d)};
const pos=n=>Math.max(0,n);
const f2=v=>(+v).toFixed(3).replace('.',',');
/* ---- calcul (port fidèle de G6 Suivi) ---- */
function parsePrix(v){if(v===null||v===undefined||v==='')return null;const txt=String(v).replace(/,/g,'.').trim();
  const nu=txt.replace(/€/g,'').replace(/\/?\s*kwh/gi,'').trim();const f=nu.match(/^([\d.]+)\s*(?:-|–|à)\s*([\d.]+)$/);
  if(f){const a=parseFloat(f[1]),b=parseFloat(f[2]);if(isNaN(a)||isNaN(b))return null;return{min:Math.min(a,b),max:Math.max(a,b),moy:(a+b)/2,fourchette:true}}
  const n=parseFloat(txt);return isNaN(n)?null:{min:n,max:n,moy:n,fourchette:false}}
const jourISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const mkey=d=>`${d.getFullYear()}-${d.getMonth()}`;
function promoActive(o,d){const l=o&&o.promos;if(!Array.isArray(l)||!l.length)return null;const iso=jourISO(d);
  return l.filter(p=>p&&p.du&&p.au&&p.du<=iso&&iso<=p.au).sort((a,b)=>String(b.du).localeCompare(String(a.du)))[0]||null}
function cashback(o,d){const p=promoActive(o,d);if(p&&p.taux!==undefined&&p.taux!==null&&p.taux!=='')return Math.min(100,Math.max(0,+p.taux||0));
  const m=o&&o.cashbackMois;if(m){const v=m[mkey(d)];if(v!==undefined&&v!==null&&v!=='')return Math.min(100,Math.max(0,+v||0))}
  return Math.min(100,Math.max(0,+(o&&o.cashback)||0))}
function regleDe(D,via){if(!via||via==='__autre')return null;const s=(D.subs||[]).find(x=>x.id===via),r=s&&s.regle;if(!r||!r.mode||r.mode==='aucune')return null;
  return{mode:r.mode,kwh:+r.kwh||0,session:+r.session||0,pct:Math.min(100,Math.max(0,+r.pct||0))}}
function appliquerRegle(p,r){if(!p||!r)return null;const g=v=>r.mode==='majore'?v+r.kwh:r.mode==='remise'?pos(v*(1-r.pct/100)-r.kwh):v;
  return{min:pos(g(p.min)),max:pos(g(p.max)),moy:pos(g(p.moy)),fourchette:p.fourchette}}
function actif(D,via,d){if(!via)return false;if(via==='__autre')return true;const s=(D.subs||[]).find(x=>x.id===via);return s?!((s.paused||{})[mkey(d)]):true}
function nomCarte(D,via){if(!via)return 'sans abonnement';if(via==='__autre')return 'autre carte';const s=(D.subs||[]).find(x=>x.id===via);return s?s.name:'abonnement'}
function offres(D,lieu){const t=D.tarifs[lieu];if(!t)return[];const l=[{idx:-1,via:t.via,avec:t.avec,remise:t.remise,cashback:t.cashback,cashbackMois:t.cashbackMois,promos:t.promos}];
  (t.alternatives||[]).forEach((a,i)=>a&&l.push({idx:i,via:a.via,avec:a.avec,remise:a.remise,cashback:a.cashback,cashbackMois:a.cashbackMois,promos:a.promos}));return l}
function calculer(D,lieu,o,d){const t=D.tarifs[lieu];if(!t)return null;const plein=parsePrix(t.sans),act=actif(D,o.via,d),regle=act?regleDe(D,o.via):null;
  if(act&&o.idx>=0&&!parsePrix(o.avec)&&!(+o.remise>0)&&!regle)return null;
  let base=null;
  if(act){const fixe=parsePrix(o.avec),rem=Math.max(0,+o.remise||0);
    if(fixe)base=fixe;else if(plein&&rem>0)base={min:pos(plein.min-rem),max:pos(plein.max-rem),moy:pos(plein.moy-rem),fourchette:plein.fourchette};
    else if(regle&&plein)base=appliquerRegle(plein,regle);else base=plein}else base=plein;
  if(!base)return null;
  const taux=act?cashback(o,d):0,k=1-taux/100;
  return{eur:pos(base.moy*k),brut:pos(base.moy),cashback:taux,promo:act?promoActive(o,d):null,abo:act,via:o.via,fraisSession:(act&&regle)?regle.session:0,carte:nomCarte(D,o.via)}}
function meilleure(D,lieu,d){const c=offres(D,lieu).map(o=>calculer(D,lieu,o,d)).filter(Boolean).sort((a,b)=>a.brut-b.brut);return c[0]||null}
const lieuDe=cat=>cat==='Tesla'?'Tesla Supercharger':cat;
/* ---- branché sur le planificateur ---- */
window.TR_aboPrix=function(cat,s){const D=AB();if(!D)return null;const lieu=lieuDe(cat);if(!D.tarifs[lieu])return null;
  const t=T(),d=new Date((t&&t.tArr)||Date.now()),b=meilleure(D,lieu,d);if(!b)return null;
  return{eur:b.brut,net:b.eur,carte:b.abo&&b.carte&&b.carte!=='sans abonnement'?b.carte:null,fs:b.fraisSession||0,src:'abos',cashback:b.cashback}};
window.TR_remiseAbos=function(){const D=AB();if(!D)return null;const s=(D.subs||[]).find(x=>x.id==='electra');if(!s)return{remise:0,carte:null};
  if(!actif(D,'electra',new Date((T()&&T().tArr)||Date.now())))return{remise:0,carte:null};
  return{remise:/essential/i.test(String(s.name))?0.10:0.20,carte:String(s.name||'Electra')}};
window.TR_abosImport=function(j){if(j&&j.tarifsBruts&&j.subsBruts){const old=AB(),D={subs:j.subsBruts,tarifs:j.tarifsBruts,flags:(old&&old.flags)||{}};
  if(old)D.subs.forEach(s=>{const o=(old.subs||[]).find(x=>x.id===s.id);if(o&&o.prixHist&&!s.prixHist)s.prixHist=o.prixHist});
  patchAtlante(D,true);save(D);return true}return false};
function patchAtlante(){return false}
/* ---- panneau ---- */
const RES=['Atlante','Electra','Ionity','Fastned','TotalEnergies','Tesla Supercharger','Allego','Freshmile','Izivia','Powerdot','Autre'];
const refresh=()=>{if(window.renderAbos)renderAbos();if(window.renderTarifs)renderTarifs();if(T()&&T().route&&window.TR_replan)TR_replan()};
const COUL={Atlante:'#ff2dc8',Electra:'#b026ff',Ionity:'#ff4466',Fastned:'#00d9a0',Powerdot:'#6c7bff',TotalEnergies:'#ffb020','Tesla Supercharger':'#ff6b6b',Allego:'#39ff88',Freshmile:'#00f3ff',Izivia:'#7cc7ff',Autre:'#9a9ab0'};
const BORD=['#ff00ff','#00f3ff','#b026ff','#39ff88','#ffb020'];
const MOIS=['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const st=document.createElement('style');st.textContent=`
.ab-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px;margin-top:10px}
.ab-card{padding:14px;border:1px solid var(--c);border-radius:18px;background:var(--panel);box-shadow:0 0 14px color-mix(in srgb,var(--c) 22%,transparent)}
.ab-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.ab-card input.ab-n{font-size:20px;font-weight:700;width:100%;border-radius:12px}
.ab-row2{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.ab-cost{text-align:right;white-space:nowrap}.ab-cost small{display:block;font-size:11px;color:var(--mute);letter-spacing:.06em}.ab-cost b{font-family:Orbitron,sans-serif;font-size:22px;color:var(--c)}
.ab-m{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 6px}
.ab-m button{padding:6px 0;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:var(--mute);font-size:13px;cursor:pointer;line-height:1.5}
.ab-m button.on{border-color:var(--c);color:#fff;font-weight:700;background:color-mix(in srgb,var(--c) 14%,transparent)}
.ab-h{display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);color:var(--mute);font-size:13px;font-weight:700;letter-spacing:.05em}
.ab-r{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 10px;padding:10px 12px;margin-bottom:8px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(0,0,0,.28);cursor:pointer}
.ab-r:hover{border-color:var(--blue)}
.ab-p{padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.07);font-weight:700;font-size:14px}
.ab-r .l{text-decoration:underline;color:var(--mute)}
`;document.head.appendChild(st);
const mkM=(y,m)=>y+'-'+String(m+1).padStart(2,'0');
function priceFor(s,y,m){let p=+s.price||0;const k=mkM(y,m);(s.prixHist||[]).slice().sort((a,b)=>String(a.from).localeCompare(String(b.from))).forEach(h=>{if(h.from<=k)p=+h.prix||0});return p}
function cout(s){const y=new Date().getFullYear();return Array.from({length:12},(_,m)=>m).reduce((a,m)=>a+(((s.paused||{})[y+'-'+m])?0:priceFor(s,y,m)),0)}
const mois=s=>{const y=new Date().getFullYear();return Array.from({length:12},(_,m)=>!(s.paused||{})[y+'-'+m])};
function reseauxDe(D,sub,d){const out=[];
  RES.forEach(r=>{const t=D.tarifs[r];if(!t)return;const pl=parsePrix(t.sans);
    offres(D,r).forEach(o=>{if(o.via!==sub.id)return;
      const D2={subs:(D.subs||[]).map(x=>x.id===sub.id?Object.assign({},x,{paused:{}}):x),tarifs:D.tarifs};
      const c=calculer(D2,r,Object.assign({idx:Math.max(o.idx,0)>=0?o.idx:0},o),d);if(!c)return;
      out.push({r,c,pl})})});return out}
const rowHtml=(x)=>{const col=COUL[x.r]||'var(--blue)',pl=x.pl,pt=pl?(pl.fourchette?f2(pl.min)+' – '+f2(pl.max):f2(pl.moy)):null;
  return `<div class="ab-r" title="Modifier les prix de ce réseau" onclick="TR_aboEdit('${esc(x.r)}')"><b style="color:${col};font-size:18px">${esc(x.r)}</b>
   <span style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;justify-content:flex-end"><span class="ab-p">${f2(x.c.brut)} €/kWh</span>${x.c.cashback?`<span style="color:var(--green);font-size:13px">−${Math.round(x.c.cashback)} % cashback</span>`:''}${pt?`<span class="muted" style="font-size:13px">plein tarif <span class="l">${pt} €</span></span>`:''}<span>net <b style="color:var(--green);font-size:17px">${f2(x.c.eur)} €</b></span></span></div>`};
const carte=(D,s,i,d)=>{const col=BORD[i%BORD.length],on=mois(s),act=on.filter(Boolean).length,prix=+s.price||0,hist=(s.prixHist||[]).slice().sort((a,b)=>String(a.from).localeCompare(String(b.from))),pay=prix>0||hist.some(h=>+h.prix>0),rs=reseauxDe(D,s,d);
  return `<div class="ab-card" style="--c:${col}"><div class="ab-top"><div style="flex:1"><input class="ab-n" value="${esc(s.name)}" onchange="TR_abosField('${esc(s.id)}','name',this.value)">
   <div class="ab-row2"><input type="number" step="0.01" min="0" value="${prix}" style="width:90px" onchange="TR_abosField('${esc(s.id)}','price',this.value)"><span class="muted">€/mois</span><span class="pill" style="font-size:12px">${s.type==='badge'||!pay?'🏷️ Badge':'💳 Abonnement'}</span><button class="btn s" title="Le prix change à partir d'un mois : les mois passés gardent l'ancien prix" onclick="TR_abosPrix('${esc(s.id)}')">💶 Nouveau prix</button><button class="btn s g" title="Supprimer" onclick="TR_abosDel('${esc(s.id)}')">🗑️</button></div></div>
   ${pay?`<div class="ab-cost"><small>COÛT ${new Date().getFullYear()}</small><b>${cout(s).toFixed(2).replace('.',',')} €</b></div>`:''}</div>
   ${hist.length?`<div class="muted" style="font-size:13px;margin-top:6px">${hist.map(h=>`💶 dès <b>${MOIS[+h.from.slice(5)-1]} ${h.from.slice(0,4)}</b> : <b style="color:var(--green)">${(+h.prix).toFixed(2).replace('.',',')} €/mois</b> <a href="javascript:void(0)" title="Supprimer ce changement de prix" onclick="TR_abosPrixDel('${esc(s.id)}','${h.from}')">✖</a>`).join(' · ')} <span>(avant : ancien prix conservé)</span></div>`:''}
   <div class="ab-m">${MOIS.map((n,m)=>`<button class="${on[m]?'on':''}" title="${on[m]?'Actif : touche pour mettre en pause':'En pause : touche pour réactiver'}" onclick="TR_abosMois('${esc(s.id)}',${m})">${n}<br>${on[m]?'▶':'⏸'}</button>`).join('')}</div>
   <div class="muted" style="font-size:13px">${12-act} mois en pause${pay?' (non comptés)':''}</div>
   <div class="ab-h"><span>🔌 RÉSEAUX COMPATIBLES</span><button class="btn s" onclick="TR_abosReseau('${esc(s.id)}')">➕ Ajouter un réseau</button></div>
   ${rs.map(rowHtml).join('')||'<p class="muted">Aucun réseau lié : ajoutes-en un.</p>'}</div>`};
window.TR_abosHtml=function(){
  const D=AB();
  if(!D)return `<div class="card" style="margin-top:12px"><h2>💳 MES ABONNEMENTS</h2><p class="muted">Aucun abonnement pour l'instant. Ajoute ceux que tu as (Electra, Atlante, Tesla…) ou commence avec une liste vide : l'appli utilisera alors ton prix moyen de recharge rapide.</p><button class="btn s" onclick="TR_abosInit()">➕ Commencer</button></div>`;
  const d=new Date(),y=d.getFullYear(),subs=D.subs||[];
  const isPay=s=>(+s.price||0)>0||(s.prixHist||[]).some(h=>+h.prix>0);const payants=subs.filter(isPay),badges=subs.filter(s=>!isPay(s));
  const tot=payants.reduce((a,s)=>a+cout(s),0);
  const libres=RES.filter(r=>D.tarifs[r]&&!subs.some(s=>offres(D,r).some(o=>o.via===s.id)));
  const pub=libres.length?`<div class="card" style="margin-top:12px"><h2>⚡ SANS CARTE (PLEIN TARIF)</h2>${libres.map(r=>{const pl=parsePrix(D.tarifs[r].sans);return `<div class="ab-r" onclick="TR_aboEdit('${esc(r)}')"><b style="color:${COUL[r]||'var(--blue)'};font-size:18px">${esc(r)}</b><span class="ab-p">${pl?(pl.fourchette?f2(pl.min)+' – '+f2(pl.max):f2(pl.moy))+' €/kWh':'prix à saisir'}</span></div>`}).join('')}</div>`:'';
  return `<div class="card" style="margin-top:12px"><h2>💳 MES ABONNEMENTS PAYANTS</h2><p class="muted">${tot.toFixed(2).replace('.',',')} € en ${y} — chacun doit se rentabiliser. Touche un mois pour le mettre en pause ou le réactiver : tous les prix sont recalculés.</p>
   <div class="ab-grid">${payants.map((s,i)=>carte(D,s,i,d)).join('')||'<p class="muted">Aucun abonnement payant.</p>'}</div></div>
   ${badges.length?`<div class="card" style="margin-top:12px"><h2>🏷️ MES BADGES</h2><div class="ab-grid">${badges.map((s,i)=>carte(D,s,i+2,d)).join('')}</div></div>`:''}
   <div class="row" style="margin-top:10px"><button class="btn s p" onclick="TR_abosAdd()">➕ Ajouter un abonnement / badge</button></div>${pub}`};
window.TR_abosField=(id,k,v)=>{const D=AB();const s=D&&D.subs.find(x=>x.id===id);if(!s)return;if(k==='price'){s.price=Math.max(0,+String(v).replace(',','.')||0);if(s.price>0&&s.type==='badge')s.type='abonnement'}else s.name=String(v).trim()||s.name;save(D);refresh()};
window.TR_abosMois=(id,m)=>{const D=AB();const s=D&&D.subs.find(x=>x.id===id);if(!s)return;s.paused=s.paused||{};const k=new Date().getFullYear()+'-'+m;if(s.paused[k])delete s.paused[k];else s.paused[k]=true;save(D);refresh()};
window.TR_abosPrix=id=>{const D=AB(),s=D&&D.subs.find(x=>x.id===id);if(!s)return;const n=new Date(),y=n.getFullYear();
  const opts=Array.from({length:24},(_,i)=>{const yy=y+Math.floor(i/12),m=i%12,k=mkM(yy,m);return `<option value="${k}"${(yy===y&&m===n.getMonth()+1)||(yy===y+1&&m===0&&n.getMonth()===11)?' selected':''}>${MOIS[m]} ${yy}</option>`}).join('');
  openModal(`<h2>💶 NOUVEAU PRIX — ${esc(s.name)}</h2><p class="muted">Les mois avant la date choisie gardent l'ancien prix : l'historique et le coût de l'année restent justes.</p><div class="f"><label>À partir de</label><select id="npM">${opts}</select></div><div class="f"><label>Nouveau prix (€/mois)</label><input id="npP" type="number" step="0.01" min="0" value="${(+s.price||0)}"></div><div class="row" style="margin-top:8px"><button class="btn p" onclick="TR_abosPrixOk('${esc(id)}')">✅ Enregistrer</button><button class="btn s g" onclick="closeModal()">Annuler</button></div>`)};
window.TR_abosPrixOk=id=>{const D=AB(),s=D&&D.subs.find(x=>x.id===id);if(!s)return;const from=$('npM').value,prix=Math.max(0,+String($('npP').value).replace(',','.')||0);s.prixHist=(s.prixHist||[]).filter(h=>h.from!==from).concat([{from,prix}]);save(D);closeModal();toast('✅ Nouveau prix enregistré');refresh()};
window.TR_abosPrixDel=(id,from)=>{const D=AB(),s=D&&D.subs.find(x=>x.id===id);if(!s)return;s.prixHist=(s.prixHist||[]).filter(h=>h.from!==from);save(D);refresh()};
window.TR_abosReseau=id=>{const D=AB();if(!D)return;const dispo=RES.filter(r=>D.tarifs[r]&&!offres(D,r).some(o=>o.via===id));
  openModal(`<h2>➕ AJOUTER UN RÉSEAU</h2><div class="f"><label>Réseau accessible avec cette carte</label><select id="abR">${dispo.map(r=>`<option>${esc(r)}</option>`).join('')||'<option value="">(tous déjà liés)</option>'}</select></div><div class="row" style="margin-top:8px"><button class="btn p" onclick="TR_abosReseauOk('${esc(id)}')">✅ Ajouter et régler les prix</button><button class="btn s g" onclick="closeModal()">Annuler</button></div>`)};
window.TR_abosReseauOk=id=>{const D=AB(),r=$('abR').value;if(!D||!r)return;const t=D.tarifs[r];if(!t.via)t.via=id;else{t.alternatives=t.alternatives||[];t.alternatives.push({via:id,avec:null,remise:null,cashback:null})}save(D);TR_aboEdit(r)};
window.TR_abosInit=()=>{save({subs:[],tarifs:Object.fromEntries(RES.map(r=>[r,{avec:null,sans:null,via:'',remise:null,cashback:null,alternatives:[]}]))});refresh()};
window.TR_abosPause=id=>{const D=AB();if(!D)return;const s=(D.subs||[]).find(x=>x.id===id);if(!s)return;s.paused=s.paused||{};const k=mkey(new Date());if(s.paused[k])delete s.paused[k];else s.paused[k]=true;save(D);refresh()};
window.TR_abosDel=id=>{const D=AB();if(!D||!confirm('Supprimer cet abonnement ? (les prix qui l\'utilisent repassent en plein tarif)'))return;D.subs=D.subs.filter(s=>s.id!==id);save(D);refresh()};
window.TR_abosAdd=()=>openModal(`<h2>➕ ABONNEMENT / BADGE</h2><div class="f"><label>Nom</label><input id="abN" placeholder="Ex. Electra Smart"></div><div class="f"><label>Prix mensuel (€, 0 pour un badge gratuit)</label><input id="abP" type="number" step="0.01" min="0" value="0"></div><div class="row" style="margin-top:8px"><button class="btn p" onclick="TR_abosAddOk()">✅ Ajouter</button><button class="btn s g" onclick="closeModal()">Annuler</button></div>`);
window.TR_abosAddOk=()=>{const D=AB();const n=$('abN').value.trim();if(!D||!n)return;const p=+$('abP').value||0;D.subs.push({id:'abo'+uid(),name:n,price:p,type:p>0?'abonnement':'badge',paused:{}});save(D);closeModal();refresh()};
/* ---- éditeur d'un réseau ---- */
let ed=null;
window.TR_aboEdit=lieu=>{const D=AB();if(!D)return;const t=D.tarifs[lieu];ed={lieu,t:JSON.parse(JSON.stringify(t))};if(!ed.t.alternatives)ed.t.alternatives=[];edDraw()};
function opt(D,v){return `<option value="">— plein tarif</option>`+(D.subs||[]).map(s=>`<option value="${esc(s.id)}"${v===s.id?' selected':''}>${esc(s.name)}</option>`).join('')+`<option value="__autre"${v==='__autre'?' selected':''}>Autre carte / badge</option>`}
function ligne(D,o,i){const nb=0;
  return `<div class="card" style="margin:8px 0;padding:10px"><div class="muted" style="margin-bottom:4px">${i<0?'Offre principale':'Autre offre '+(i+1)}${i>=0?` <button class="btn s g" style="float:right" onclick="TR_aboDelOffre(${i})">🗑️</button>`:''}</div>
   <div class="f"><label>Accès via</label><select id="eVia${i}">${opt(D,o.via)}</select></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><div class="f" style="flex:1;min-width:120px"><label>Prix avec carte (€/kWh)</label><input id="eAvec${i}" value="${o.avec==null?'':esc(o.avec)}" placeholder="vide = plein tarif"></div>
   <div class="f" style="flex:1;min-width:110px"><label>ou remise (€/kWh)</label><input id="eRem${i}" type="number" step="0.01" min="0" value="${o.remise==null?'':o.remise}"></div>
   <div class="f" style="flex:1;min-width:110px"><label>Cashback (%)</label><input id="eCb${i}" type="number" step="1" min="0" max="100" value="${o.cashback==null?'':o.cashback}"></div></div>
   <div style="margin-top:6px"><div class="muted" style="font-size:13px">🎁 Promos de cashback datées (priment sur le taux ci-dessus pendant leur période)</div>${(o.promos||[]).map((p,j)=>`<div class="it" style="padding:4px 0;align-items:center"><div class="t" style="font-size:14px">${esc(p.du)} → ${esc(p.au)} : <b style="color:var(--green)">${esc(p.taux)} %</b> ${esc(p.note||'')}</div><button class="btn s g" onclick="TR_aboDelPromo(${i},${j})">🗑️</button></div>`).join('')}
   <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"><input type="date" id="pDu${i}" style="flex:1;min-width:130px"><input type="date" id="pAu${i}" style="flex:1;min-width:130px"><input type="number" id="pTx${i}" placeholder="%" min="0" max="100" style="width:80px"><button class="btn s" onclick="TR_aboAddPromo(${i})">➕ Promo</button></div></div>
   ${nb||(o.cashbackMois&&Object.keys(o.cashbackMois).length)?`<div class="muted" style="font-size:12px">${nb} promo(s) datée(s) et ${Object.keys(o.cashbackMois||{}).length} taux mensuel(s) enregistré(s).</div>`:''}</div>`}
function edDraw(){const D=AB(),t=ed.t;
  openModal(`<h2>✏️ ${esc(ed.lieu.toUpperCase())}</h2><div class="f"><label>Prix public (€/kWh, ex. 0,49 ou 0,39-0,61)</label><input id="eSans" value="${t.sans==null?'':esc(t.sans)}"></div>
   ${ligne(D,t,-1)}${t.alternatives.map((a,i)=>ligne(D,a,i)).join('')}
   <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap"><button class="btn s" onclick="TR_aboAddOffre()">➕ Autre carte pour ce réseau</button><button class="btn p" onclick="TR_aboOk()">✅ Enregistrer</button><button class="btn s g" onclick="closeModal()">Annuler</button></div>`)}
function lire(){const t=ed.t;t.sans=$('eSans').value.trim()||null;
  [-1,...t.alternatives.map((_,i)=>i)].forEach(i=>{const o=i<0?t:t.alternatives[i];o.via=$('eVia'+i).value;const a=$('eAvec'+i).value.trim();o.avec=a||null;const r=$('eRem'+i).value;o.remise=r===''?null:+r;const c=$('eCb'+i).value;o.cashback=c===''?null:+c})}
window.TR_aboAddPromo=i=>{lire();const du=$('pDu'+i).value,au=$('pAu'+i).value,tx=$('pTx'+i).value;if(!du||!au||tx===''||au<du){toast('Indique début, fin (après le début) et taux');return}
  const o=i<0?ed.t:ed.t.alternatives[i];o.promos=(o.promos||[]).concat([{du,au,taux:Math.min(100,Math.max(0,+tx)),note:''}]).sort((a,b)=>String(b.du).localeCompare(String(a.du)));edDraw()};
window.TR_aboDelPromo=(i,j)=>{lire();const o=i<0?ed.t:ed.t.alternatives[i];o.promos.splice(j,1);edDraw()};
window.TR_aboAddOffre=()=>{lire();ed.t.alternatives.push({via:'',avec:null,remise:null,cashback:null});edDraw()};
window.TR_aboDelOffre=i=>{lire();ed.t.alternatives.splice(i,1);edDraw()};
window.TR_aboOk=()=>{lire();const D=AB();D.tarifs[ed.lieu]=ed.t;save(D);closeModal();toast('✅ Prix recalculés');refresh()};

/* ---- onglet « Abonnements » ---- */
window.renderAbos=function(){const el=$('abosPage');if(!el)return;
  try{el.innerHTML=`<div class="card"><h2>💳 ABONNEMENTS ET PRIX</h2><p class="muted">Tes abonnements, tes badges et le prix au kWh de chaque réseau. Tout est recalculé automatiquement pour le planificateur de trajet.</p></div>`
   +(window.TR_abosHtml?TR_abosHtml():'')+(window.TR_electraHtml?TR_electraHtml():'');
  }catch(e){console.error(e);el.innerHTML='<div class="card"><p style="color:var(--red)">⚠ Affichage impossible : '+esc(e.message||e)+'</p></div>'}
  const inp=$('aboImport');if(inp)inp.onchange=async e=>{const f=e.target.files[0];if(!f)return;
    try{const j=JSON.parse(await f.text());if(j.format!=='planif-recharge-tarifs'||!j.reseaux)throw 0;putItem('tarifs','tarifs',j);const xr=window.TR_importExtras?TR_importExtras(j):null;
      if(window.renderTarifs)renderTarifs();renderAbos();if(T()&&T().route&&window.TR_replan)TR_replan();toast('✅ Importé'+(xr&&xr.nAb?' · abonnements et prix':'')+(xr?` · ${xr.nEl} borne(s) Electra, ${xr.nFav} favori(s)`:''))}
    catch(x){toast('Fichier invalide : exporte-le depuis G6 Suivi')}e.target.value=''}};
{const ra=window.renderAll;window.renderAll=function(){const r=ra&&ra.apply(this,arguments);try{renderAbos()}catch(e){}return r}}
})();
