/* SIMI Unified Experience: keep the active navigation item in sync with the visible module. */
(function () {
  'use strict';
  function syncActive(moduleId) {
    if (!moduleId) return;
    const key = String(moduleId).replace(/^view-/, '').replace(/^btn-/, '');
    const nav = document.querySelector('#sidebar nav');
    if (!nav) return;
    const buttons = Array.from(nav.querySelectorAll('.menu-btn'));
    let target = document.getElementById('btn-' + key);
    if (!target) {
      target = buttons.find(function (button) {
        const handler = button.getAttribute('onclick') || '';
        return handler.includes("'" + key + "'") || handler.includes('"' + key + '"');
      });
    }
    buttons.forEach(function (button) {
      const selected = button === target;
      button.classList.toggle('active', selected);
      if (selected) {
        button.setAttribute('aria-current', 'page');
        button.dataset.active = 'true';
      } else {
        button.removeAttribute('aria-current');
        delete button.dataset.active;
      }
    });
  }
  function install() {
    const nav = document.querySelector('#sidebar nav');
    if (!nav || nav.dataset.simiUnifiedNav === 'true') return;
    nav.dataset.simiUnifiedNav = 'true';
    nav.addEventListener('click', function (event) {
      const button = event.target.closest('.menu-btn');
      if (!button) return;
      const id = (button.id || '').replace(/^btn-/, '');
      if (id) syncActive(id);
    });
    if (typeof window.cambiarModulo === 'function' && !window.cambiarModulo.__simiUnifiedWrapped) {
      const original = window.cambiarModulo;
      const wrapped = function (moduleId) {
        const result = original.apply(this, arguments);
        syncActive(moduleId);
        return result;
      };
      wrapped.__simiUnifiedWrapped = true;
      window.cambiarModulo = wrapped;
    }
    const visible = Array.from(document.querySelectorAll('section[id^="view-"]')).find(function (section) {
      const style = getComputedStyle(section);
      return style.display !== 'none' && style.visibility !== 'hidden' && section.getClientRects().length > 0;
    });
    if (visible) syncActive(visible.id.replace(/^view-/, ''));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  // Some application scripts initialize navigation after DOMContentLoaded.
  const retry = function () {
    if (typeof window.cambiarModulo === 'function') {
      install();
      window.removeEventListener('load', retry);
    }
  };
  window.addEventListener('load', retry, { once: true });
})();