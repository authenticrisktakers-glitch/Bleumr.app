import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FolderOpen, Folder, ChevronRight, ChevronDown,
  Code2, Bug, Lightbulb, Wrench, FlaskConical, Save, Copy,
  Check, Plus, Send, Bot, Sparkles, FileCode,
  Upload, Search, Braces, ChevronUp,
  ChevronDown as ChevronDownIcon, RotateCcw,
  GitBranch, Package, BookOpen, Link2, Star, Eye,
  Key, LogOut, RefreshCw, ExternalLink, ArrowLeft,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileNode { name:string; path:string; type:'file'|'dir'; children?:FileNode[]; expanded?:boolean; }
interface OpenFile { name:string; path:string; content:string; language:string; dirty:boolean; }
interface ChatMessage { role:'user'|'assistant'|'system'; content:string; codeBlock?:string; }
interface CodingPageProps { onClose:()=>void; apiKey?:string; }
type Integration = 'github' | 'stackoverflow' | 'npm' | 'mdn' | null;

// ─── Language map ─────────────────────────────────────────────────────────────

const LANGUAGE_MAP: Record<string,string> = {
  ts:'typescript',tsx:'typescript',js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',
  py:'python',rs:'rust',go:'go',java:'java',cs:'csharp',
  cpp:'cpp',cc:'cpp',cxx:'cpp',c:'c',h:'c',rb:'ruby',php:'php',swift:'swift',
  kt:'kotlin',kts:'kotlin',html:'html',htm:'html',css:'css',scss:'scss',less:'less',
  json:'json',jsonc:'json',yaml:'yaml',yml:'yaml',toml:'toml',
  md:'markdown',mdx:'markdown',sh:'bash',bash:'bash',zsh:'bash',
  sql:'sql',vue:'vue',svelte:'svelte',tf:'hcl',env:'plaintext',
  lock:'plaintext',gitignore:'plaintext',dockerfile:'dockerfile',
};

const QUICK_ACTIONS = [
  { id:'debug',    label:'Debug',     icon:Bug,          prompt:'Debug this code. Find all bugs, explain each issue, then provide the complete fixed version.' },
  { id:'explain',  label:'Explain',   icon:Lightbulb,    prompt:'Explain this code — what it does, how it works, and any important patterns.' },
  { id:'refactor', label:'Refactor',  icon:Wrench,       prompt:'Refactor for readability, performance, and maintainability.' },
  { id:'tests',    label:'Tests',     icon:FlaskConical, prompt:'Write comprehensive unit tests covering happy paths, edge cases, and error conditions.' },
  { id:'types',    label:'Add Types', icon:Braces,       prompt:'Add full TypeScript type annotations with proper interfaces and generics.' },
  { id:'optimize', label:'Optimize',  icon:Sparkles,     prompt:'Optimize for performance — reduce complexity, eliminate unnecessary work.' },
];

const PLACEHOLDER_CODE = `// CODE Bleu — powered by JUMARI
// Your AI pair programmer is ready.
//
//  1. Connect GitHub to browse your repos
//  2. Open a file or paste code here
//  3. Hit an action above to analyze it
//  4. Or ask JUMARI anything below

function greet(name: string): string {
  return \`Hello, \${name}! Ready to build.\`;
}

console.log(greet('World'));
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectLanguage(f:string):string {
  const base = f.split('/').pop() ?? f;
  // special dotfiles / no-extension files
  const lower = base.toLowerCase();
  if (lower==='dockerfile') return 'dockerfile';
  if (lower==='.gitignore'||lower==='.env'||lower==='.env.local'||lower==='.env.example') return 'plaintext';
  if (lower==='makefile') return 'bash';
  return LANGUAGE_MAP[base.split('.').pop()?.toLowerCase()??'']??'plaintext';
}

function getFileColor(name:string):string {
  const ext=name.split('.').pop()?.toLowerCase()??'';
  const m:Record<string,string>={
    ts:'#60a5fa',tsx:'#67e8f9',js:'#fcd34d',jsx:'#67e8f9',mjs:'#fcd34d',
    py:'#86efac',rs:'#fb923c',go:'#67e8f9',java:'#f97316',cs:'#a78bfa',
    cpp:'#fb7185',c:'#fb7185',rb:'#f87171',php:'#a78bfa',swift:'#f97316',
    kt:'#fb923c',html:'#f87171',htm:'#f87171',
    css:'#93c5fd',scss:'#f9a8d4',less:'#818cf8',
    json:'#d1d5db',yaml:'#86efac',yml:'#86efac',toml:'#86efac',
    md:'#c4b5fd',mdx:'#c4b5fd',sh:'#6ee7b7',bash:'#6ee7b7',
    sql:'#fbbf24',vue:'#86efac',svelte:'#fb923c',
  };
  return m[ext]??'rgba(255,255,255,0.3)';
}

function extractCodeBlock(text:string):string|null {
  const m=text.match(/```(?:\w+)?\n?([\s\S]*?)```/); return m?m[1].trim():null;
}

// ─── Glass styles ─────────────────────────────────────────────────────────────

const G = {
  panel:{ background:'rgba(255,255,255,0.03)', backdropFilter:'blur(48px) saturate(1.4)', WebkitBackdropFilter:'blur(48px) saturate(1.4)' } as React.CSSProperties,
  el:{ background:'rgba(255,255,255,0.05)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.08)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.06)' } as React.CSSProperties,
  border:'1px solid rgba(255,255,255,0.07)',
};

// ─── Integration API calls ────────────────────────────────────────────────────

async function githubFetch(path:string, token:string) {
  const r = await fetch(`https://api.github.com${path}`, { headers:{ Authorization:`Bearer ${token}`, Accept:'application/vnd.github.v3+json' } });
  if (!r.ok) {
    if (r.status === 401) throw new Error('GitHub 401: Invalid or expired token. Check your PAT and its scopes.');
    if (r.status === 403) throw new Error('GitHub 403: Token lacks required permissions.');
    throw new Error(`GitHub ${r.status}`);
  }
  return r.json();
}

async function searchStackOverflow(query:string) {
  const r = await fetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=8&filter=withbody`);
  const d = await r.json();
  return d.items ?? [];
}

async function searchNpm(query:string) {
  const r = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`);
  const d = await r.json();
  return d.objects ?? [];
}

async function searchMdn(query:string) {
  const r = await fetch(`https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US&size=8`);
  const d = await r.json();
  return d.documents ?? [];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LineNumbers({ code, scrollTop }:{ code:string; scrollTop:number }) {
  return (
    <div style={{position:'absolute',left:0,top:0,width:48,bottom:0,overflow:'hidden',userSelect:'none',pointerEvents:'none',paddingTop:14}}>
      <div style={{transform:`translateY(-${scrollTop}px)`}}>
        {code.split('\n').map((_,i)=>(
          <div key={i} style={{height:21,lineHeight:'21px',textAlign:'right',paddingRight:12,fontSize:11,fontFamily:'"JetBrains Mono",monospace',color:'rgba(255,255,255,0.14)'}}>
            {i+1}
          </div>
        ))}
      </div>
    </div>
  );
}

function FileTreeNode({ node, depth, onFileClick, activeFilePath, onToggle }:{
  node:FileNode; depth:number; onFileClick:(n:FileNode)=>void; activeFilePath:string; onToggle:(p:string)=>void;
}) {
  const active = node.path===activeFilePath;
  return (
    <div>
      <button
        onClick={()=>node.type==='dir'?onToggle(node.path):onFileClick(node)}
        style={{ width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:5,padding:`3px 8px 3px ${8+depth*12}px`,fontSize:12,color:active?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.4)',background:active?'rgba(255,255,255,0.08)':'transparent',border:'none',cursor:'pointer',borderRadius:4,transition:'all 0.1s',boxShadow:active?'inset 0 0 0 1px rgba(255,255,255,0.1)':'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}
        onMouseEnter={e=>{if(!active){(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.7)';}}}
        onMouseLeave={e=>{if(!active){(e.currentTarget as HTMLElement).style.background='transparent';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.4)';}}}
      >
        {node.type==='dir'
          ? <>{node.expanded?<ChevronDown size={10} style={{color:'rgba(255,255,255,0.2)',flexShrink:0}}/>:<ChevronRight size={10} style={{color:'rgba(255,255,255,0.2)',flexShrink:0}}/>}<Folder size={12} style={{color:'rgba(255,255,255,0.35)',flexShrink:0}}/></>
          : <FileCode size={12} style={{color:getFileColor(node.name),flexShrink:0,marginLeft:16}}/>
        }
        <span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{node.name}</span>
      </button>
      {node.type==='dir'&&node.expanded&&node.children?.map(c=>(
        <FileTreeNode key={c.path} node={c} depth={depth+1} onFileClick={onFileClick} activeFilePath={activeFilePath} onToggle={onToggle}/>
      ))}
    </div>
  );
}

// ─── Integration Panel ────────────────────────────────────────────────────────

function IntegrationPanel({
  integration, githubToken, githubUser, githubRepos, onConnectGitHub, onDisconnectGitHub,
  onSelectGitHubRepo, onClose, activeFile,
}:{
  integration: Integration;
  githubToken: string; githubUser: any; githubRepos: any[];
  onConnectGitHub: (token:string)=>Promise<void>;
  onDisconnectGitHub: ()=>void;
  onSelectGitHubRepo: (repo:any)=>void;
  onClose: ()=>void;
  activeFile: OpenFile|undefined;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSearch(''); setResults([]); setError(''); setSelectedItem(null); setTimeout(()=>searchRef.current?.focus(),100); }, [integration]);

  const doSearch = useCallback(async (q:string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true); setError('');
    try {
      if (integration==='stackoverflow') setResults(await searchStackOverflow(q));
      else if (integration==='npm') setResults(await searchNpm(q));
      else if (integration==='mdn') setResults(await searchMdn(q));
    } catch(e:any) { setError('Search failed. Check your connection.'); }
    finally { setLoading(false); }
  }, [integration]);

  useEffect(() => {
    const t = setTimeout(()=>{ if (search.trim().length>1) doSearch(search); }, 500);
    return ()=>clearTimeout(t);
  }, [search, doSearch]);

  const handleConnect = async () => {
    if (!tokenInput.trim()) return;
    setConnecting(true); setError('');
    try { await onConnectGitHub(tokenInput.trim()); setTokenInput(''); }
    catch { setError('Invalid token or no access. Check your GitHub PAT.'); }
    finally { setConnecting(false); }
  };

  const panelBg:React.CSSProperties = { position:'absolute',top:0,right:0,bottom:0,width:340,display:'flex',flexDirection:'column',background:'rgba(8,10,18,0.92)',backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',borderLeft:'1px solid rgba(255,255,255,0.07)',zIndex:50,boxShadow:'-8px 0 32px rgba(0,0,0,0.4)' };

  const TITLES:Record<string,string> = { github:'GitHub', stackoverflow:'Stack Overflow', npm:'npm Registry', mdn:'MDN Docs' };

  return (
    <motion.div initial={{x:340,opacity:0}} animate={{x:0,opacity:1}} exit={{x:340,opacity:0}} transition={{duration:0.2,ease:'easeOut'}} style={panelBg}>
      {/* Header */}
      <div style={{height:44,display:'flex',alignItems:'center',padding:'0 14px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0,gap:8}}>
        <button onClick={onClose} style={{background:'none',border:'none',color:'rgba(255,255,255,0.3)',cursor:'pointer',display:'flex',padding:4,borderRadius:4,transition:'color 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.7)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.3)';}}><ArrowLeft size={14}/></button>
        <span style={{fontSize:12.5,fontWeight:600,color:'rgba(255,255,255,0.6)'}}>
          {integration ? TITLES[integration] : ''}
        </span>
        {integration==='github' && githubUser && (
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
            <img src={githubUser.avatar_url} alt="" style={{width:20,height:20,borderRadius:'50%',opacity:0.8}}/>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>{githubUser.login}</span>
            <button onClick={onDisconnectGitHub} title="Disconnect" style={{background:'none',border:'none',color:'rgba(255,255,255,0.2)',cursor:'pointer',display:'flex',padding:3,borderRadius:3,transition:'color 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(252,165,165,0.7)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.2)';}}><LogOut size={12}/></button>
          </div>
        )}
      </div>

      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>

        {/* ── GITHUB ── */}
        {integration==='github' && !githubUser && (
          <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>
            <div style={{padding:'12px 14px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <p style={{margin:'0 0 10px',fontSize:12,color:'rgba(255,255,255,0.5)',lineHeight:1.6}}>Connect your GitHub account to browse repos and open files directly into the editor.</p>
              <p style={{margin:'0 0 14px',fontSize:11,color:'rgba(255,255,255,0.3)',lineHeight:1.5}}>Create a Personal Access Token at <strong style={{color:'rgba(255,255,255,0.5)'}}>github.com → Settings → Developer settings → PAT</strong> with <code style={{color:'rgba(255,255,255,0.5)'}}>repo</code> scope.</p>
              <input
                value={tokenInput} onChange={e=>setTokenInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') handleConnect(); }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                type="password"
                style={{width:'100%',padding:'8px 10px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,color:'rgba(255,255,255,0.8)',fontSize:12,outline:'none',boxSizing:'border-box',fontFamily:'"JetBrains Mono",monospace',marginBottom:10}}
                onFocus={e=>{(e.target as HTMLElement).style.borderColor='rgba(255,255,255,0.2)';}}
                onBlur={e=>{(e.target as HTMLElement).style.borderColor='rgba(255,255,255,0.1)';}}
              />
              <button onClick={handleConnect} disabled={connecting||!tokenInput.trim()} style={{width:'100%',padding:'8px',borderRadius:6,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.7)',cursor:'pointer',fontSize:12.5,fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:'all 0.12s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.14)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.08)';}}>
                {connecting?<><RefreshCw size={12} style={{animation:'spin 1s linear infinite'}}/>Connecting…</>:<><Key size={12}/>Connect GitHub</>}
              </button>
              {error && <p style={{margin:'10px 0 0',fontSize:11,color:'rgba(252,165,165,0.8)'}}>{error}</p>}
            </div>
          </div>
        )}

        {integration==='github' && githubUser && (
          <div style={{display:'flex',flexDirection:'column',flex:1}}>
            <div style={{padding:'8px 10px 4px',flexShrink:0}}>
              <div style={{position:'relative'}}>
                <Search size={11} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'rgba(255,255,255,0.2)',pointerEvents:'none'}}/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter repos…" ref={searchRef} style={{width:'100%',padding:'5px 8px 5px 24px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'rgba(255,255,255,0.7)',fontSize:11.5,outline:'none',boxSizing:'border-box'}}/>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'4px 6px'}}>
              {githubRepos
                .filter(r=>!search||r.name.toLowerCase().includes(search.toLowerCase())||r.description?.toLowerCase().includes(search.toLowerCase()))
                .map(repo => (
                  <button key={repo.id} onClick={()=>onSelectGitHubRepo(repo)} style={{width:'100%',textAlign:'left',padding:'8px 10px',borderRadius:6,background:'transparent',border:'1px solid transparent',cursor:'pointer',transition:'all 0.12s',marginBottom:2,display:'block'}}
                    onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.background='rgba(255,255,255,0.05)';el.style.borderColor='rgba(255,255,255,0.08)';}}
                    onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.background='transparent';el.style.borderColor='transparent';}}
                  >
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <GitBranch size={11} style={{color:'rgba(255,255,255,0.3)',flexShrink:0}}/>
                      <span style={{fontSize:12.5,color:'rgba(255,255,255,0.75)',fontWeight:500}}>{repo.name}</span>
                      {repo.private&&<span style={{fontSize:9,color:'rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.07)',padding:'1px 5px',borderRadius:3}}>private</span>}
                      <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
                        <span style={{fontSize:10,color:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',gap:2}}><Star size={9}/>{repo.stargazers_count}</span>
                      </div>
                    </div>
                    {repo.description&&<p style={{margin:0,fontSize:11,color:'rgba(255,255,255,0.3)',lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{repo.description}</p>}
                    <span style={{fontSize:10,color:'rgba(255,255,255,0.2)'}}>{repo.language}</span>
                  </button>
                ))}
              {githubRepos.length===0&&<div style={{padding:'24px 12px',textAlign:'center',fontSize:11,color:'rgba(255,255,255,0.2)'}}>No repos found</div>}
            </div>
          </div>
        )}

        {/* ── STACK OVERFLOW / npm / MDN ── */}
        {(integration==='stackoverflow'||integration==='npm'||integration==='mdn') && (
          <div style={{display:'flex',flexDirection:'column',flex:1}}>
            <div style={{padding:'8px 10px 6px',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
              <div style={{position:'relative'}}>
                <Search size={11} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'rgba(255,255,255,0.2)',pointerEvents:'none'}}/>
                <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder={integration==='stackoverflow'?'Search questions…':integration==='npm'?'Search packages…':'Search docs…'}
                  style={{width:'100%',padding:'6px 8px 6px 24px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'rgba(255,255,255,0.7)',fontSize:12,outline:'none',boxSizing:'border-box'}}
                  onFocus={e=>{(e.target as HTMLElement).style.borderColor='rgba(255,255,255,0.18)';}}
                  onBlur={e=>{(e.target as HTMLElement).style.borderColor='rgba(255,255,255,0.08)';}}
                />
              </div>
              {integration==='stackoverflow' && activeFile?.content.trim() && (
                <button onClick={()=>setSearch(activeFile.name.replace(/\.[^.]+$/,''))} style={{marginTop:6,padding:'4px 10px',borderRadius:5,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.35)',fontSize:11,cursor:'pointer',transition:'all 0.12s'}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.08)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.6)';}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.35)';}}
                >Search for current file's topic</button>
              )}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'6px 8px',display:'flex',flexDirection:'column',gap:4}}>
              {loading && <div style={{padding:'20px',textAlign:'center',color:'rgba(255,255,255,0.25)',fontSize:12}}>Searching…</div>}
              {error && <div style={{padding:'12px',fontSize:11,color:'rgba(252,165,165,0.7)',background:'rgba(239,68,68,0.08)',borderRadius:6,border:'1px solid rgba(239,68,68,0.15)'}}>{error}</div>}
              {!loading && !error && results.length===0 && search.length>1 && <div style={{padding:'20px',textAlign:'center',color:'rgba(255,255,255,0.2)',fontSize:12}}>No results for "{search}"</div>}
              {!loading && results.length===0 && search.length<=1 && (
                <div style={{padding:'24px 12px',textAlign:'center',color:'rgba(255,255,255,0.2)',fontSize:11,lineHeight:1.6}}>
                  {integration==='stackoverflow'?'Search Stack Overflow questions live.':integration==='npm'?'Search the npm registry for packages.':'Search MDN Web Docs.'}
                </div>
              )}

              {/* Stack Overflow results */}
              {integration==='stackoverflow' && results.map((item:any) => (
                <div key={item.question_id} style={{borderRadius:7,border:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.02)',overflow:'hidden'}}>
                  <button onClick={()=>setSelectedItem(selectedItem?.question_id===item.question_id?null:item)} style={{width:'100%',textAlign:'left',padding:'9px 11px',background:'transparent',border:'none',cursor:'pointer',display:'block',transition:'background 0.1s'}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)';}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent';}}
                  >
                    <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:4}}>
                      <div style={{flexShrink:0,padding:'2px 6px',borderRadius:4,background:item.is_answered?'rgba(134,239,172,0.1)':'rgba(255,255,255,0.05)',border:`1px solid ${item.is_answered?'rgba(134,239,172,0.2)':'rgba(255,255,255,0.08)'}`,fontSize:10,color:item.is_answered?'rgba(134,239,172,0.8)':'rgba(255,255,255,0.3)'}}>
                        {item.answer_count} ans
                      </div>
                      <span style={{fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.4,flex:1}} dangerouslySetInnerHTML={{__html:item.title}}/>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={{fontSize:10,color:'rgba(255,255,255,0.2)'}}>{item.score} votes</span>
                      <div style={{display:'flex',gap:3,flex:1,flexWrap:'wrap'}}>
                        {item.tags?.slice(0,4).map((t:string)=>(
                          <span key={t} style={{fontSize:9,color:'rgba(255,255,255,0.25)',background:'rgba(255,255,255,0.05)',padding:'1px 5px',borderRadius:3}}>{t}</span>
                        ))}
                      </div>
                      <a href={item.link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:'rgba(255,255,255,0.25)',display:'flex',textDecoration:'none',transition:'color 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.6)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.25)';}}>
                        <ExternalLink size={10}/>
                      </a>
                    </div>
                  </button>
                  {selectedItem?.question_id===item.question_id && item.body && (
                    <div style={{padding:'8px 11px 10px',borderTop:'1px solid rgba(255,255,255,0.05)',background:'rgba(0,0,0,0.2)'}}>
                      <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',lineHeight:1.6,maxHeight:200,overflowY:'auto'}} dangerouslySetInnerHTML={{__html:item.body?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,600)+'…'}}/>
                    </div>
                  )}
                </div>
              ))}

              {/* npm results */}
              {integration==='npm' && results.map((obj:any) => {
                const p = obj.package;
                return (
                  <div key={p.name} style={{padding:'9px 11px',borderRadius:7,border:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.02)',display:'flex',flexDirection:'column',gap:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <Package size={11} style={{color:'rgba(255,255,255,0.3)',flexShrink:0}}/>
                      <span style={{fontSize:13,color:'rgba(255,255,255,0.75)',fontWeight:500}}>{p.name}</span>
                      <span style={{fontSize:10,color:'rgba(255,255,255,0.25)',marginLeft:2}}>v{p.version}</span>
                      <a href={p.links?.npm} target="_blank" rel="noreferrer" style={{marginLeft:'auto',color:'rgba(255,255,255,0.2)',display:'flex',textDecoration:'none',transition:'color 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.6)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.2)';}}>
                        <ExternalLink size={10}/>
                      </a>
                    </div>
                    {p.description&&<p style={{margin:0,fontSize:11,color:'rgba(255,255,255,0.4)',lineHeight:1.5}}>{p.description}</p>}
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      {p.keywords?.slice(0,4).map((k:string)=>(
                        <span key={k} style={{fontSize:9,color:'rgba(255,255,255,0.25)',background:'rgba(255,255,255,0.05)',padding:'1px 5px',borderRadius:3}}>{k}</span>
                      ))}
                    </div>
                    <button onClick={()=>navigator.clipboard.writeText(`npm install ${p.name}`)} style={{marginTop:2,padding:'4px 10px',borderRadius:5,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.35)',fontSize:10.5,cursor:'pointer',textAlign:'left',fontFamily:'"JetBrains Mono",monospace',transition:'all 0.12s'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.08)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.6)';}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.35)';}}
                    >
                      npm install {p.name} — copy
                    </button>
                  </div>
                );
              })}

              {/* MDN results */}
              {integration==='mdn' && results.map((doc:any) => (
                <div key={doc.mdn_url} style={{padding:'9px 11px',borderRadius:7,border:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.02)',display:'flex',flexDirection:'column',gap:5}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                    <BookOpen size={11} style={{color:'rgba(255,255,255,0.3)',flexShrink:0,marginTop:2}}/>
                    <div style={{flex:1}}>
                      <span style={{fontSize:12.5,color:'rgba(255,255,255,0.7)',fontWeight:500,lineHeight:1.3,display:'block'}}>{doc.title}</span>
                      {doc.summary&&<p style={{margin:'4px 0 0',fontSize:11,color:'rgba(255,255,255,0.35)',lineHeight:1.5}}>{doc.summary.slice(0,180)}{doc.summary.length>180?'…':''}</p>}
                    </div>
                    <a href={`https://developer.mozilla.org${doc.mdn_url}`} target="_blank" rel="noreferrer" style={{color:'rgba(255,255,255,0.2)',display:'flex',textDecoration:'none',flexShrink:0,transition:'color 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.6)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.2)';}}>
                      <ExternalLink size={10}/>
                    </a>
                  </div>
                  {doc.mdn_url&&<span style={{fontSize:9.5,color:'rgba(255,255,255,0.2)',fontFamily:'"JetBrains Mono",monospace'}}>{doc.mdn_url}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CodingPage({ onClose, apiKey }: CodingPageProps) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([{ name:'untitled.ts',path:'__untitled__',content:PLACEHOLDER_CODE,language:'typescript',dirty:false }]);
  const [activeFilePath, setActiveFilePath] = useState('__untitled__');
  const [scrollTop, setScrollTop] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const orbit = (window as any).orbit;

  // Local file tree
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [treeSearch, setTreeSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // FileSystem Access API handle registry (path → handle)
  const fsHandleMap = useRef<Map<string, FileSystemFileHandle | FileSystemDirectoryHandle>>(new Map());

  // Integrations
  const [activeIntegration, setActiveIntegration] = useState<Integration>(null);
  const [githubToken, setGithubToken] = useState('');
  const [githubUser, setGithubUser] = useState<any>(null);
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubRepo, setGithubRepo] = useState<any>(null);
  const [githubFileTree, setGithubFileTree] = useState<FileNode[]>([]);

  // JUMARI
  const [messages, setMessages] = useState<ChatMessage[]>([{ role:'system', content:'CODE Bleu is ready. Open a file or paste code, then use the actions above or ask me anything.' }]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number|null>(null);
  const [jumariOpen, setJumariOpen] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeFile = openFiles.find(f=>f.path===activeFilePath);

  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:'smooth'}); },[messages]);

  // Load saved GitHub token on mount
  useEffect(()=>{
    const load = async () => {
      const stored = orbit?.storage?.getSecure ? await orbit.storage.getSecure('github_pat').catch(()=>null) : null;
      if (stored) connectGitHub(stored, true).catch(()=>{ /* stored token expired/invalid — silently ignore */ });
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── GitHub ────────────────────────────────────────────────────────────────

  const connectGitHub = useCallback(async (token:string, silent=false) => {
    const user = await githubFetch('/user', token);
    const repos = await githubFetch('/user/repos?per_page=100&sort=updated', token);
    setGithubToken(token); setGithubUser(user); setGithubRepos(repos);
    if (orbit?.storage?.setSecure) await orbit.storage.setSecure('github_pat', token).catch(()=>{});
  }, [orbit]);

  const disconnectGitHub = useCallback(()=>{
    setGithubToken(''); setGithubUser(null); setGithubRepos([]); setGithubRepo(null); setGithubFileTree([]);
    if (orbit?.storage?.setSecure) orbit.storage.setSecure('github_pat','').catch(()=>{});
  },[orbit]);

  const selectGitHubRepo = useCallback(async (repo:any) => {
    setGithubRepo(repo);
    try {
      const tree = await githubFetch(`/repos/${repo.full_name}/git/trees/HEAD?recursive=1`, githubToken);
      const nodes: FileNode[] = [];
      const dirMap: Record<string,FileNode> = {};
      for (const item of tree.tree ?? []) {
        if (item.type==='blob') {
          const parts = item.path.split('/');
          const name = parts[parts.length-1];
          const parentPath = parts.slice(0,-1).join('/');
          const node:FileNode = { name, path:`gh:${repo.full_name}:${item.path}`, type:'file' };
          if (parentPath && dirMap[parentPath]) {
            if (!dirMap[parentPath].children) dirMap[parentPath].children=[];
            dirMap[parentPath].children!.push(node);
          } else { nodes.push(node); }
        } else if (item.type==='tree') {
          const parts = item.path.split('/');
          const name = parts[parts.length-1];
          const dirNode:FileNode = { name, path:`gh:${repo.full_name}:${item.path}`, type:'dir', children:[], expanded:false };
          dirMap[item.path] = dirNode;
          const parentPath = parts.slice(0,-1).join('/');
          if (parentPath && dirMap[parentPath]) {
            if (!dirMap[parentPath].children) dirMap[parentPath].children=[];
            dirMap[parentPath].children!.push(dirNode);
          } else { nodes.push(dirNode); }
        }
      }
      setGithubFileTree(nodes);
    } catch(e) { console.error('Failed to load repo tree',e); }
    setActiveIntegration(null);
  }, [githubToken]);

  const openGitHubFile = useCallback(async (node:FileNode) => {
    const existing = openFiles.find(f=>f.path===node.path);
    if (existing) { setActiveFilePath(node.path); return; }
    try {
      const [,repoFull,filePath] = node.path.split(':');
      const data = await githubFetch(`/repos/${repoFull}/contents/${filePath}`, githubToken);
      const content = atob(data.content.replace(/\n/g,''));
      const nf:OpenFile={name:node.name,path:node.path,content,language:detectLanguage(node.name),dirty:false};
      setOpenFiles(prev=>[...prev,nf]); setActiveFilePath(node.path);
    } catch(e) { console.error('Failed to open file',e); }
  }, [openFiles, githubToken]);

  // ── Local filesystem ──────────────────────────────────────────────────────

  // Build FileNode list from a DirectoryHandle, storing all handles in fsHandleMap
  const readDirHandle = useCallback(async (dh: FileSystemDirectoryHandle, basePath: string): Promise<FileNode[]> => {
    const nodes: FileNode[] = [];
    for await (const [name, handle] of (dh as any).entries()) {
      const fullPath = basePath ? `${basePath}/${name}` : name;
      fsHandleMap.current.set(fullPath, handle);
      if (handle.kind === 'directory') {
        nodes.push({ name, path: fullPath, type: 'dir', children: [], expanded: false });
      } else {
        nodes.push({ name, path: fullPath, type: 'file' });
      }
    }
    nodes.sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
    return nodes;
  }, []);

  // Deep tree helpers
  const applyToTree = (nodes: FileNode[], path: string, fn: (n: FileNode) => FileNode): FileNode[] =>
    nodes.map(n => n.path === path ? fn(n) : { ...n, children: n.children ? applyToTree(n.children, path, fn) : undefined });

  const openDirectory = useCallback(async () => {
    fsHandleMap.current.clear();
    if (!orbit?.listDir) {
      // Browser File System Access API
      try {
        const dh: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker?.({ mode: 'read' });
        if (!dh) return;
        fsHandleMap.current.set('__root__', dh);
        const nodes = await readDirHandle(dh, '');
        setFileTree(nodes);
        setSidebarOpen(true);
      } catch {}
      return;
    }
    // Electron orbit path
    try {
      const r = await orbit.listDir('.');
      if (r?.entries) {
        const nodes: FileNode[] = r.entries.map((e: any) => ({
          name: e.name, path: e.path,
          type: e.isDirectory ? 'dir' : 'file',
          children: e.isDirectory ? [] : undefined,
        }));
        nodes.sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
        setFileTree(nodes);
        setSidebarOpen(true);
      }
    } catch {}
  }, [orbit, readDirHandle]);

  const toggleDir = useCallback(async (path: string) => {
    if (githubRepo) {
      setGithubFileTree(prev => applyToTree(prev, path, n => ({ ...n, expanded: !n.expanded })));
      return;
    }

    // Check if this dir is collapsed and has no children loaded yet
    const findNode = (nodes: FileNode[]): FileNode | undefined => {
      for (const n of nodes) {
        if (n.path === path) return n;
        if (n.children) { const found = findNode(n.children); if (found) return found; }
      }
    };
    const node = findNode(fileTree);

    // Lazy-load children if dir is being expanded and is empty
    if (node && !node.expanded && node.type === 'dir' && (!node.children || node.children.length === 0)) {
      // FSA handle path
      const handle = fsHandleMap.current.get(path);
      if (handle && handle.kind === 'directory') {
        const children = await readDirHandle(handle as FileSystemDirectoryHandle, path);
        setFileTree(prev => applyToTree(prev, path, n => ({ ...n, children, expanded: true })));
        return;
      }
      // Electron orbit path
      if (orbit?.listDir) {
        try {
          const r = await orbit.listDir(path);
          if (r?.entries) {
            const children: FileNode[] = r.entries.map((e: any) => ({
              name: e.name, path: e.path,
              type: e.isDirectory ? 'dir' : 'file',
              children: e.isDirectory ? [] : undefined,
            }));
            children.sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
            setFileTree(prev => applyToTree(prev, path, n => ({ ...n, children, expanded: true })));
            return;
          }
        } catch {}
      }
    }

    // Just toggle expanded state
    setFileTree(prev => applyToTree(prev, path, n => ({ ...n, expanded: !n.expanded })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubRepo, fileTree, orbit, readDirHandle]);

  const openLocalFile = useCallback(async (node: FileNode) => {
    const exists = openFiles.find(f => f.path === node.path);
    if (exists) { setActiveFilePath(node.path); return; }
    let content = '';

    // Try FSA handle first (showDirectoryPicker)
    const handle = fsHandleMap.current.get(node.path);
    if (handle && handle.kind === 'file') {
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        content = await file.text();
      } catch {}
    } else if (orbit?.readFile) {
      // Electron IPC
      try { content = (await orbit.readFile(node.path)) ?? ''; } catch {}
    }

    const nf: OpenFile = { name: node.name, path: node.path, content, language: detectLanguage(node.name), dirty: false };
    setOpenFiles(prev => [...prev, nf]);
    setActiveFilePath(node.path);
  }, [openFiles, orbit]);

  const saveFile = useCallback(async () => {
    if (!activeFile) return;

    // Try FSA writable handle (browser showDirectoryPicker)
    const handle = fsHandleMap.current.get(activeFile.path);
    if (handle && handle.kind === 'file') {
      try {
        const writable = await (handle as any).createWritable();
        await writable.write(activeFile.content);
        await writable.close();
        setOpenFiles(prev => prev.map(f => f.path === activeFile.path ? { ...f, dirty: false } : f));
        return;
      } catch {}
    }

    // Electron IPC
    if (orbit?.writeFile) {
      try {
        await orbit.writeFile(activeFile.path, activeFile.content);
        setOpenFiles(prev => prev.map(f => f.path === activeFile.path ? { ...f, dirty: false } : f));
      } catch {}
      return;
    }

    // Fallback: download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([activeFile.content], { type: 'text/plain' }));
    a.download = activeFile.name;
    a.click();
  }, [activeFile, orbit]);

  const updateCode = useCallback((v:string)=>{
    setOpenFiles(prev=>prev.map(f=>f.path===activeFilePath?{...f,content:v,dirty:true}:f));
  },[activeFilePath]);

  const applyCode = useCallback((code:string)=>{
    setOpenFiles(prev=>prev.map(f=>f.path===activeFilePath?{...f,content:code,dirty:true}:f));
    setTimeout(()=>textareaRef.current?.focus(),100);
  },[activeFilePath]);

  const handleKeyDown = useCallback((e:React.KeyboardEvent<HTMLTextAreaElement>)=>{
    if(e.key==='Tab'){e.preventDefault();const el=e.currentTarget,s=el.selectionStart;updateCode(el.value.substring(0,s)+'  '+el.value.substring(el.selectionEnd));requestAnimationFrame(()=>{el.selectionStart=el.selectionEnd=s+2;});}
    if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();saveFile();}
  },[updateCode,saveFile]);

  const closeTab = useCallback((path:string,e:React.MouseEvent)=>{
    e.stopPropagation();
    setOpenFiles(prev=>{const next=prev.filter(f=>f.path!==path);return next.length===0?[{name:'untitled.ts',path:'__untitled__',content:PLACEHOLDER_CODE,language:'typescript',dirty:false}]:next;});
    setActiveFilePath(prev=>{if(prev!==path)return prev;const idx=openFiles.findIndex(f=>f.path===path);return openFiles.filter(f=>f.path!==path)[Math.max(0,idx-1)]?.path??'__untitled__';});
  },[openFiles]);

  const handleUpload = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    // Accept any text-based file; no strict allowlist — browser will show all files
    inp.accept = '.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.rs,.go,.java,.cs,.cpp,.cc,.c,.h,.rb,.php,.swift,.kt,.html,.htm,.css,.scss,.less,.json,.jsonc,.yaml,.yml,.toml,.md,.mdx,.sh,.bash,.sql,.vue,.svelte,.tf,.env,.gitignore,.lock,.dockerfile';
    inp.onchange = async (ev) => {
      const files = Array.from((ev.target as HTMLInputElement).files ?? []);
      for (const file of files) {
        const content = await file.text();
        const nf: OpenFile = { name: file.name, path: `__upload__${Date.now()}_${file.name}`, content, language: detectLanguage(file.name), dirty: false };
        setOpenFiles(prev => [...prev, nf]);
        setActiveFilePath(nf.path);
      }
    };
    inp.click();
  }, []);

  // ── JUMARI ────────────────────────────────────────────────────────────────

  const callJumari = useCallback(async (userMessage:string)=>{
    if(isThinking)return;
    setIsThinking(true);if(!jumariOpen)setJumariOpen(true);
    const ctx=activeFile?.content?.trim()??'';
    const lang=activeFile?.language??'code';
    const fname=activeFile?.name??'untitled';
    const sys=`You are CODE Bleu — JUMARI's world-class coding assistant inside Bleumr. File: "${fname}" (${lang}). Be direct. No preamble. Wrap code in \`\`\`${lang}\\n...\\n\`\`\`. Just do it. Perfect spelling and grammar in all explanations — never misspell a word.`;
    const userContent=ctx?`${userMessage}\n\n\`\`\`${lang}\n${ctx}\n\`\`\``:userMessage;
    const msgs:ChatMessage[]=[...messages,{role:'user',content:userMessage}];
    setMessages(msgs);
    try{
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:sys},...msgs.slice(-10).map((m,i)=>({role:m.role==='system'?'assistant':m.role,content:i===msgs.length-1&&m.role==='user'?userContent:m.content}))],max_tokens:4096,temperature:0.3})});
      const data=await res.json();
      const reply=data?.choices?.[0]?.message?.content??'No response.';
      setMessages(prev=>[...prev,{role:'assistant',content:reply,codeBlock:extractCodeBlock(reply)??undefined}]);
    }catch(err:any){setMessages(prev=>[...prev,{role:'assistant',content:!apiKey?'No API key. Add your Groq key in Settings.':`Error: ${err?.message??'Something went wrong.'}`}]);}
    finally{setIsThinking(false);}
  },[isThinking,messages,activeFile,apiKey,jumariOpen]);

  const handleSend=useCallback(()=>{const t=input.trim();if(!t||isThinking)return;setInput('');callJumari(t);},[input,isThinking,callJumari]);

  const handleQuickAction=useCallback((prompt:string)=>{
    if(!activeFile?.content.trim()){setMessages(prev=>[...prev,{role:'system',content:'Open or paste some code first.'}]);setJumariOpen(true);return;}
    callJumari(prompt);
  },[activeFile,callJumari]);

  const handleCopy=useCallback((text:string,idx:number)=>{navigator.clipboard.writeText(text);setCopiedIdx(idx);setTimeout(()=>setCopiedIdx(null),1800);},[]);

  const displayTree = githubRepo ? githubFileTree : fileTree;
  const onFileClick = githubRepo ? openGitHubFile : openLocalFile;

  // ── Render ────────────────────────────────────────────────────────────────

  const INTEGRATIONS = [
    { id:'github' as Integration,     label:'GitHub',         icon:GitBranch,  connected:!!githubUser },
    { id:'stackoverflow' as Integration, label:'Stack Overflow', icon:Search,  connected:false },
    { id:'npm' as Integration,         label:'npm',            icon:Package,   connected:false },
    { id:'mdn' as Integration,         label:'MDN',            icon:BookOpen,  connected:false },
  ];

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}
      style={{position:'fixed',inset:0,zIndex:9999,fontFamily:'system-ui,-apple-system,sans-serif',overflow:'hidden',background:'linear-gradient(160deg,#020408 0%,#040810 40%,#030609 100%)'}}>

      {/* Ambient */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden'}}>
        <div style={{position:'absolute',width:800,height:600,borderRadius:'50%',top:-200,left:-200,background:'radial-gradient(ellipse,rgba(79,70,229,0.07) 0%,transparent 60%)',filter:'blur(60px)',willChange:'transform',transform:'translateZ(0)'}}/>
        <div style={{position:'absolute',width:500,height:500,borderRadius:'50%',bottom:-100,right:-50,background:'radial-gradient(ellipse,rgba(99,102,241,0.05) 0%,transparent 60%)',filter:'blur(40px)',willChange:'transform',transform:'translateZ(0)'}}/>
      </div>

      <div style={{position:'relative',zIndex:1,display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>

        {/* ── Top Bar ──────────────────────────────────────────────────── */}
        {/* paddingLeft:90 clears macOS hiddenInset traffic lights (~68px wide at x:12) */}
        <div style={{...G.panel,height:46,display:'flex',alignItems:'center',gap:8,paddingLeft:90,paddingRight:14,flexShrink:0,borderBottom:G.border,boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)',WebkitAppRegion:'no-drag'} as React.CSSProperties}>
          <div style={{display:'flex',alignItems:'center',gap:7,marginRight:6,WebkitAppRegion:'no-drag'} as React.CSSProperties}>
            <div style={{width:26,height:26,borderRadius:6,...G.el,display:'flex',alignItems:'center',justifyContent:'center'}}><Code2 size={13} style={{color:'rgba(255,255,255,0.6)'}}/></div>
            <span style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.75)',letterSpacing:'-0.01em'}}>Code</span>
          </div>

          <button onClick={()=>setSidebarOpen(v=>!v)} style={{...G.el,borderRadius:6,padding:'4px 7px',background:sidebarOpen?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.45)',cursor:'pointer',display:'flex',transition:'all 0.12s'}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.1)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.7)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=sidebarOpen?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.04)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.45)';}}>
            <Folder size={13}/>
          </button>

          <div style={{width:1,height:18,background:'rgba(255,255,255,0.07)',margin:'0 2px'}}/>

          {[
            {label:'Upload',icon:<Upload size={11}/>,fn:handleUpload},
            {label:'Open Folder',icon:<FolderOpen size={11}/>,fn:openDirectory},
            {label:'Save',icon:<Save size={11}/>,fn:saveFile},
          ].map(b=>(
            <button key={b.label} onClick={b.fn} style={{...G.el,borderRadius:6,padding:'5px 11px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontSize:12,color:'rgba(255,255,255,0.45)',transition:'all 0.12s'}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.1)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.8)';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.45)';}}>
              {b.icon}{b.label}
            </button>
          ))}

          {/* Integration pills */}
          <div style={{width:1,height:18,background:'rgba(255,255,255,0.07)',margin:'0 4px'}}/>
          {INTEGRATIONS.map(intg=>{
            const Icon=intg.icon;
            const isActive=activeIntegration===intg.id;
            return (
              <button key={intg.id} onClick={()=>setActiveIntegration(isActive?null:intg.id)} style={{
                borderRadius:6, padding:'5px 11px',
                background: isActive?'rgba(255,255,255,0.1)':intg.connected?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.03)',
                border:`1px solid ${isActive?'rgba(255,255,255,0.18)':intg.connected?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.06)'}`,
                color: isActive?'rgba(255,255,255,0.85)':intg.connected?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.3)',
                cursor:'pointer', display:'flex', alignItems:'center', gap:5,
                fontSize:11.5, transition:'all 0.12s',
                boxShadow: intg.connected?'inset 0 1px 0 rgba(255,255,255,0.06)':'none',
              }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.09)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.75)';}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=isActive?'rgba(255,255,255,0.1)':intg.connected?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.03)';(e.currentTarget as HTMLElement).style.color=isActive?'rgba(255,255,255,0.85)':intg.connected?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.3)';}}>
                <Icon size={11}/>
                {intg.label}
                {intg.connected&&<span style={{width:5,height:5,borderRadius:'50%',background:'rgba(134,239,172,0.8)',boxShadow:'0 0 6px rgba(134,239,172,0.4)',flexShrink:0}}/>}
              </button>
            );
          })}

          <div style={{flex:1}}/>
          <button onClick={onClose} style={{...G.el,borderRadius:6,padding:'5px 7px',cursor:'pointer',display:'flex',transition:'all 0.12s',color:'rgba(255,255,255,0.3)'}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(239,68,68,0.15)';(e.currentTarget as HTMLElement).style.color='rgba(252,165,165,0.9)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.3)';}}>
            <X size={13}/>
          </button>
        </div>

        {/* ── Main Body ─────────────────────────────────────────────────── */}
        <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>

          {/* ── Sidebar ───────────────────────────────────────────────── */}
          <AnimatePresence initial={false}>
            {sidebarOpen && (
              <motion.div initial={{width:0,opacity:0}} animate={{width:185,opacity:1}} exit={{width:0,opacity:0}} transition={{duration:0.18,ease:'easeInOut'}}
                style={{flexShrink:0,overflow:'hidden',borderRight:G.border,...G.panel}}>
                <div style={{width:185,display:'flex',flexDirection:'column',height:'100%'}}>
                  {/* Repo header if GitHub connected */}
                  {githubRepo && (
                    <div style={{padding:'6px 8px',borderBottom:G.border,flexShrink:0,display:'flex',alignItems:'center',gap:6}}>
                      <button onClick={()=>{setGithubRepo(null);setGithubFileTree([]);}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.25)',cursor:'pointer',display:'flex',padding:2,borderRadius:3,transition:'color 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.6)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.25)';}}>
                        <ArrowLeft size={11}/>
                      </button>
                      <span style={{fontSize:11,color:'rgba(255,255,255,0.45)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{githubRepo.name}</span>
                    </div>
                  )}
                  <div style={{padding:'6px 6px 3px',flexShrink:0}}>
                    <div style={{position:'relative'}}>
                      <Search size={10} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'rgba(255,255,255,0.2)',pointerEvents:'none'}}/>
                      <input value={treeSearch} onChange={e=>setTreeSearch(e.target.value)} placeholder="Filter…"
                        style={{width:'100%',padding:'4px 7px 4px 22px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:5,color:'rgba(255,255,255,0.6)',fontSize:11.5,outline:'none',boxSizing:'border-box'}}/>
                    </div>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:'3px 4px',scrollbarWidth:'thin'}}>
                    {displayTree.length===0 ? (
                      <div style={{padding:'24px 12px',textAlign:'center'}}>
                        {githubUser && !githubRepo ? (
                          <>
                            <GitBranch size={18} style={{color:'rgba(255,255,255,0.1)',display:'block',margin:'0 auto 8px'}}/>
                            <div style={{fontSize:11,color:'rgba(255,255,255,0.2)',lineHeight:1.6}}>Click <span style={{color:'rgba(255,255,255,0.4)'}}>GitHub</span> above<br/>and select a repo</div>
                          </>
                        ) : (
                          <>
                            <Folder size={18} style={{color:'rgba(255,255,255,0.1)',display:'block',margin:'0 auto 8px'}}/>
                            <div style={{fontSize:11,color:'rgba(255,255,255,0.2)',lineHeight:1.6}}>Open a local folder<br/>or connect GitHub</div>
                          </>
                        )}
                      </div>
                    ) : (treeSearch
                        ? (() => {
                            // Recursive flat search across all nodes
                            const hits: FileNode[] = [];
                            const walk = (nodes: FileNode[]) => { for (const n of nodes) { if (n.name.toLowerCase().includes(treeSearch.toLowerCase())) hits.push(n); if (n.children) walk(n.children); } };
                            walk(displayTree);
                            return hits.map(node => (
                              <FileTreeNode key={node.path} node={node} depth={0} onFileClick={onFileClick} activeFilePath={activeFilePath} onToggle={toggleDir}/>
                            ));
                          })()
                        : displayTree.map(node=>(
                            <FileTreeNode key={node.path} node={node} depth={0} onFileClick={onFileClick} activeFilePath={activeFilePath} onToggle={toggleDir}/>
                          ))
                      )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Editor Column ─────────────────────────────────────────── */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0,position:'relative'}}>

            {/* File tabs */}
            <div style={{...G.panel,borderBottom:G.border,height:36,display:'flex',alignItems:'flex-end',flexShrink:0,overflowX:'auto',scrollbarWidth:'none'}}>
              {openFiles.map(f=>(
                <div key={f.path} onClick={()=>setActiveFilePath(f.path)} style={{display:'flex',alignItems:'center',gap:5,padding:'0 12px',height:32,cursor:'pointer',background:f.path===activeFilePath?'rgba(255,255,255,0.06)':'transparent',borderBottom:`1px solid ${f.path===activeFilePath?'rgba(255,255,255,0.35)':'transparent'}`,borderRight:'1px solid rgba(255,255,255,0.05)',fontSize:11.5,color:f.path===activeFilePath?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.3)',whiteSpace:'nowrap',flexShrink:0,transition:'all 0.1s'}}>
                  <FileCode size={11} style={{color:getFileColor(f.name)}}/>
                  {f.name}
                  {f.dirty&&<span style={{color:'rgba(255,255,255,0.4)',fontSize:7}}>●</span>}
                  <button onClick={e=>closeTab(f.path,e)} style={{background:'none',border:'none',color:'rgba(255,255,255,0.2)',cursor:'pointer',padding:1,display:'flex',borderRadius:2,marginLeft:1}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.6)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.2)';}}>
                    <X size={10}/>
                  </button>
                </div>
              ))}
              <button onClick={()=>{const p=`__new__${Date.now()}`;setOpenFiles(prev=>[...prev,{name:'untitled.ts',path:p,content:'',language:'typescript',dirty:false}]);setActiveFilePath(p);}} style={{padding:'0 12px',height:32,background:'none',border:'none',color:'rgba(255,255,255,0.2)',cursor:'pointer',display:'flex',alignItems:'center'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.5)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.2)';}}>
                <Plus size={11}/>
              </button>
            </div>

            {/* Quick Actions */}
            <div style={{...G.panel,borderBottom:G.border,height:40,display:'flex',alignItems:'center',gap:4,padding:'0 12px',flexShrink:0,overflowX:'auto',scrollbarWidth:'none'}}>
              <span style={{fontSize:9,color:'rgba(255,255,255,0.15)',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',whiteSpace:'nowrap',marginRight:6}}>JUMARI</span>
              {QUICK_ACTIONS.map(a=>{
                const Icon=a.icon;
                return (
                  <button key={a.id} onClick={()=>handleQuickAction(a.prompt)} disabled={isThinking} style={{padding:'4px 11px',borderRadius:5,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.45)',fontSize:11.5,cursor:isThinking?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap',flexShrink:0,transition:'all 0.12s',opacity:isThinking?0.35:1}}
                    onMouseEnter={e=>{if(!isThinking){const el=e.currentTarget as HTMLElement;el.style.background='rgba(255,255,255,0.09)';el.style.borderColor='rgba(255,255,255,0.14)';el.style.color='rgba(255,255,255,0.85)';}}}
                    onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.background='rgba(255,255,255,0.04)';el.style.borderColor='rgba(255,255,255,0.07)';el.style.color='rgba(255,255,255,0.45)';}}>
                    <Icon size={11}/>{a.label}
                  </button>
                );
              })}
              <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                <span style={{fontSize:10,color:'rgba(255,255,255,0.15)',fontFamily:'"JetBrains Mono",monospace'}}>{activeFile?.language??'plaintext'}</span>
                <span style={{fontSize:10,color:'rgba(255,255,255,0.15)',fontFamily:'"JetBrains Mono",monospace'}}>{activeFile?`${activeFile.content.split('\n').length} ln`:''}</span>
                <button onClick={()=>{if(activeFile)navigator.clipboard.writeText(activeFile.content);}} style={{padding:'3px 8px',borderRadius:5,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.3)',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:10.5,transition:'all 0.12s'}} onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.background='rgba(255,255,255,0.08)';el.style.color='rgba(255,255,255,0.6)';}} onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.background='rgba(255,255,255,0.04)';el.style.color='rgba(255,255,255,0.3)';}}>
                  <Copy size={10}/>Copy
                </button>
              </div>
            </div>

            {/* Editor */}
            <div style={{flex:1,position:'relative',overflow:'hidden',minHeight:0,background:'rgba(0,0,0,0.3)'}}>
              <div style={{position:'absolute',left:0,top:0,width:48,bottom:0,background:'rgba(0,0,0,0.2)',borderRight:'1px solid rgba(255,255,255,0.04)',zIndex:1,pointerEvents:'none'}}>
                <LineNumbers code={activeFile?.content??''} scrollTop={scrollTop}/>
              </div>
              <textarea ref={textareaRef} value={activeFile?.content??''} onChange={e=>updateCode(e.target.value)} onKeyDown={handleKeyDown} onScroll={e=>setScrollTop((e.target as HTMLTextAreaElement).scrollTop)} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off"
                style={{position:'absolute',inset:0,paddingLeft:56,paddingTop:14,paddingBottom:14,paddingRight:20,background:'transparent',color:'rgba(255,255,255,0.78)',fontFamily:'"JetBrains Mono","Fira Code","Cascadia Code",monospace',fontSize:13,lineHeight:'21px',border:'none',outline:'none',resize:'none',width:'100%',height:'100%',boxSizing:'border-box',caretColor:'rgba(255,255,255,0.7)',tabSize:2,whiteSpace:'pre',overflowX:'auto'}}/>
            </div>

            {/* Integration side panel */}
            <AnimatePresence>
              {activeIntegration && (
                <IntegrationPanel
                  integration={activeIntegration}
                  githubToken={githubToken} githubUser={githubUser} githubRepos={githubRepos}
                  onConnectGitHub={connectGitHub} onDisconnectGitHub={disconnectGitHub}
                  onSelectGitHubRepo={selectGitHubRepo}
                  onClose={()=>setActiveIntegration(null)}
                  activeFile={activeFile}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── JUMARI Drawer ──────────────────────────────────────────────── */}
        <div style={{...G.panel,borderTop:G.border,flexShrink:0,boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)'}}>
          <div onClick={()=>setJumariOpen(v=>!v)} style={{height:36,display:'flex',alignItems:'center',padding:'0 14px',cursor:'pointer',gap:8,borderBottom:jumariOpen?G.border:'none'}}>
            <Bot size={13} style={{color:'rgba(255,255,255,0.35)'}}/>
            <span style={{fontSize:11.5,fontWeight:500,color:'rgba(255,255,255,0.4)'}}>JUMARI Code</span>
            {isThinking&&<div style={{display:'flex',gap:3,alignItems:'center'}}>{[0,1,2].map(i=><motion.div key={i} animate={{opacity:[0.2,0.8,0.2],y:[0,-2,0]}} transition={{repeat:Infinity,duration:0.9,delay:i*0.2}} style={{width:3,height:3,borderRadius:'50%',background:'rgba(255,255,255,0.4)'}}/>)}</div>}
            <div style={{flex:1}}/>
            <button onClick={e=>{e.stopPropagation();setMessages([{role:'system',content:'JUMARI Code is ready.'}]);}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.15)',cursor:'pointer',padding:3,display:'flex',borderRadius:4,transition:'color 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.45)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.15)';}}>
              <RotateCcw size={10}/>
            </button>
            {jumariOpen?<ChevronDownIcon size={12} style={{color:'rgba(255,255,255,0.2)'}}/>:<ChevronUp size={12} style={{color:'rgba(255,255,255,0.2)'}}/>}
          </div>

          <AnimatePresence initial={false}>
            {jumariOpen&&(
              <motion.div initial={{height:0,opacity:0}} animate={{height:255,opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.2,ease:'easeInOut'}} style={{overflow:'hidden'}}>
                <div style={{height:255,display:'flex',flexDirection:'column'}}>
                  <div style={{flex:1,overflowY:'auto',padding:'10px 14px',display:'flex',flexDirection:'column',gap:7,scrollbarWidth:'thin'}}>
                    {messages.map((msg,idx)=>(
                      <div key={idx}>
                        {msg.role==='system'&&<div style={{padding:'7px 11px',borderRadius:6,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',fontSize:12,color:'rgba(255,255,255,0.4)',lineHeight:1.5}}>{msg.content}</div>}
                        {msg.role==='user'&&<div style={{display:'flex',justifyContent:'flex-end'}}><div style={{maxWidth:'72%',padding:'7px 11px',borderRadius:8,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.1)',fontSize:12.5,color:'rgba(255,255,255,0.8)',lineHeight:1.5,boxShadow:'inset 0 1px 0 rgba(255,255,255,0.06)'}}>{msg.content}</div></div>}
                        {msg.role==='assistant'&&(
                          <div style={{display:'flex',flexDirection:'column',gap:5}}>
                            {msg.content.replace(/```[\s\S]*?```/g,'').trim()&&<div style={{padding:'7px 11px',borderRadius:6,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',fontSize:12.5,color:'rgba(255,255,255,0.6)',lineHeight:1.6,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{msg.content.replace(/```[\s\S]*?```/g,'').trim()}</div>}
                            {msg.codeBlock&&(
                              <div style={{borderRadius:6,overflow:'hidden',border:'1px solid rgba(255,255,255,0.08)',background:'rgba(0,0,0,0.4)'}}>
                                <div style={{padding:'5px 11px',background:'rgba(255,255,255,0.04)',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                                  <span style={{fontSize:9.5,color:'rgba(255,255,255,0.25)',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase'}}>Generated Code</span>
                                  <div style={{display:'flex',gap:5}}>
                                    <button onClick={()=>handleCopy(msg.codeBlock!,idx)} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:4,color:'rgba(255,255,255,0.4)',cursor:'pointer',display:'flex',alignItems:'center',gap:3,fontSize:10,padding:'2px 7px',transition:'all 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.1)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.7)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.4)';}}>
                                      {copiedIdx===idx?<><Check size={9} style={{color:'rgba(134,239,172,0.8)'}}/>Copied</>:<><Copy size={9}/>Copy</>}
                                    </button>
                                    <button onClick={()=>applyCode(msg.codeBlock!)} style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',borderRadius:4,color:'rgba(255,255,255,0.7)',cursor:'pointer',fontSize:10,padding:'2px 10px',fontWeight:500,transition:'all 0.1s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.15)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.08)';}}>
                                      Apply →
                                    </button>
                                  </div>
                                </div>
                                <pre style={{margin:0,padding:'9px 12px',overflowX:'auto',fontSize:11.5,lineHeight:'18px',color:'rgba(255,255,255,0.55)',fontFamily:'"JetBrains Mono","Fira Code",monospace',maxHeight:130}}>
                                  {msg.codeBlock.slice(0,800)}{msg.codeBlock.length>800?'\n…':''}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {isThinking&&<div style={{display:'flex',gap:4,padding:'5px 8px',alignItems:'center'}}>{[0,1,2].map(i=><motion.div key={i} animate={{opacity:[0.15,0.7,0.15],y:[0,-3,0]}} transition={{repeat:Infinity,duration:1,delay:i*0.22}} style={{width:4,height:4,borderRadius:'50%',background:'rgba(255,255,255,0.5)'}}/>)}</div>}
                    <div ref={chatEndRef}/>
                  </div>
                  <div style={{padding:'8px 12px 11px',borderTop:'1px solid rgba(255,255,255,0.05)',display:'flex',gap:7,alignItems:'flex-end',flexShrink:0}}>
                    <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}}} placeholder="Ask JUMARI about your code…" rows={1}
                      style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'rgba(255,255,255,0.8)',fontSize:12.5,padding:'8px 12px',resize:'none',outline:'none',fontFamily:'system-ui,sans-serif',lineHeight:1.5,scrollbarWidth:'none',backdropFilter:'blur(20px)',transition:'border-color 0.15s',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)'}}
                      onFocus={e=>{(e.target as HTMLElement).style.borderColor='rgba(255,255,255,0.18)';}}
                      onBlur={e=>{(e.target as HTMLElement).style.borderColor='rgba(255,255,255,0.08)';}}
                    />
                    <button onClick={handleSend} disabled={isThinking||!input.trim()} style={{padding:'9px 11px',borderRadius:8,background:isThinking||!input.trim()?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.1)',border:`1px solid ${isThinking||!input.trim()?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.16)'}`,color:isThinking||!input.trim()?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.8)',cursor:isThinking||!input.trim()?'not-allowed':'pointer',display:'flex',alignItems:'center',transition:'all 0.12s',boxShadow:isThinking||!input.trim()?'none':'inset 0 1px 0 rgba(255,255,255,0.12)'}}>
                      <Send size={13}/>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
