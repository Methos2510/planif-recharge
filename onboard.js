/* Planif Recharge Libre — véhicules (bibliothèque + saisie libre) et assistant de démarrage */
(function(){
const r1=x=>Math.round(x*10)/10;
/* [nom, batterie utile kWh, charge rapide max kW, AC kW, conso mixte kWh/100 km (temps doux), chimie] — valeurs indicatives (ev-database.org), modifiables */
const LIB=[
['Citroën ë-C3 (44 kWh)',44,100,7.4,15.5,'LFP'],['Citroën ë-C4 (50 kWh)',46,100,11,17,'NMC'],
['Cupra Born 58 kWh',58,120,11,15.5,'NMC'],['Cupra Born 77 kWh',77,135,11,16.5,'NMC'],
['Dacia Spring',25,30,6.6,13.5,'LFP'],
['Fiat 500e (42 kWh)',37,85,11,14.5,'NMC'],
['Ford Mustang Mach-E (extended range)',88,150,11,19,'NMC'],
['Hyundai Kona Electric 64 kWh',64,77,11,15,'NMC'],['Hyundai Ioniq 5 (77 kWh)',74,220,11,17.5,'NMC'],['Hyundai Ioniq 6 (77 kWh)',74,220,11,15,'NMC'],
['BMW i4 eDrive40',81,205,11,17.5,'NMC'],['BMW iX1 xDrive30',65,130,11,17,'NMC'],
['BYD Dolphin (60 kWh)',60,88,11,15,'LFP'],['BYD Atto 3',60,88,11,16.5,'LFP'],['BYD Seal (82 kWh)',82,150,11,17,'LFP'],
['Kia EV3 (81 kWh)',78,128,11,15.5,'NMC'],['Kia EV6 (77 kWh)',74,235,11,17.5,'NMC'],['Kia e-Niro 64 kWh',64,77,7.2,14.9,'NMC'],['Kia Niro EV (2023)',65,80,11,16,'NMC'],['Kia Soul EV 64 kWh',64,100,7.2,16.5,'NMC'],
['Leapmotor T03',36,80,6.6,13.5,'LFP'],
['Mercedes EQA 250',66,100,11,17.5,'NMC'],
['MG4 (51 kWh)',50,117,11,16,'LFP'],['MG4 (64 kWh)',62,135,11,16,'NMC'],['MG ZS EV (long range)',68,92,11,18,'NMC'],
['Mini Cooper SE (2024)',49,95,11,15,'NMC'],
['Nissan Ariya (87 kWh)',87,130,22,18,'NMC'],
['Opel Corsa-e / Mokka-e',46,100,11,16,'NMC'],
['Peugeot e-208',46,100,11,15,'NMC'],['Peugeot e-2008',46,100,11,17,'NMC'],['Peugeot e-308',51,100,11,15.5,'NMC'],
['Polestar 2 (long range)',75,205,11,17.5,'NMC'],
['Renault 5 E-Tech (52 kWh)',52,100,11,14.5,'NMC'],['Renault Mégane E-Tech (60 kWh)',60,130,22,16.5,'NMC'],['Renault Mégane E-Tech (40 kWh)',40,85,7.4,15.5,'NMC'],['Renault Scénic E-Tech (87 kWh)',87,150,11,16.5,'NMC'],['Renault Zoé R135 (52 kWh)',52,50,22,17,'NMC'],
['Skoda Enyaq 60',58,120,11,16.5,'NMC'],['Skoda Enyaq 85',77,135,11,17.5,'NMC'],
['Smart #1',62,150,22,17.5,'NMC'],
['Tesla Model 3 (propulsion, LFP)',57.5,170,11,14.6,'LFP'],['Tesla Model 3 (grande autonomie)',75,250,11,15.5,'NMC'],['Tesla Model Y (propulsion, LFP)',57.5,170,11,15.6,'LFP'],['Tesla Model Y (grande autonomie)',75,250,11,16.5,'NMC'],
['Toyota bZ4X',71,150,6.6,16.5,'NMC'],
['Volkswagen ID.3 (58 kWh)',58,120,11,15.5,'NMC'],['Volkswagen ID.3 (77 kWh)',77,175,11,16,'NMC'],['Volkswagen ID.4 (77 kWh)',77,135,11,18,'NMC'],
['Volvo EX30 (long range)',64,153,11,15.5,'NMC'],
['XPENG G6 (AWD Performance)',80,451,11,15.8,'LFP'],
['— Citadine électrique (~40 kWh)',40,80,7.4,14.5,'NMC'],['— Compacte (~60 kWh)',60,120,11,16,'NMC'],['— SUV / berline (~77 kWh)',77,150,11,18,'NMC'],['— Grande batterie 800 V (~90 kWh)',90,250,11,18.5,'NMC']
];
function courbeFor(bat,dc,ch){
  if(dc>=200)return[0.75,0.85,0.88,0.85,0.80,0.65,0.50,0.35,0.18,0.07];
  if(ch==='LFP')return[0.80,1.0,1.0,1.0,0.95,0.85,0.70,0.50,0.30,0.12];
  if(dc>=110)return[0.90,1.0,1.0,0.95,0.85,0.70,0.55,0.35,0.22,0.10];
  return[0.90,1.0,1.0,1.0,1.0,0.90,0.75,0.45,0.40,0.20]}
function mk(nom,bat,dc,ac,mx,ch){return{nom,bat,dcMax:dc,acMax:ac,
  consoDoux:{ville:r1(mx*.8),mixte:r1(mx),auto:r1(mx*1.24)},consoFroid:{ville:r1(mx*.8*1.37),mixte:r1(mx*1.37),auto:r1(mx*1.24*1.37)},
  cibleDC:80,cibleMaison:ch==='LFP'?100:80,chimie:ch,courbe:courbeFor(bat,dc,ch)}}
window.VEHLIB=LIB;window.vehMk=mk;
window.VK=()=>(typeof settings!=='undefined'&&settings.nbVeh===2)?['g6','niro']:['g6'];
window.vehOpts=()=>VK().map(k=>`<option value="${k}">${esc(settings.veh[k].nom)}</option>`).join('');
const setOpts=(id,html)=>{const el=$(id);if(!el)return;const old=el.value;el.innerHTML=html;if([...el.options].some(o=>o.value===old))el.value=old};
window.refreshVehUI=function(reset){
  const two=VK().length===2,n1=settings.veh.g6.nom,n2=settings.veh.niro.nom;
  const fv=$('fVeh');if(fv){const old=fv.value;fv.innerHTML=(two?'<option value="both">Les deux</option>':'')+vehOpts();fv.value=[...fv.options].some(o=>o.value===old)?old:(two?'both':'g6');const f=fv.closest('.f');if(f)f.style.display=two?'':'none'}
  setOpts('pVeh',vehOpts());setOpts('tVeh',vehOpts());
  document.querySelectorAll('.vnm-g6').forEach(e=>e.textContent=n1);document.querySelectorAll('.vnm-niro').forEach(e=>e.textContent=n2);
  const b=$('mNiroOn');if(b){const f=b.closest('.f');if(f)f.style.display=two?'':'none';if(!two)b.checked=false;else if(reset)b.checked=true}
  const o=$('mOrder');if(o){const old=o.value;o.innerHTML=`<option value="g6">${esc(n1)} puis ${esc(n2)}</option><option value="niro">${esc(n2)} puis ${esc(n1)}</option><option value="auto">Le plus court d'abord</option>`;o.value=old;const f=o.closest('.f');if(f)f.style.display=two?'':'none'}
  if(reset){const a=$('mG6T');if(a)a.value=settings.veh.g6.cibleMaison;const c=$('mNiroT');if(c)c.value=settings.veh.niro.cibleMaison}
};
function saveSet(mut){const s=JSON.parse(JSON.stringify(settings));mut(s);putItem('settings','settings',s);applySettingsDoc()}
/* ---------- choix d'un modèle ---------- */
function selHtml(id,cur){return `<select id="${id}">${LIB.map((e,i)=>`<option value="${i}"${e[0]===cur?' selected':''}>${esc(e[0])}</option>`).join('')}<option value="x">✏️ Autre modèle (je saisis moi-même)</option></select>`}
function fieldsHtml(p,v){return `<div class="row" style="margin-top:8px">
 <div class="f" style="min-width:150px"><label>Nom</label><input id="${p}N" value="${esc(v.nom)}"></div>
 <div class="f"><label>Batterie utile (kWh)</label><input id="${p}B" type="number" step="0.1" value="${v.bat}"></div>
 <div class="f"><label>Charge rapide max (kW)</label><input id="${p}D" type="number" step="1" value="${v.dcMax}"></div>
 <div class="f"><label>Chargeur AC (kW)</label><input id="${p}A" type="number" step="0.1" value="${v.acMax}"></div>
 <div class="f"><label>Conso mixte (kWh/100 km)</label><input id="${p}C" type="number" step="0.1" value="${v.consoDoux.mixte}"></div>
 <div class="f"><label>Batterie</label><select id="${p}H"><option${v.chimie==='NMC'?' selected':''}>NMC</option><option${v.chimie==='LFP'?' selected':''}>LFP</option></select></div></div>`}
function wire(p,selId){const s=$(selId);s.onchange=()=>{if(s.value==='x')return;const e=LIB[+s.value],v=mk(...e);$(p+'N').value=v.nom;$(p+'B').value=v.bat;$(p+'D').value=v.dcMax;$(p+'A').value=v.acMax;$(p+'C').value=v.consoDoux.mixte;$(p+'H').value=v.chimie}}
function readVeh(p){const bat=+$(p+'B').value||60,dc=+$(p+'D').value||100,ac=+$(p+'A').value||11,mx=+$(p+'C').value||16,ch=$(p+'H').value;return mk($(p+'N').value.trim()||'Mon véhicule',bat,dc,ac,mx,ch)}
window.pickVeh=function(k){const cur=settings.veh[k];
  openModal(`<h2>🚗 MODÈLE DU VÉHICULE</h2><p class="muted">Choisis ton modèle : les valeurs se remplissent seules, tu peux les corriger.</p>${selHtml('pkS',cur.nom)}${fieldsHtml('pk',cur)}
  <div class="row" style="margin-top:10px"><button class="btn p" id="pkOk">✅ Valider</button></div>`);
  wire('pk','pkS');$('pkOk').onclick=()=>{const v=readVeh('pk');saveSet(s=>{s.veh[k]=v});closeModal();renderAll();refreshVehUI(true);toast('✅ Véhicule enregistré')}};
window.setNbVeh=n=>{saveSet(s=>{s.nbVeh=n});renderAll();refreshVehUI(true);if(n===2&&settings.veh.niro.nom==='Véhicule 2')pickVeh('niro')};
/* ---------- assistant de démarrage ---------- */
let W={};
const body=h=>{$('modalBody').innerHTML=h;$('modal').classList.add('on')};
const nav=(back,next,nl)=>`<div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn g" onclick="${back}">${back==='wz.skip()'?'Passer':'← Retour'}</button><button class="btn p" onclick="${next}">${nl||'Suivant →'}</button></div>`;
window.wz={
 start(){W={};body(`<h2>👋 BIENVENUE</h2><p>Planif Recharge te trouve les bornes, calcule le temps et le prix de ta recharge et planifie tes longs trajets.</p><p class="muted" style="margin-top:8px">Trois questions rapides pour régler l'appli sur ta voiture. Tout reste dans ton téléphone : aucun compte, aucune inscription.</p>${nav('wz.skip()','wz.v1()','C\'est parti →')}`)},
 skip(){saveSet(s=>{s.onboarded=true});closeModal()},
 v1(){body(`<h2>🚗 TON VÉHICULE</h2>${selHtml('w1S',settings.veh.g6.nom)}${fieldsHtml('w1',settings.veh.g6)}${nav('wz.start()','wz.v1ok()')}`);wire('w1','w1S')},
 v1ok(){W.v1=readVeh('w1');wz.v2()},
 v2(){body(`<h2>🚙 UN DEUXIÈME VÉHICULE ?</h2><p class="muted">Pour comparer ou charger deux voitures à la maison.</p><div class="row" style="margin-top:12px"><button class="btn" onclick="wz.v2no()">Non, un seul</button><button class="btn" onclick="wz.v2yes()">Oui, j'en ai deux</button></div>`)},
 v2no(){W.two=false;wz.home()},
 v2yes(){W.two=true;body(`<h2>🚙 DEUXIÈME VÉHICULE</h2>${selHtml('w2S','')}${fieldsHtml('w2',W.v2||mk(...LIB[0]))}${nav('wz.v2()','wz.v2ok()')}`);wire('w2','w2S');$('w2S').onchange()},
 v2ok(){W.v2=readVeh('w2');wz.home()},
 home(){body(`<h2>🏠 TON DOMICILE</h2><p class="muted">Sert de point de départ pour les trajets et de centre de la carte. Tu peux passer cette étape.</p>
  <div class="row" style="margin-top:8px"><div class="f" style="flex:2"><label>Ville ou adresse</label><input id="wzH" placeholder="ex. 12 rue des Lilas, Angers" value="${esc((W.home&&W.home.adr)||'')}"></div><button class="btn" id="wzHb">🔎 Chercher</button><button class="btn" id="wzHl">📍 Me localiser</button></div>
  <p id="wzHr" class="muted" style="margin-top:6px">${W.home?'✅ '+esc(W.home.adr):''}</p>${nav('wz.v2()','wz.energy()')}`);
  $('wzHb').onclick=async()=>{const q=$('wzH').value.trim();if(!q)return;$('wzHr').textContent='Recherche…';try{const j=await fetchJson('https://photon.komoot.io/api/?lang=fr&limit=1&q='+encodeURIComponent(q));const f=(j.features||[])[0];if(!f)throw 0;const p=f.properties;W.home={label:'Domicile',adr:[...new Set([p.name,p.street,p.city].filter(Boolean))].join(', '),lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],home:true};$('wzHr').textContent='✅ '+W.home.adr}catch(e){$('wzHr').textContent='⚠ Introuvable (connexion ?). Tu pourras le régler plus tard.'}};
  $('wzHl').onclick=()=>{if(!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(p=>{W.home={label:'Domicile',adr:'Ma position',lat:p.coords.latitude,lon:p.coords.longitude,home:true};$('wzHr').textContent='✅ Position enregistrée'},()=>{$('wzHr').textContent='⚠ Position refusée'},{timeout:10000})}},
 energy(){const s=settings;body(`<h2>⚡ ÉLECTRICITÉ À LA MAISON</h2><p class="muted">Pour calculer le coût d'une recharge chez toi. Valeurs par défaut modifiables (ton contrat ou ta facture).</p>
  <div class="row" style="margin-top:8px"><div class="f"><label>Borne / prise (kW)</label><select id="weK"><option value="2.3">2,3 — prise classique</option><option value="3.7">3,7</option><option value="7.4" selected>7,4 — Wallbox</option><option value="11">11 — Wallbox triphasée</option></select></div>
  <div class="f"><label>Prix kWh heures creuses (€)</label><input id="weC" type="number" step="0.0001" value="${s.hc}"></div><div class="f"><label>Prix kWh heures pleines (€)</label><input id="weP" type="number" step="0.0001" value="${s.hp}"></div></div>
  <div class="row" style="margin-top:8px"><div class="f"><label>Début heures creuses</label><input id="weD" type="time" value="${s.hcDeb}"></div><div class="f"><label>Fin heures creuses</label><input id="weF" type="time" value="${s.hcFin}"></div></div>
  <p class="muted" style="font-size:13px;margin-top:6px">Pas d'heures creuses ? Mets le même prix dans les deux cases.</p>${nav('wz.home()','wz.fin()','Terminer ✔')}`)},
 fin(){const v1=W.v1,v2=W.v2,two=!!W.two,h=W.home,k=+$('weK').value,c=+$('weC').value,p=+$('weP').value,d=$('weD').value,f=$('weF').value;
  saveSet(s=>{if(v1)s.veh.g6=v1;if(two&&v2)s.veh.niro=v2;s.nbVeh=two?2:1;s.home=k||7.4;if(c)s.hc=c;if(p)s.hp=p;if(d)s.hcDeb=d;if(f)s.hcFin=f;s.onboarded=true});
  if(h){putItem('dest_prefs','dest_prefs',{home:h});try{if(map)map.setView([h.lat,h.lon],11)}catch(e){}}
  renderAll();refreshVehUI(true);
  body(`<h2>✅ C'EST PRÊT</h2><p>Ton appli est réglée. Dernière chose, <b>à faire une fois en wifi</b> : télécharger les bornes de France et la carte de ta région pour que tout marche sans réseau.</p>
   <div class="row" style="margin-top:14px"><button class="btn p" onclick="closeModal();showTab('reglages');setTimeout(()=>{const e=document.getElementById('offCard');if(e)e.scrollIntoView({behavior:'smooth'})},200)">📴 Préparer le mode hors ligne</button><button class="btn g" onclick="closeModal()">Plus tard</button></div>`)}
};
try{refreshVehUI(true)}catch(e){}
const ag=$('wzAgain');if(ag)ag.onclick=e=>{e.preventDefault();wz.start()};
window.addEventListener('load',()=>{setTimeout(()=>{try{if(!settings.onboarded&&!(DB.items.settings&&DB.items.settings.data&&DB.items.settings.data.onboarded))wz.start()}catch(e){}},600)});
})();
