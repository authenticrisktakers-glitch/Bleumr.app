// ─── Code Bleu Preview Helpers ───────────────────────────────────────────────

export const PREVIEW_CONSOLE_BRIDGE = `<script>
(function(){
  var _post=function(l,a){try{var m=Array.prototype.slice.call(a).map(function(x){
    if(typeof x==='object')try{return JSON.stringify(x,null,2)}catch(e){return String(x)}return String(x)
  }).join(' ');window.parent.postMessage({__bleumr_console:true,level:l,message:m},'*')}catch(e){}};
  var oL=console.log,oW=console.warn,oE=console.error;
  console.log=function(){oL.apply(console,arguments);_post('log',arguments)};
  console.warn=function(){oW.apply(console,arguments);_post('warn',arguments)};
  console.error=function(){oE.apply(console,arguments);_post('error',arguments)};
  window.onerror=function(m,s,l){_post('error',['Uncaught '+m+' at line '+l]);return true};
  window.onunhandledrejection=function(e){_post('error',['Promise rejection: '+(e.reason?.message||e.reason||'unknown')])};
})();
</script>`;

export function buildPreviewFromFiles(files: { path: string; content: string }[]): string {
  const htmlFiles = files.filter(f => f.path.endsWith('.html'));
  const cssFiles = files.filter(f => f.path.endsWith('.css'));
  const jsFiles = files.filter(f => f.path.endsWith('.js') && !f.path.endsWith('.min.js'));

  const mainHtml = htmlFiles.find(f => f.path.includes('index')) || htmlFiles[0];
  if (!mainHtml) return '';

  let html = mainHtml.content;

  for (const css of cssFiles) {
    const escaped = css.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRe = new RegExp(`<link[^>]*href=["']${escaped}["'][^>]*/?>`, 'gi');
    if (linkRe.test(html)) {
      html = html.replace(linkRe, `<style>${css.content}</style>`);
    } else {
      html = html.replace('</head>', `<style>${css.content}</style>\n</head>`);
    }
  }

  for (const js of jsFiles) {
    const escaped = js.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scriptRe = new RegExp(`<script[^>]*src=["']${escaped}["'][^>]*>\\s*</script>`, 'gi');
    if (scriptRe.test(html)) {
      html = html.replace(scriptRe, `<script>${js.content}</script>`);
    } else {
      html = html.replace('</body>', `<script>${js.content}</script>\n</body>`);
    }
  }

  const cdns: string[] = [];
  if (!html.includes('cdn.tailwindcss.com') && !html.includes('tailwind'))
    cdns.push('<script src="https://cdn.tailwindcss.com"></script>');
  if (!html.includes('fonts.googleapis.com'))
    cdns.push('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">');
  if (!html.includes('font-awesome') && !html.includes('fontawesome'))
    cdns.push('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">');
  if (!html.includes('background') && !html.includes('bg-['))
    cdns.push(`<style>body{font-family:'Inter',sans-serif;background:#0a0a0a;color:#e2e8f0;margin:0}</style>`);

  if (cdns.length > 0) {
    const injection = cdns.join('\n');
    if (html.includes('<head>')) html = html.replace('<head>', `<head>\n${injection}`);
    else html = `<html><head>${injection}</head>${html}</html>`;
  }

  html = html.replace('<head>', `<head>${PREVIEW_CONSOLE_BRIDGE}`);

  if (html.includes('AOS')) {
    html = html.replace(/<script[^>]*>\s*AOS\.init\([^)]*\);?\s*<\/script>/gi, '');
    html = html.replace('</body>', `<script>window.addEventListener('load',function(){if(typeof AOS!=='undefined'){try{AOS.init({duration:800,once:true})}catch(e){}}});</script>\n</body>`);
  }

  return html;
}
