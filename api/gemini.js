export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };
export default async function handler(req,res){
 if(req.method!=='POST') return res.status(405).json({error:'Metodo no permitido'});
 const key=process.env.GEMINI_API_KEY;if(!key)return res.status(500).json({error:'Configura GEMINI_API_KEY en Vercel'});
 try{
  const {prompt,base64,textData,mimeType,fileName}=req.body||{};if(!prompt)return res.status(400).json({error:'Falta la solicitud'});
  const parts=[{text:`Actua como analista senior de RRHH en Chile. No inventes datos. Analiza ${fileName||'el archivo'} y responde exactamente: ${prompt}. Incluye metodologia, cifras, hallazgos, limitaciones, conclusiones y recomendaciones.`}];
  if(textData)parts.push({text:`Datos JSON:\n${textData}`});if(base64)parts.push({inlineData:{mimeType:mimeType||'application/pdf',data:base64}});
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:.2,maxOutputTokens:16384}})});
  const raw=await r.text();let j;try{j=JSON.parse(raw)}catch{return res.status(r.status||502).json({error:raw.slice(0,1000)||'Respuesta no valida de Gemini'})}
  if(!r.ok)return res.status(r.status).json({error:j?.error?.message||'Error Gemini'});const text=(j.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('\n').trim();return res.status(200).json({text});
 }catch(e){return res.status(500).json({error:e.message||'Error interno'})}
}
