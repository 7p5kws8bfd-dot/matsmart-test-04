(()=>{'use strict';
const $=id=>document.getElementById(id), PREFIX='matsmart-v04-catalog-';
const cache=new Map();let photo=null,photoWasChanged=false,requestId=0,remotePhoto=null;
function validEAN(s){if(!/^\d{8}$|^\d{12}$|^\d{13}$/.test(s))return false;let sum=0;for(let i=s.length-2,w=3;i>=0;i--,w=w===3?1:3)sum+=Number(s[i])*w;return (10-sum%10)%10===Number(s.at(-1))}
function safeImage(url){return typeof url==='string' && (url.startsWith('data:image/jpeg;base64,')||url.startsWith('data:image/png;base64,')||(/^https:\/\/(?:images\.openfoodfacts\.org|static\.openfoodfacts\.org)\//i.test(url)))}
function read(code){try{const s=localStorage.getItem(PREFIX+code);return s?JSON.parse(s):null}catch{return null}}
function prepare(code){requestId++;photo=null;remotePhoto=null;photoWasChanged=false;$('productPhoto').value='';const entry=code?read(code):null;photo=entry?.photo||null;remotePhoto=entry?.remotePhoto||null;showPhoto();$('catalogHint').textContent=''}
function showPhoto(){const img=$('photoPreview'),url=photo||remotePhoto;img.style.display=url?'block':'none';if(url&&safeImage(url))img.src=url;else img.removeAttribute('src');$('removePhoto').style.display=photo?'inline-block':'none'}
function compress(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return reject(Error('Välj en bildfil.'));if(file.size>15*1024*1024)return reject(Error('Bilden är för stor (max 15 MB).'));const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{try{const scale=Math.min(1,480/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',.65))}catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Kunde inte öppna bilden.'))};img.src=url})}
$('productPhoto').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{photo=await compress(file);photoWasChanged=true;showPhoto()}catch(err){alert(err.message)}});
$('removePhoto').onclick=()=>{photo=null;photoWasChanged=true;showPhoto()};
async function fillFromCode(code){prepare(code);const id=requestId,current=()=>id===requestId&&$('editor').open&&$('barcode').value===code;
 if(!validEAN(code)){$('catalogHint').textContent='EAN-koden verkar ogiltig. Kontrollera siffrorna.';return}
 const saved=read(code);if(saved){if(!current())return;$('name').value=saved.name||'';$('quantity').value=saved.quantity||'';photo=saved.photo||null;remotePhoto=saved.remotePhoto||null;showPhoto();$('catalogHint').textContent='✓ Hittad i ditt eget produktregister. Bild och namn kan ändras.';if(photo||remotePhoto)return; /* En äldre katalogpost kan sakna bild. Fortsätt söka bild utan att skriva över namnet. */}
 $('catalogHint').textContent='Söker produkt och bild i Open Food Facts…';
 try{const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);let r;try{r=await fetch('https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(code)+'.json?fields=product_name,product_name_sv,brands,quantity,image_front_small_url,image_front_url',{signal:ctl.signal})}finally{clearTimeout(timer)}
 if(!current())return;
 if(r.status===404){$('catalogHint').textContent='Produkten saknas i Open Food Facts. Ange namn och fotografera gärna förpackningen.';return}
 if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json(),p=data.product||{},name=String(p.product_name_sv||p.product_name||'').trim();
 const url=p.image_front_small_url||p.image_front_url;if(safeImage(url))remotePhoto=url;
 if(name&&!saved)$('name').value=name;
 if(p.quantity&&!saved)$('quantity').value=String(p.quantity);
 showPhoto();$('catalogHint').textContent=saved?'✓ Hittad i ditt eget produktregister'+(remotePhoto?' med produktbild.':'.'):(name?'✓ Produkt hittad'+(remotePhoto?' med bild.':' utan bild.')+' Kontrollera uppgifterna.':'Produktnamn saknas. Ange namn och fotografera gärna förpackningen.');
 }catch(e){if(current())$('catalogHint').textContent='Kunde inte hämta produktuppgifter ('+e.message+'). Du kan ange namn och bild manuellt.'}}
async function save(code,name,quantity){if(!validEAN(code))return;const existing=read(code);const entry={code,name,quantity,photo:photoWasChanged?photo:(photo||existing?.photo||null),remotePhoto:remotePhoto||existing?.remotePhoto||null,updated:new Date().toISOString()};try{localStorage.setItem(PREFIX+code,JSON.stringify(entry));cache.set(code,entry.photo||entry.remotePhoto||null)}catch(e){throw Error('Enhetens lagringsutrymme räckte inte för produktbilden. Prova en mindre bild eller exportera en säkerhetskopia.')}}
function getProductPhoto(code){if(!code)return null;if(cache.has(code))return cache.get(code);const p=read(code),url=p?.photo||p?.remotePhoto||null;if(url&&!safeImage(url))return null;cache.set(code,url);return url}
function exportEntries(){const entries=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(PREFIX)){const e=read(key.slice(PREFIX.length));if(e)entries.push(e)}}return entries}
function validateEntries(entries){if(!Array.isArray(entries)||entries.length>10000)throw Error('Ogiltigt produktregister i säkerhetskopian');for(const e of entries){if(!e||!validEAN(e.code)||typeof e.name!=='string'||typeof e.quantity!=='string'||(e.photo!=null&&!safeImage(e.photo))||(e.remotePhoto!=null&&!safeImage(e.remotePhoto)))throw Error('Ogiltig produkt i säkerhetskopian')}}
function importEntries(entries){validateEntries(entries);const previous=new Map();try{for(const e of entries){const key=PREFIX+e.code;previous.set(key,localStorage.getItem(key));localStorage.setItem(key,JSON.stringify(e));cache.delete(e.code)}}catch(err){for(const [key,value] of previous){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}throw Error('Produktregistret kunde inte återställas. Kontrollera lagringsutrymmet.')}}
window.MatsmartCatalog={prepare,fillFromCode,save,getProductPhoto,exportEntries,validateEntries,importEntries,get pendingPhoto(){return photo}};
})();
