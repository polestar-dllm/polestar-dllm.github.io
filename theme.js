(() => {
  'use strict';
  const key='polestar-theme';
  const system=window.matchMedia('(prefers-color-scheme: dark)');
  let stored;
  try {stored=localStorage.getItem(key);} catch(error) {}
  let mode=stored==='light'||stored==='dark'?stored:(system.matches?'dark':'light');
  document.documentElement.dataset.theme=mode;
  function reflect(){
    const button=document.getElementById('theme-toggle');if(!button)return;
    const dark=mode==='dark';
    button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
    button.setAttribute('aria-pressed',String(dark));
    button.title=dark?'Light mode':'Dark mode';
    button.innerHTML=dark?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z"/></svg>';
  }
  function apply(next,persist){
    mode=next;document.documentElement.dataset.theme=mode;
    if(persist){try{localStorage.setItem(key,mode);stored=mode;}catch(error){}}
    reflect();window.dispatchEvent(new CustomEvent('polestar-theme-change'));
  }
  document.addEventListener('DOMContentLoaded',()=>{
    reflect();document.getElementById('theme-toggle')?.addEventListener('click',()=>apply(mode==='dark'?'light':'dark',true));
  });
  system.addEventListener('change',event=>{if(!stored)apply(event.matches?'dark':'light',false);});
})();
