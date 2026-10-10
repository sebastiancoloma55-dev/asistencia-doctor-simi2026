const cache=new Map();let ultimo=0;
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Metodo no permitido'});
 const direccion=String(req.query.direccion||'').trim();if(!direccion)return res.status(400).json({error:'Falta direccion'});
 if(cache.has(direccion))return res.status(200).json(cache.get(direccion));
 const espera=Math.max(0,1100-(Date.now()-ultimo));if(espera)await new Promise(r=>setTimeout(r,espera));ultimo=Date.now();
 const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cl&q='+encodeURIComponent(direccion);
 const r=await fetch(url,{headers:{'User-Agent':'RRHH-Doctor-Simi/1.0 (contacto: scoloma@farmaciasdoctorsimi.cl)','Accept-Language':'es'}});
 if(!r.ok)return res.status(502).json({error:'No se pudo consultar el geocodificador'});const data=await r.json();if(!data.length)return res.status(404).json({error:'Direccion no encontrada'});
 const out={latitud:Number(data[0].lat),longitud:Number(data[0].lon),nombre:data[0].display_name};cache.set(direccion,out);return res.status(200).json(out);
}
