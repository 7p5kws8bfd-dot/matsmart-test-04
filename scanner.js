(()=>{'use strict';
const $=id=>document.getElementById(id);
let reader=null,controls=null,stream=null,running=false,token=0,tries=0,hits=0,startTime=0,confirmed='',pending='',pendingSource='',pendingAngle='',seen=new Map(),log=[],busy=false,interval=null,rotationTimer=null,rotationBusy=false,rotationAttempts=0,rotationHits=0,rotationErrors=0,confirmedAngle="",quaggaReady=false,quaggaFailures=0,quaggaStatus="ej laddad",frameSeq=0,candidateTimer=null,firstValidAt=0;
const addLog=(msg)=>{log.push(new Date().toLocaleTimeString('sv-SE')+' '+msg);log=log.slice(-35);$('diagnostics').textContent=log.join('\n')};
const status=(msg,type='')=>{$('status').textContent=msg;$('status').className='status '+type};
function validEAN(s){if(!/^\d{8}$|^\d{12}$|^\d{13}$/.test(s))return false;let sum=0;for(let i=s.length-2,w=3;i>=0;i--,w=w===3?1:3)sum+=Number(s[i])*w;return (10-sum%10)%10===Number(s.at(-1))}
function normalized(s){const digits=String(s||'').replace(/\D/g,'');return digits.length===14&&digits[0]==='0'?digits.slice(1):digits}
function reset(){if(candidateTimer){clearTimeout(candidateTimer);candidateTimer=null}firstValidAt=0;frameSeq=0;rotationAttempts=0;rotationHits=0;rotationErrors=0;quaggaFailures=0;confirmedAngle='';$('rotationAttempts').textContent='0';$('rotationHits').textContent='0';$('rotationErrors').textContent='0';$('quaggaStatus').textContent=quaggaStatus;$('angle').textContent='–';tries=0;hits=0;seen.clear();confirmed='';pending='';pendingSource='';pendingAngle='';$('confirmCode').disabled=true;$('rejectCode').disabled=true;startTime=0;$('attempts').textContent='0';$('candidates').textContent='0';$('elapsed').textContent='–';$('result').textContent='Ingen kod ännu';$('validation').textContent='Väntar på giltig och bekräftad kod.';$('lookup').disabled=true;$('copy').disabled=true;$('product').classList.add('hidden');$('product').replaceChildren();addLog('Testvärden nollställda')}
// 0.3.7: En avläsning är ett förslag, aldrig ett godkännande.
// Samma kamerabild får inte räknas två gånger, även om flera rotationer träffar.
// Efter 4 s visas den vanligaste giltiga koden som OSÄKER kandidat om ingen
// oberoende dubbelträff har kommit. Användaren måste kontrollera varje siffra.
function presentCandidate(code,source,angle,confidence){
 if(!running||confirmed||pending)return;
 pending=code;pendingSource=source;pendingAngle=angle||'standard';
 if(candidateTimer){clearTimeout(candidateTimer);candidateTimer=null}
 $('angle').textContent=pendingAngle;$('result').textContent=code;
 $('validation').textContent=(confidence==='double'?'Koden har lästs på två separata bildtillfällen. ':'Koden har bara lästs en gång och är OSÄKER. ')+
  'Jämför samtliga siffror mot streckkoden på förpackningen. Tryck endast Stämmer om alla siffror är identiska. Ingen kod registreras automatiskt.';
 $('elapsed').textContent=((performance.now()-startTime)/1000).toFixed(1)+' s';
 $('confirmCode').disabled=false;$('rejectCode').disabled=false;
 status((confidence==='double'?'Kodkandidat: ':'OSÄKER kodkandidat: ')+code+' – kontrollera ALLA siffror.','warn');
 addLog('KANDIDAT ('+confidence+'): '+code+' efter '+$('elapsed').textContent+' · '+source+' · riktning: '+pendingAngle+' · inväntar manuell kontroll');
 stopCamera();
}
function offerBestCandidate(){
 candidateTimer=null;
 if(!running||pending||confirmed)return;
 const candidates=[...seen.entries()].map(([code,events])=>({code,events})).filter(x=>x.events.length);
 candidates.sort((a,b)=>b.events.length-a.events.length||b.events[b.events.length-1].time-a.events[a.events.length-1].time);
 if(candidates.length){const best=candidates[0];const last=best.events.at(-1);presentCandidate(best.code,last.source,last.angle,'single')}
}
function onCandidate(value,source,angle='',frameId=null){
 if(!running||confirmed||pending)return;
 const code=normalized(value);hits++;$('candidates').textContent=String(hits);
 if(!validEAN(code)){if(hits<=6)addLog('Ogiltig kontrollsiffra eller längd: '+code);return}
 const now=performance.now();
 const prev=(seen.get(code)||[]).filter(x=>now-x.time<=12000);
 // Quagga2-resultat från samma fångade bild räknas bara en gång.
 const independent=!prev.length||prev.every(x=>frameId===null||x.frameId!==frameId);
 if(independent)prev.push({time:now,source,angle,frameId});
 seen.set(code,prev);
 if(prev.length===1){
  addLog('Första giltiga avläsning: '+code+' ('+source+' '+angle+')');
  if(!candidateTimer){firstValidAt=now;candidateTimer=setTimeout(offerBestCandidate,4000)}
 }
 status('Möjliga EAN-koder hittade – söker oberoende bekräftelse…');
 // Kräver två olika fångsttillfällen med minst 350 ms mellan.
 if(prev.length>=2&&prev[prev.length-1].time-prev[0].time>=350){
  presentCandidate(code,source,angle,'double');
 }
}
function confirmPending(){
 if(!pending)return;
 confirmed=pending;confirmedAngle=pendingAngle;
 $('result').textContent=confirmed;$('angle').textContent=confirmedAngle;
 $('validation').textContent='Bekräftad av användaren mot förpackningen. Kontrollsiffra giltig. Ingen vara har lagts till i något matförråd.';
 $('lookup').disabled=false;$('copy').disabled=false;
 $('confirmCode').disabled=true;$('rejectCode').disabled=true;
 status('EAN-kod bekräftad. Öppnar varan…','ok');
 addLog('ANVÄNDARBEKRÄFTAD: '+confirmed+' ('+pendingSource+', '+confirmedAngle+')');window.MatsmartBridge.fromScan(confirmed);
}
function rejectPending(){
 if(!pending)return;
 addLog('AVVISAD AV ANVÄNDAREN: '+pending+' ('+pendingSource+')');
 pending='';pendingSource='';pendingAngle='';$('confirmCode').disabled=true;$('rejectCode').disabled=true;
 $('result').textContent='Fel kod avvisad';$('validation').textContent='Starta kameran igen för nytt försök.';
 status('Koden avvisades. Starta kameran igen.','warn');
}
function loadZXing(){return new Promise((resolve,reject)=>{if(window.ZXing?.BrowserMultiFormatReader)return resolve();const urls=['https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js','https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js'];let i=0;function next(){if(i===urls.length)return reject(Error('Kunde inte ladda ZXing. Kontrollera internetanslutningen.'));const script=document.createElement('script');script.src=urls[i++];script.onload=()=>window.ZXing?.BrowserMultiFormatReader?resolve():next();script.onerror=next;document.head.append(script)}next()})}
function stopCamera(){running=false;token++;if(rotationTimer){clearTimeout(rotationTimer);rotationTimer=null}if(candidateTimer){clearTimeout(candidateTimer);candidateTimer=null}if(interval){clearInterval(interval);interval=null}try{controls?.stop()}catch{}controls=null;try{reader?.reset()}catch{}reader=null;try{stream?.getTracks().forEach(t=>t.stop())}catch{}stream=null;const v=$('video');try{v.pause()}catch{}if(v.srcObject){try{v.srcObject.getTracks().forEach(t=>t.stop())}catch{}v.srcObject=null}$('start').disabled=false;$('stop').disabled=true}
// Alternativ motor: Quagga2 avkodar stillbilder från den redan aktiva kameran.
// Vi använder samma videoström som ZXing, utan att Quagga öppnar en andra kamera.
function loadQuagga(){return new Promise((resolve,reject)=>{
 if(window.Quagga?.decodeSingle){quaggaStatus='redo';$('quaggaStatus').textContent=quaggaStatus;return resolve()}
 const urls=['https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.8.4/dist/quagga.min.js','https://unpkg.com/@ericblade/quagga2@1.8.4/dist/quagga.min.js'];let i=0;
 function next(){if(i>=urls.length){quaggaStatus='kunde inte laddas';$('quaggaStatus').textContent=quaggaStatus;reject(Error('Quagga2 kunde inte laddas från CDN'));return}
 const script=document.createElement('script');script.src=urls[i++];script.onload=()=>window.Quagga?.decodeSingle?(quaggaStatus='redo',$('quaggaStatus').textContent=quaggaStatus,resolve()):next();script.onerror=next;document.head.append(script)}next();
})}
function startRotationAssist(myToken){
 const video=$('video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx){addLog('Kan inte skapa bildyta för Quagga2');return}
 let idx=0;
 const step=()=>{
  if(myToken!==token||!running)return;
  if(rotationBusy||video.readyState<2||!video.videoWidth||!video.videoHeight){rotationTimer=setTimeout(step,300);return}
  rotationBusy=true;
  const angle=[90,270,90,270,180][idx++%5],captureId=++frameSeq;
  try{
   const w=video.videoWidth,h=video.videoHeight,scale=Math.min(1,1000/Math.max(w,h));
   const sw=Math.round(w*scale),sh=Math.round(h*scale);
   canvas.width=angle===180?sw:sh;canvas.height=angle===180?sh:sw;
   ctx.setTransform(1,0,0,1,0,0);
   if(angle===90){ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2)}
   else if(angle===180){ctx.translate(canvas.width,canvas.height);ctx.rotate(Math.PI)}
   else{ctx.translate(0,canvas.height);ctx.rotate(3*Math.PI/2)}
   ctx.drawImage(video,0,0,sw,sh);ctx.setTransform(1,0,0,1,0,0);
   rotationAttempts++;$('rotationAttempts').textContent=String(rotationAttempts);
   // Quagga2 gör en oberoende 1D-avkodning på den roterade bilden.
   // decodeSingle är asynkron: nästa bild tas först efter callbacken.
   let finished=false;
   const finish=()=>{if(finished)return;finished=true;rotationBusy=false;if(myToken===token&&running)rotationTimer=setTimeout(step,220)};
   const watchdog=setTimeout(()=>{quaggaFailures++;rotationErrors++;$('rotationErrors').textContent=String(rotationErrors);if(quaggaFailures<=2)addLog('Quagga2 svarade inte inom 4 sekunder');finish()},4000);
   try{window.Quagga.decodeSingle({src:canvas.toDataURL('image/jpeg',0.85),numOfWorkers:0,locate:true,inputStream:{size:Math.max(canvas.width,canvas.height),singleChannel:false},decoder:{readers:['ean_reader','ean_8_reader','upc_reader']}},result=>{
    clearTimeout(watchdog);
    if(myToken===token&&running&&result?.codeResult?.code){rotationHits++;$('rotationHits').textContent=String(rotationHits);onCandidate(result.codeResult.code,'Quagga2',angle+'°',captureId)}
    finish();
   })}catch(e){clearTimeout(watchdog);throw e}
  }catch(e){rotationErrors++;$('rotationErrors').textContent=String(rotationErrors);if(rotationErrors<=4)addLog('Quagga2 rotationsfel: '+(e.message||e));rotationBusy=false;rotationTimer=setTimeout(step,400)}
 };
 rotationTimer=setTimeout(step,400);
}
async function startCamera(){if(running)return;reset();running=true;const myToken=++token;startTime=performance.now();$('start').disabled=true;$('stop').disabled=false;status('Kontrollerar kameran…');addLog('Startar '+$('engine').value+' · '+navigator.userAgent);
try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Kamera-API saknas. Öppna via HTTPS i Safari.');if($('engine').value==='native'){
 if(!('BarcodeDetector' in window))throw Error('BarcodeDetector stöds inte av den här webbläsaren. Välj ZXing.');const supported=await BarcodeDetector.getSupportedFormats();const formats=['ean_13','ean_8','upc_a','upc_e'].filter(f=>supported.includes(f));if(!formats.length)throw Error('Inga EAN/UPC-format stöds av BarcodeDetector.');const detector=new BarcodeDetector({formats});stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});if(myToken!==token){stream.getTracks().forEach(t=>t.stop());return}$('video').srcObject=stream;await $('video').play();addLog('Native stödda format: '+formats.join(', '));const loop=async()=>{if(myToken!==token||!running)return;tries++;$('attempts').textContent=String(tries);try{const results=await detector.detect($('video'));for(const r of results)onCandidate(r.rawValue,'native')}catch(e){if(tries===1)addLog('Native detect: '+e.message)}if(myToken===token&&running)interval=setTimeout(loop,180)};loop();
}else{await loadZXing();if(myToken!==token)return;const hints=new Map();hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A]);reader=new ZXing.BrowserMultiFormatReader(hints,180);controls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}},$('video'),(result,error)=>{if(myToken!==token||!running)return;tries++;$('attempts').textContent=String(tries);if(result)onCandidate(result.getText(),'ZXing');else if(error&&tries===1)addLog('Avkodning pågår: '+(error.name||'inget resultat'))});if(myToken!==token){try{controls.stop()}catch{}return}addLog('ZXing kameran startad. Laddar Quagga2 för 90°/270°…');loadQuagga().then(()=>{if(myToken===token&&running){addLog('Quagga2 rotationsmotor redo (90°/270°/180°).');startRotationAssist(myToken)}}).catch(e=>{if(myToken===token&&running)addLog('Quagga2 ej tillgänglig: '+e.message)});}
if(myToken===token&&running)status('Kameran är igång. Prova att vrida streckkoden i olika riktningar. Håll den skarp och synlig.');
}catch(e){if(myToken===token){addLog('FEL: '+(e.message||e));stopCamera();status('Kunde inte starta: '+(e.message||e),'warn')}}}
async function lookup(){
 const code=confirmed;if(!validEAN(code))return;
 const p=$('product');p.classList.remove('hidden');p.replaceChildren();p.textContent='Söker produkt i Open Food Facts…';
 try{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);let r;
  try{r=await fetch('https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(code)+'.json?fields=product_name,product_name_sv,brands,quantity,image_front_small_url',{signal:ctl.signal})}finally{clearTimeout(timer)}
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();if(confirmed!==code)return;
  const product=data.product||{},name=String(product.product_name_sv||product.product_name||'').trim();
  p.replaceChildren();
  if(name){
   const title=document.createElement('strong');title.textContent='Produkt: '+name;p.append(title);
   const info=document.createElement('p');info.textContent='Varumärke: '+(product.brands||'–')+' · Mängd: '+(product.quantity||'–');p.append(info);
   if(typeof product.image_front_small_url==='string'&&/^https:\/\//.test(product.image_front_small_url)){
    const img=document.createElement('img');img.src=product.image_front_small_url;img.alt='Produktbild från Open Food Facts';img.loading='lazy';img.style.cssText='max-width:110px;max-height:130px;object-fit:contain;display:block;margin-top:8px';p.append(img);
   }
  }else p.textContent='Ingen produkt hittades för '+code+'. Du kan fortfarande ange varan manuellt i Matsmart.';
  addLog('Produktsökning: '+(name||'ingen träff'));
 }catch(e){if(confirmed===code){p.textContent='Produktsökningen misslyckades: '+e.message;addLog('Produktsökning fel: '+e.message)}}
}
$('scanOpen').onclick=()=>{$('scanner').showModal();startCamera();};$('scanCancel').onclick=()=>{$('scanner').close();stopCamera()};$('scanner').addEventListener('close',stopCamera);$('confirmCode').onclick=confirmPending;$('rejectCode').onclick=rejectPending;$('start').onclick=startCamera;$('stop').onclick=()=>{stopCamera();status('Kameran stoppad.')};$('reset').onclick=()=>{stopCamera();reset();status('Test nollställt. Starta kameran när du är redo.')};$('lookup').onclick=lookup;$('copy').onclick=()=>navigator.clipboard.writeText(confirmed).then(()=>status('EAN-koden kopierad.','ok')).catch(()=>status('Kunde inte kopiera koden.','warn'));
$('useManual').onclick=()=>{const code=normalized($('manual').value.trim());if(!validEAN(code)){status('Den manuella koden har fel längd eller kontrollsiffra.','warn');return}stopCamera();pending='';$('confirmCode').disabled=true;$('rejectCode').disabled=true;confirmed=code;confirmedAngle='manuell';$('angle').textContent='Manuell';$('result').textContent=code;$('validation').textContent='Manuellt angiven kod med giltig kontrollsiffra (inte kameraverifierad).';$('lookup').disabled=false;$('copy').disabled=false;status('Manuell EAN/UPC-kod godkänd.','ok');addLog('Manuell kod: '+code);window.MatsmartBridge.fromScan(code)};
$('copyReport').onclick=async()=>{const report='Matsmart 0.3.7 Skannerlabbet\nMotor: '+$('engine').value+'\nFörsök: '+tries+'\nAvläsningar: '+hits+'\nBekräftad kod: '+(confirmed||'ingen')+'\nKandidat väntar på användarkontroll: '+(pending||'ingen')+'\nTid: '+$('elapsed').textContent+'\nRiktning vid bekräftelse: '+(confirmedAngle||'standard/manuell')+'\nRotationsförsök: '+rotationAttempts+'\nRotationsavläsningar: '+rotationHits+'\nRotationsfel: '+rotationErrors+'\nQuagga2: '+quaggaStatus+'\nBekräftelseregel: 2 oberoende avläsningar inom 12 s eller osäker kandidat efter 4 s, alltid användarbekräftelse'+'\n'+log.join('\n');try{await navigator.clipboard.writeText(report);status('Testrapport kopierad.','ok')}catch(e){status('Kunde inte kopiera. Markera texten i diagnostikrutan.','warn')}};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){stopCamera();status('Kameran stoppades när appen lades i bakgrunden.')}});addLog('Matsmart 0.4.1-skannern redo. Förrådet ändras först när du sparar en vara.');
})();
