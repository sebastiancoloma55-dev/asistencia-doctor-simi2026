(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const prompts=()=>document.querySelectorAll('[data-analista-prompt]');
  function status(message,error=false){const el=byId('analista-ia-status');if(el){el.textContent=message;el.style.color=error?'#b42318':'';}}
  function setBusy(busy){const btn=byId('analista-ia-send');if(!btn)return;btn.disabled=busy;btn.style.opacity=busy?'.65':'';btn.innerHTML=busy?'<i data-lucide="loader-circle"></i> Analizando…':'<i data-lucide="send"></i> Consultar al analista';if(window.lucide)window.lucide.createIcons();}
  async function ask(){
    const input=byId('analista-ia-prompt'),wrap=byId('analista-ia-response-wrap'),output=byId('analista-ia-response');
    const prompt=(input?.value||'').trim();
    if(!prompt){status('Escribe una consulta antes de continuar.',true);input?.focus();return;}
    if(prompt.length>12000){status('La consulta es demasiado extensa.',true);return;}
    setBusy(true);status('Verificando sesión y consultando al proveedor de IA…');if(wrap)wrap.classList.remove('hidden');if(output)output.textContent='Preparando respuesta…';
    try{
      const {data,error}=await _supabase.auth.getSession();
      if(error)throw new Error('No se pudo validar la sesión. Vuelve a iniciar sesión.');
      const token=data?.session?.access_token;
      if(!token)throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      const response=await fetch('/api/analista-ia',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({prompt})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'No se pudo consultar al analista.');
      if(output)output.textContent=payload.text||'La IA no devolvió una respuesta.';
      status('Respuesta generada · '+new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}));
    }catch(error){
      if(output)output.textContent=error.message||'No se pudo consultar al analista.';
      status(error.message||'Error al consultar la IA.',true);
    }finally{setBusy(false);if(window.lucide)window.lucide.createIcons();}
  }
  function init(){
    const send=byId('analista-ia-send');if(send&&!send.dataset.ready){send.dataset.ready='1';send.addEventListener('click',ask);}
    const input=byId('analista-ia-prompt');if(input&&!input.dataset.ready){input.dataset.ready='1';input.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();ask();}});}
    prompts().forEach(btn=>{if(btn.dataset.ready)return;btn.dataset.ready='1';btn.addEventListener('click',()=>{if(input){input.value=btn.dataset.analistaPrompt||'';input.focus();status('Consulta sugerida cargada. Puedes editarla antes de enviar.');}});});
    const copy=byId('analista-ia-copy');if(copy&&!copy.dataset.ready){copy.dataset.ready='1';copy.addEventListener('click',async()=>{const text=byId('analista-ia-response')?.textContent||'';try{await navigator.clipboard.writeText(text);status('Respuesta copiada.');}catch(_){status('No se pudo copiar automáticamente; selecciona el texto y cópialo.',true);}});}
    if(window.lucide)window.lucide.createIcons();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
