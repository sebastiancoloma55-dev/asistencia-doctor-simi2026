(function () {
  'use strict';
  var TABLE = 'cafecito_sesiones', POLL_MS = 15000;
  var panel, list, status, action, count, activeRows = [], currentUserId = null, currentEmail = '', currentName = '', mySession = null, timerId = null, pollId = null, busy = false;
  function client() { try { return window._supabase || (typeof _supabase !== 'undefined' ? _supabase : null); } catch (_) { return window._supabase || null; } }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function elapsed(iso) {
    var seconds = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 1000);
    var h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    return h ? h + ' h ' + String(m).padStart(2,'0') + ' min' : m + ' min ' + String(s).padStart(2,'0') + ' s';
  }
  function notify(message, type) {
    if (typeof window.mostrarToast === 'function') window.mostrarToast(message, type || 'info', 5000);
    else if (typeof window.toast === 'function') window.toast(message);
  }
  function build() {
    if (document.getElementById('cafecito-presencia-panel')) {
      panel = document.getElementById('cafecito-presencia-panel'); list = document.getElementById('cafecito-presencia-list');
      status = document.getElementById('cafecito-presencia-status'); action = document.getElementById('cafecito-presencia-action'); count = document.getElementById('cafecito-presencia-count'); return;
    }
    var style = document.createElement('style');
    style.textContent = [
      '#cafecito-presencia-panel{position:fixed;z-index:2500;top:76px;right:18px;width:min(390px,calc(100vw - 24px));max-height:min(76vh,650px);overflow:auto;background:#fff;border:1px solid #d6e7f5;border-radius:18px;box-shadow:0 22px 60px rgba(7,43,77,.22);color:#143654;display:none}',
      '#cafecito-presencia-panel.is-open{display:block;animation:cafecito-in .16s ease-out}',
      '@keyframes cafecito-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}',
      '#cafecito-presencia-panel .cp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 17px 13px;background:linear-gradient(135deg,#fff8eb,#f4fbff);border-bottom:1px solid #e4edf5}',
      '#cafecito-presencia-panel .cp-title{font-size:14px;font-weight:900;color:#12385f}',
      '#cafecito-presencia-panel .cp-sub{font-size:11px;color:#617c95;margin-top:4px}',
      '#cafecito-presencia-panel .cp-close{width:28px;height:28px;border:1px solid #dce8f1;border-radius:9px;background:#fff;color:#526b81;font-weight:800}',
      '#cafecito-presencia-panel .cp-body{padding:14px}',
      '#cafecito-presencia-panel .cp-summary{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f5faff;border:1px solid #e0edf8;border-radius:12px;margin-bottom:12px;font-size:12px;font-weight:800}',
      '#cafecito-presencia-panel .cp-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:#e6f8f0;color:#08794e;font-size:10px;font-weight:900}',
      '#cafecito-presencia-panel .cp-dot{width:6px;height:6px;background:#11a36a;border-radius:50%;display:inline-block}',
      '#cafecito-presencia-panel .cp-action{width:100%;border:0;border-radius:11px;padding:11px 12px;font-size:12px;font-weight:900;background:#f4a62a;color:#603400;cursor:pointer;transition:filter .15s;margin-bottom:13px}',
      '#cafecito-presencia-panel .cp-action:hover{filter:brightness(.97)}',
      '#cafecito-presencia-panel .cp-action.is-active{background:#e7f7f1;color:#08794e;border:1px solid #bdebd7}',
      '#cafecito-presencia-panel .cp-list-title{font-size:10px;font-weight:900;letter-spacing:.08em;color:#6d8499;text-transform:uppercase;margin:4px 0 8px}',
      '#cafecito-presencia-panel .cp-person{display:flex;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid #edf2f7}',
      '#cafecito-presencia-panel .cp-person:last-child{border-bottom:0}',
      '#cafecito-presencia-panel .cp-avatar{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:11px;background:#eaf6fb;color:#14618a;font-weight:900;font-size:12px}',
      '#cafecito-presencia-panel .cp-person-main{flex:1;min-width:0}',
      '#cafecito-presencia-panel .cp-name{font-size:12px;font-weight:800;overflow-wrap:anywhere}',
      '#cafecito-presencia-panel .cp-time{font-size:11px;color:#5d7890;margin-top:3px}',
      '#cafecito-presencia-panel .cp-empty{padding:16px 6px;text-align:center;font-size:12px;color:#71869a}',
      '#cafecito-presencia-panel .cp-error{padding:10px;border-radius:10px;background:#fff5f5;color:#a52d2d;font-size:11px;line-height:1.5}',
      '@media(max-width:480px){#cafecito-presencia-panel{top:68px;right:12px}}'
    ].join('\n');
    document.head.appendChild(style);
    panel = document.createElement('section'); panel.id = 'cafecito-presencia-panel'; panel.setAttribute('aria-label','Control de cafecito y personas en pausa');
    panel.innerHTML = '<div class="cp-head"><div><div class="cp-title">☕ Cafecito del equipo</div><div class="cp-sub">Control de pausa y tiempo transcurrido</div></div><button type="button" class="cp-close" id="cafecito-presencia-close" aria-label="Cerrar">×</button></div><div class="cp-body"><div class="cp-summary"><span>Personas en cafecito</span><span class="cp-pill"><span class="cp-dot"></span><span id="cafecito-presencia-count">0</span> activas</span></div><div id="cafecito-presencia-status" aria-live="polite"></div><button type="button" id="cafecito-presencia-action" class="cp-action">☕ Iniciar mi cafecito</button><div class="cp-list-title">Ahora en cafecito</div><div id="cafecito-presencia-list"><div class="cp-empty">Consultando al equipo…</div></div></div>';
    document.body.appendChild(panel);
    list = document.getElementById('cafecito-presencia-list'); status = document.getElementById('cafecito-presencia-status');
    action = document.getElementById('cafecito-presencia-action'); count = document.getElementById('cafecito-presencia-count');
    document.getElementById('cafecito-presencia-close').addEventListener('click', closePanel);
    action.addEventListener('click', toggleBreak);
    document.addEventListener('click', function(event) {
      var btn = event.target.closest('#btn-modo-cafecito');
      if (!btn && panel.classList.contains('is-open') && !panel.contains(event.target)) closePanel();
    });
  }
  function closePanel() { if (panel) panel.classList.remove('is-open'); }
  function setStatus(message, isError) { if (status) status.innerHTML = message ? '<div class="' + (isError ? 'cp-error' : 'cp-sub') + '">' + esc(message) + '</div>' : ''; }
  async function getIdentity() {
    var sb = client();
    if (!sb || !sb.auth) throw new Error('No se encontró la sesión de la plataforma.');
    var result = await sb.auth.getUser(), user = result && result.data && result.data.user;
    if (result.error || !user) throw new Error('Inicia sesión nuevamente para registrar tu cafecito.');
    currentUserId = user.id; currentEmail = String(user.email || '').toLowerCase();
    currentName = String((user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name || user.user_metadata.nombre)) || '').trim();
    if (!currentName && currentEmail) currentName = currentEmail.split('@')[0].replace(/[._-]+/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
    try {
      var profileResult = await sb.from('usuarios_roles').select('*').eq('email', currentEmail).maybeSingle();
      var profile = profileResult.data;
      if (profile) {
        var name = [profile.nombre, profile.nombres, profile.apellidos].filter(Boolean).join(' ').trim() || profile.nombre_completo || profile.name || profile.display_name;
        if (name) currentName = String(name).trim();
      }
    } catch (_) {}
  }
  async function loadRows() {
    var sb = client();
    var result = await sb.from(TABLE).select('id,user_id,user_email,display_name,started_at').is('ended_at', null).order('started_at', {ascending:true}).limit(100);
    if (result.error) throw result.error;
    activeRows = result.data || []; mySession = activeRows.find(function(row){return row.user_id === currentUserId;}) || null; render();
  }
  function render() {
    if (!list) return;
    if (count) count.textContent = String(activeRows.length);
    list.innerHTML = activeRows.length ? activeRows.map(function(row) {
      var name = row.display_name || row.user_email || 'Usuario';
      var initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(function(x){return x[0];}).join('').toUpperCase() || '☕';
      var own = row.user_id === currentUserId;
      return '<div class="cp-person"><div class="cp-avatar">' + esc(initials) + '</div><div class="cp-person-main"><div class="cp-name">' + esc(name) + (own ? ' <span style="color:#0b8a67;font-size:10px">(tú)</span>' : '') + '</div><div class="cp-time">☕ En pausa · <strong data-cafecito-start="' + esc(row.started_at) + '">' + esc(elapsed(row.started_at)) + '</strong></div></div>' + (own ? '<span class="cp-pill">Activo</span>' : '') + '</div>';
    }).join('') : '<div class="cp-empty">Nadie está en cafecito por ahora.<br>¡Puedes ser el primero! ☕</div>';
    if (action) { action.disabled = busy; action.classList.toggle('is-active', !!mySession); action.textContent = mySession ? '✓ Finalizar cafecito · ' + elapsed(mySession.started_at) : '☕ Iniciar mi cafecito'; }
    var topLabel = document.getElementById('modo-cafecito-label'), topButton = document.getElementById('btn-modo-cafecito');
    if (topLabel && topButton) {
      topLabel.textContent = mySession ? 'En cafecito · ' + elapsed(mySession.started_at) : 'Cafecito';
      topButton.title = mySession ? 'Estás en cafecito hace ' + elapsed(mySession.started_at) + '. Haz clic para ver el equipo.' : 'Abrir control de cafecito del equipo';
      topButton.setAttribute('aria-pressed', String(!!mySession));
    }
  }
  async function toggleBreak() {
    if (busy) return;
    busy = true; if (action) action.disabled = true; setStatus('', false);
    try {
      await getIdentity();
      var sb = client();
      if (mySession) {
        var endResult = await sb.from(TABLE).update({ended_at:new Date().toISOString()}).eq('id', mySession.id).eq('user_id', currentUserId).is('ended_at', null);
        if (endResult.error) throw endResult.error;
        notify('Cafecito finalizado. Duración: ' + elapsed(mySession.started_at) + '.', 'success');
      } else {
        var startResult = await sb.from(TABLE).insert({user_id:currentUserId,user_email:currentEmail,display_name:currentName,started_at:new Date().toISOString()}).select('id').single();
        if (startResult.error) {
          if (startResult.error.code === '23505') { await loadRows(); throw new Error('Ya tienes un cafecito activo en otra pestaña. Se sincronizó tu estado.'); }
          throw startResult.error;
        }
        notify('☕ Cafecito iniciado. El tiempo ya está corriendo.', 'success');
      }
      await loadRows();
    } catch (error) {
      var message = String(error && error.message || 'No se pudo actualizar el cafecito.');
      if (/relation .* does not exist|could not find the table|schema cache/i.test(message)) setStatus('El control compartido necesita habilitar la tabla de cafecito en Supabase. No se registró ninguna pausa.', true);
      else setStatus(message, true);
    } finally { busy = false; if (action) action.disabled = false; render(); }
  }
  async function openPanel() {
    build(); panel.classList.toggle('is-open');
    if (!panel.classList.contains('is-open')) return;
    setStatus('', false);
    try { await getIdentity(); await loadRows(); }
    catch (error) { setStatus(String(error && error.message || 'No se pudo cargar la lista.'), true); if (list) list.innerHTML = '<div class="cp-empty">No se pudo consultar el estado del equipo.</div>'; }
    if (!timerId) timerId = setInterval(function() {
      document.querySelectorAll('[data-cafecito-start]').forEach(function(el){el.textContent = elapsed(el.getAttribute('data-cafecito-start'));});
      if (mySession) {
        var label = document.getElementById('modo-cafecito-label');
        if (label) label.textContent = 'En cafecito · ' + elapsed(mySession.started_at);
        if (action && panel.classList.contains('is-open')) action.textContent = '✓ Finalizar cafecito · ' + elapsed(mySession.started_at);
      }
    }, 1000);
    if (!pollId) pollId = setInterval(async function() {
      if (!panel || !panel.classList.contains('is-open') || document.hidden) return;
      try { await loadRows(); } catch (_) {}
    }, POLL_MS);
  }
  window.abrirPanelCafecito = openPanel;
  window.toggleModoCafecito = openPanel;
  document.addEventListener('visibilitychange', function(){if(!document.hidden && panel && panel.classList.contains('is-open')) loadRows().catch(function(){});});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, {once:true}); else build();
})();