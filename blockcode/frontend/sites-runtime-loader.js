// runtime loader: inject the remote sites-runtime script at page load
(function(){
  const url = 'https://silly-watch-33938890.figma.site/_runtimes/sites-runtime.7f029b069e0156e2bf558ee2aa08d6707d10d713d0328323585070661af22afe.js';
  function load(){
    const s = document.createElement('script');
    s.src = url;
    s.crossOrigin = 'anonymous';
    s.defer = true;
    s.onload = ()=>console.log('sites-runtime loaded');
    s.onerror = ()=>console.warn('failed to load sites-runtime from remote');
    document.head.appendChild(s);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
