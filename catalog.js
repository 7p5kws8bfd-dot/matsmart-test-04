(()=>{'use strict';
const $=id=>document.getElementById(id);const PREFIX='matsmart-v04-catalog-';
const cache=new Map();let photo=null;let photoWasChanged=false;let requestId=0;
function validEAN(s){if(!/^\d{8}$|^\d{12}$|^\d{13}$/.test(s))return false;let sum=0;for(let i=s.length-2,w=3;i>=0;i--,w=w===3?1:3)sum+=Number(s[i])*w;return (10-sum%10)%10===Number(s.at(-1))}
function read(code){try{const s=localStorage.getItem(PREFIX+code);return s?JSON.parse(s):null}catch{return null}}
function prepare(code){requestId++;photo=null;photoWasChanged=false;$('productPhoto').value='';const entry=code?read(code):null;photo=entry?.photo||null;showPhoto();$('catalogHint').textContent='';}
function showPhoto(){const img=$('photoPreview');img.style.display=photo?'block':'none';if(photo)img.src=photo;else img.removeAttribute('src');$('removePhoto').style.display=photo?'inline-block':'none'}
function compress(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return reject(Error('Välj en bildfil.'));if(file.size>15*1024*1024)return reject(Error('Bilden är för stor (max 15 MB).'));const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{try{const scale=Math.min(1,640/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);const data=c.toDataURL('image/jpeg',.68);resolve(data)}catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Kunde inte öppna bilden.'))};img.src=url})}
$('productPhoto').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{photo=await compress(file);photoWasChanged=true;showPhoto()}catch(err){alert(err.message)}});
$('removePhoto').onclick=()=>{photo=null;photoWasChanged=true;showPhoto()};
async function fillFromCode(code){const id=++requestId;prepare(code);const active=()=>id===requestId&&$('editor').open&&$('barcode').value===code;
// prepare increments requestId; use refreshed token
const myId=requestId;const current=()=>myId===requestId&&$('editor').open&&$('barcode').value===code;
if(!validEAN(code)){$('catalogHint').textContent='EAN-koden verkar ogiltig. Kontrollera siffrorna.';return}
const saved=read(code);if(saved){if(!current())return;$('name').value=saved.name||'';$('quantity').value=saved.quantity||'';photo=saved.photo||null;showPhoto();$('catalogHint').textContent='✓ Hittad i ditt eget produktregister. Du kan ändra namn eller bild.';return}
$('catalogHint').textContent='Söker produkt i Open Food Facts…';
try{const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);let r;try{r=await fetch('https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(code)+'.json?fields=product_name,product_name_sv,brands,quantity,image_front_small_url',{signal:ctl.signal})}finally{clearTimeout(timer)}
if(!current())return;
if(r.status===404){$('catalogHint').textContent='Produkten finns inte i Open Food Facts. Ange namn och ta gärna en bild; uppgifterna sparas till nästa gång.';return}
if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();const p=data.product||{};const name=String(p.product_name_sv||p.product_name||'').trim();if(!name){$('catalogHint').textContent='Ingen produktinformation hittades. Ange namn och fotografera gärna förpackningen.';return}
$('name').value=name;$('quantity').value=String(p.quantity||'');$('catalogHint').textContent='✓ Hittad i Open Food Facts. Kontrollera namn och mängd. Du kan även ta en egen bild.';
if(!photo&&typeof p.image_front_small_url==='string'&&p.image_front_small_url.startsWith('https://')){ /* External images are not persisted in the local catalog unless photographed. */ }
}catch(e){if(current())$('catalogHint').textContent='Kunde inte hämta produktuppgifter ('+e.message+'). Du kan ange namn och ta en bild manuellt.'}}
async function save(code,name,quantity,newPhoto){if(!validEAN(code))return;const existing=read(code);const entry={code,name,quantity,photo:photoWasChanged?photo:(photo||existing?.photo||null),updated:new Date().toISOString()};try{localStorage.setItem(PREFIX+code,JSON.stringify(entry));if(entry.photo)cache.set(code,entry.photo);else cache.delete(code)}catch(e){throw Error('Enhetens lagringsutrymme räckte inte för produktbilden. Prova en mindre bild eller exportera en säkerhetskopia.')}}
function getCachedPhoto(code){if(cache.has(code))return cache.get(code);const p=read(code)?.photo;if(p)cache.set(code,p);return p||null}
window.MatsmartCatalog={prepare,fillFromCode,save,getCachedPhoto,get pendingPhoto(){return photo}};
})();