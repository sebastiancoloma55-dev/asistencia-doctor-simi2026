(() => {
  'use strict';
  let overlay=null, timer=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensure(){
    if(overlay?.isConnected)return overlay;
    const style=document.createElement('style');
    style.id='simi-cat-progress-styles';
    style.textContent=`
      #simi-cat-progress-overlay{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,22,39,.62);backdrop-filter:blur(5px)}
      #simi-cat-progress-card{width:min(100%,430px);overflow:hidden;border:1px solid #d8e8ef;border-radius:24px;background:#fff;box-shadow:0 28px 80px rgba(0,0,0,.28);font-family:inherit;color:#18324f}
      #simi-cat-progress-top{padding:22px 22px 16px;text-align:center;background:linear-gradient(140deg,#e8f8fc,#fff 55%,#e2fbf5)}
      #simi-cat-progress-cat{display:inline-flex;align-items:center;justify-content:center;width:82px;height:82px;border-radius:24px;background:#fff;box-shadow:0 8px 24px rgba(8,145,178,.14);font-size:48px;animation:simiCatBounce .9s ease-in-out infinite alternate;transform-origin:center bottom}
      #simi-cat-progress-overlay[data-state="completado"] #simi-cat-progress-cat,#simi-cat-progress-overlay[data-state="error"] #simi-cat-progress-cat{animation:none}
      @keyframes simiCatBounce{from{transform:translateY(2px) rotate(-5deg)}to{transform:translateY(-8px) rotate(5deg)}}
      #simi-cat-progress-title{margin:14px 0 5px;font-size:20px;font-weight:900;line-height:1.25}
      #simi-cat-progress-detail{margin:0;color:#52677b;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
      #simi-cat-progress-body{padding:18px 22px 22px}
      #simi-cat-progress-track{height:12px;overflow:hidden;border-radius:99px;background:#e7eef3}
      #simi-cat-progress-bar{height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#087eae,#19b9a9);transition:width .22s ease}
      #simi-cat-progress-meta{display:flex;justify-content:space-between;gap:10px;margin:8px 0 0;font-size:12px;font-weight:800;color:#496276}
      #simi-cat-progress-actions{display:flex;gap:8px;justify-content:center;margin-top:17px}
      #simi-cat-progress-actions button{border:0;border-radius:12px;padding:11px 15px;font:inherit;font-size:13px;font-weight:850;cursor:pointer}
      #simi-cat-progress-close{background:#0f3550;color:#fff}
      #simi-cat-progress-dismiss{background:#edf4f7;color:#18324f}
      @media(prefers-reduced-motion:reduce){#simi-cat-progress-cat{animation:none!important}#simi-cat-progress-bar{transition:none}}
    `;
    if(!document.getElementById(style.id))document.head.appendChild(style);
    overlay=document.createElement('div');overlay.id='simi-cat-progress-overlay';overlay.dataset.state='procesando';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','simi-cat-progress-title');
    overlay.innerHTML='<section id="simi-cat-progress-card"><div id="simi-cat-progress-top"><div id="simi-cat-progress-cat" aria-hidden="true">🐱</div><h2 id="simi-cat-progress-title">Preparando tus archivos</h2><p id="simi-cat-progress-detail" aria-live="polite">El gatito está trabajando. No cierres esta pestaña mientras se genera el ZIP.</p></div><div id="simi-cat-progress-body"><div id="simi-cat-progress-track" role="progressbar" aria-label="Progreso de la descarga" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="simi-cat-progress-bar"></div></div><div id="simi-cat-progress-meta"><span id="simi-cat-progress-stage">Iniciando…</span><strong id="simi-cat-progress-percent">0%</strong></div><div id="simi-cat-progress-actions" hidden><button id="simi-cat-progress-close" type="button">Cerrar pestaña</button><button id="simi-cat-progress-dismiss" type="button">Cerrar aviso</button></div></div></section>';
    document.body.appendChild(overlay);
    overlay.querySelector('#simi-cat-progress-dismiss').addEventListener('click',()=>{overlay?.remove();overlay=null;});
    overlay.querySelector('#simi-cat-progress-close').addEventListener('click',()=>{
      try{window.close();}catch(_){}
      if(!window.closed){
        const detail=overlay?.querySelector('#simi-cat-progress-detail');
        if(detail)detail.textContent='El navegador no permite cerrar automáticamente una pestaña abierta manualmente. Puedes cerrar esta pestaña con el control del navegador.';
        const btn=overlay?.querySelector('#simi-cat-progress-close');if(btn)btn.textContent='Listo';
        if(btn)btn.onclick=()=>{overlay?.remove();overlay=null;};
      }
    });
    return overlay;
  }
  window.actualizarProgresoCorreos=function(porcentaje,titulo,detalle,estado){
    const el=ensure(),pct=Math.max(0,Math.min(100,Math.round(Number(porcentaje)||0))),done=estado==='completado'||estado==='error'||pct>=100;
    el.dataset.state=estado|| (done?'completado':'procesando');
    const t=el.querySelector('#simi-cat-progress-title'),d=el.querySelector('#simi-cat-progress-detail'),bar=el.querySelector('#simi-cat-progress-bar'),track=el.querySelector('#simi-cat-progress-track'),stage=el.querySelector('#simi-cat-progress-stage'),percent=el.querySelector('#simi-cat-progress-percent'),actions=el.querySelector('#simi-cat-progress-actions'),cat=el.querySelector('#simi-cat-progress-cat');
    if(t)t.textContent=titulo||'Preparando tus archivos';
    if(d)d.textContent=detalle||(done?'La operación terminó.':'El gatito está trabajando. No cierres esta pestaña mientras se genera el ZIP.');
    if(bar)bar.style.width=pct+'%';
    if(track)track.setAttribute('aria-valuenow',String(pct));
    if(stage)stage.textContent=estado==='error'?'Revisa el detalle':done?'Proceso finalizado':'Trabajando…';
    if(percent)percent.textContent=pct+'%';
    if(cat)cat.textContent=estado==='error'?'😿':estado==='completado'||pct>=100?'😺':'🐱';
    if(actions)actions.hidden=!done;
    if(timer)clearTimeout(timer);
    if(done&&estado!=='error')timer=setTimeout(()=>{if(overlay?.isConnected){const detail=overlay.querySelector('#simi-cat-progress-detail');if(detail&&!detail.textContent.includes('navegador no permite'))detail.textContent+=' Puedes usar “Cerrar pestaña” cuando estés listo.';}},1200);
  };
})();