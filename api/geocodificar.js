const cache=new Map();let ultimo=0;
async function consultarNominatim(q){
 const espera=Math.max(0,1100-(Date.now()-ultimo));if(espera)await new Promise(r=>setTimeout(r,espera));ultimo=Date.now();
 const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cl&q='+encodeURIComponent(q);
 const r=await fetch(url,{headers:{'User-Agent':'RRHH-Doctor-Simi/1.0 (contacto: scoloma@farmaciasdoctorsimi.cl)','Accept-Language':'es'}});
 if(!r.ok)throw new Error('No se pudo consultar el geocodificador');
 const data=await r.json();return data&&data[0]?data[0]:null;
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Metodo no permitido'});
 const direccion=String(req.query.direccion||'').trim(),nombre=String(req.query.nombre||'').trim(),comuna=String(req.query.comuna||'').trim();
 if(!direccion&&!nombre)return res.status(400).json({error:'Falta direccion o nombre de sucursal'});
 const key=[direccion,nombre,comuna].join('|');if(cache.has(key))return res.status(200).json(cache.get(key));
 const candidatos=[direccion,[nombre,comuna,'Chile'].filter(Boolean).join(', '),[direccion,comuna,'Chile'].filter(Boolean).join(', '),[nombre,'Chile'].filter(Boolean).join(', ')].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
 try{
  let hit=null;for(const q of candidatos){hit=await consultarNominatim(q);if(hit)break;}
  if(!hit)return res.status(404).json({error:'No se encontró la dirección. Completa calle y comuna en el directorio de sucursales.'});
  const out={latitud:Number(hit.lat),longitud:Number(hit.lon),nombre:hit.display_name};cache.set(key,out);return res.status(200).json(out);
 }catch(e){return res.status(502).json({error:e.message||'No se pudo consultar el geocodificador'});}
}
