/* Aplica el fondo global a todos los módulos sin tocar la lógica funcional. */
(function(){
  'use strict';
  const apply = () => {
    document.documentElement.classList.add('simi-global-animated');
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('simi-login-blue');
    const settings = document.getElementById('theme-settings-modal');
    if (settings) settings.setAttribute('aria-hidden','true');
    const themeButton = document.getElementById('btn-theme-settings');
    if (themeButton) {
      themeButton.setAttribute('aria-hidden','true');
      themeButton.tabIndex = -1;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true});
  else apply();
  const observer = new MutationObserver(() => apply());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',apply);
})();