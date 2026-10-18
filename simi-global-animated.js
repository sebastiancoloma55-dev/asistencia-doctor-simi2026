/* Fondo animado global Doctor Simi: capa visual sin modificar auth, permisos ni datos. */
(function(){
  'use strict';
  function apply(){
    document.documentElement.classList.add('simi-global-animated');
    let backdrop=document.getElementById('simi-animated-backdrop');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.id='simi-animated-backdrop';
      backdrop.setAttribute('aria-hidden','true');
      backdrop.innerHTML='<span class="simi-backdrop-orb simi-backdrop-orb-a"></span><span class="simi-backdrop-orb simi-backdrop-orb-b"></span><span class="simi-backdrop-orb simi-backdrop-orb-c"></span><span class="simi-backdrop-beam"></span>';
      document.body.prepend(backdrop);
    }
    const overlay=document.getElementById('login-overlay');
    if(overlay) overlay.classList.add('simi-login-blue');
    const settings=document.getElementById('theme-settings-modal');
    if(settings) settings.setAttribute('aria-hidden','true');
    const themeButton=document.getElementById('btn-theme-settings');
    if(themeButton){themeButton.setAttribute('aria-hidden','true');themeButton.tabIndex=-1;themeButton.style.display='none';}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply,{once:true}); else apply();
  const observer=new MutationObserver(()=>{if(!document.getElementById('simi-animated-backdrop'))apply();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',apply);
})();
