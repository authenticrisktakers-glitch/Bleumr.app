import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, FolderOpen, File, Folder, ChevronRight, ChevronDown, Send, RefreshCw, ArrowLeft } from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  expanded?: boolean;
}

interface ProjectsPageProps {
  onClose: () => void;
  onSendToChat: (message: string) => void;
}

const orbit = (window as any).orbit;

async function listDirectory(dirPath: string): Promise<FileNode[]> {
  if (!orbit?.listDir) return [];
  try {
    const entries: string[] = await orbit.listDir(dirPath);
    // Sort: directories first, then files, both alphabetical
    const nodes: FileNode[] = [];
    for (const name of entries) {
      if (name.startsWith('.')) continue; // skip hidden files
      const fullPath = dirPath.endsWith('/') ? dirPath + name : dirPath + '/' + name;
      const isDir = await orbit.checkFileExists(fullPath + '/').catch(() => false);
      nodes.push({ name, path: fullPath, isDirectory: !!isDir });
    }
    // Fallback: if checkFileExists doesn't work reliably for dirs, try listing
    for (const node of nodes) {
      if (!node.isDirectory) {
        try {
          const sub = await orbit.listDir(node.path);
          if (Array.isArray(sub) && sub.length >= 0) {
            node.isDirectory = true;
          }
        } catch { /* not a directory */ }
      }
    }
    return nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

async function readFile(path: string): Promise<string | null> {
  if (!orbit?.readFile) return null;
  try {
    return await orbit.readFile(path);
  } catch {
    return null;
  }
}

function FileTreeNode({ node, depth, onSelect, onToggle }: {
  node: FileNode;
  depth: number;
  onSelect: (node: FileNode) => void;
  onToggle: (node: FileNode) => void;
}) {
  const indent = depth * 16;
  return (
    <>
      <button
        onClick={() => node.isDirectory ? onToggle(node) : onSelect(node)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-[12px] hover:bg-white/[0.06] rounded transition-colors text-left"
        style={{ paddingLeft: indent + 8 }}
      >
        {node.isDirectory ? (
          node.expanded ? <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
        ) : <span className="w-3" />}
        {node.isDirectory
          ? <Folder className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          : <File className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        }
        <span className={node.isDirectory ? 'text-sky-300' : 'text-slate-400'}>{node.name}</span>
      </button>
      {node.isDirectory && node.expanded && node.children?.map(child => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} onSelect={onSelect} onToggle={onToggle} />
      ))}
    </>
  );
}

export function ProjectsPage({ onClose, onSendToChat }: ProjectsPageProps) {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openFolder = useCallback(async () => {
    // Try native directory picker first (works in browser preview)
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        // For browser preview, we can't get the real path — use handle name
        setProjectPath(dirHandle.name);
        // List entries via File System Access API
        const nodes: FileNode[] = [];
        for await (const [name, handle] of dirHandle.entries()) {
          if (name.startsWith('.')) continue;
          nodes.push({
            name,
            path: name,
            isDirectory: handle.kind === 'directory',
          });
        }
        setTree(nodes.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        }));
        return;
      } catch { /* cancelled or unsupported */ }
    }
    // Electron path — prompt user for directory
    const home = orbit?.system?.info ? (await orbit.system.info())?.homedir : null;
    const startPath = home || '/Users';
    const entries = await listDirectory(startPath);
    setProjectPath(startPath);
    setTree(entries);
  }, []);

  const toggleDir = useCallback(async (node: FileNode) => {
    if (!node.isDirectory) return;
    if (node.expanded) {
      node.expanded = false;
      node.children = undefined;
      setTree([...tree]);
    } else {
      node.children = await listDirectory(node.path);
      node.expanded = true;
      setTree([...tree]);
    }
  }, [tree]);

  const selectFile = useCallback(async (node: FileNode) => {
    if (node.isDirectory) return;
    const content = await readFile(node.path);
    if (content !== null) {
      setSelectedFile({ path: node.path, content });
    }
  }, []);

  const sendProjectContext = useCallback(async () => {
    if (!prompt.trim()) return;

    // Build rich project context — include file listing + selected file
    let context = `[Project: ${projectPath}]`;

    // Include top-level file listing so JUMARI knows the project structure
    if (tree.length > 0) {
      const listing = tree.map(n => `${n.isDirectory ? '📁' : '📄'} ${n.name}`).join('\n');
      context += `\n\nProject structure:\n${listing}`;
    }

    // Include selected file contents
    if (selectedFile) {
      context += `\n\n[File: ${selectedFile.path}]\n\`\`\`\n${selectedFile.content.slice(0, 4000)}\n\`\`\``;
    }

    // If this looks like an audit/review request, grab key files automatically
    const isAudit = /\b(audit|review|analyze|check|inspect|look at|scan)\b/i.test(prompt);
    if (isAudit && !selectedFile && orbit?.readFile) {
      // Try to read common project files for context
      const keyFiles = ['package.json', 'README.md', 'tsconfig.json', 'Cargo.toml', 'pyproject.toml', 'go.mod'];
      for (const kf of keyFiles) {
        const fullPath = projectPath?.endsWith('/') ? projectPath + kf : projectPath + '/' + kf;
        try {
          const content = await orbit.readFile(fullPath);
          if (content && content.length > 0) {
            context += `\n\n[File: ${kf}]\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``;
            break; // one key file is enough to establish context
          }
        } catch { /* file doesn't exist */ }
      }
    }

    context += `\n\nUser request: ${prompt}`;
    onSendToChat(context);
    setPrompt('');
  }, [prompt, projectPath, selectedFile, tree, onSendToChat]);

  // No project open — show open folder screen
  if (!projectPath) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <FolderOpen className="w-16 h-16 text-sky-400/50 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Open a Project</h2>
        <p className="text-sm text-slate-500 mb-6 text-center max-w-sm">
          Select a folder and JUMARI will help you read, edit, and understand the code inside it.
        </p>
        <button
          onClick={openFolder}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 rounded-xl text-sm font-medium transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          Open Folder
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <button onClick={() => { setProjectPath(null); setTree([]); setSelectedFile(null); }} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <FolderOpen className="w-4 h-4 text-sky-400" />
          <span className="text-[13px] font-medium text-white truncate max-w-[200px]">{projectPath}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={async () => { if (projectPath) { const entries = await listDirectory(projectPath); setTree(entries); } }} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree */}
        <div className="w-56 border-r border-white/[0.06] overflow-y-auto py-2">
          {tree.map(node => (
            <FileTreeNode key={node.path} node={node} depth={0} onSelect={selectFile} onToggle={toggleDir} />
          ))}
        </div>

        {/* File viewer + prompt */}
        <div className="flex-1 flex flex-col">
          {selectedFile ? (
            <>
              <div className="px-4 py-2 border-b border-white/[0.06] text-[11px] text-slate-500 font-mono">
                {selectedFile.path}
              </div>
              <pre className="flex-1 overflow-auto p-4 text-[12px] text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                {selectedFile.content}
              </pre>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
              Select a file to view
            </div>
          )}

          {/* Prompt bar */}
          <div className="border-t border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2">
              <input
                ref={inputRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendProjectContext(); }}
                placeholder={selectedFile ? 'Ask about this file...' : 'Ask about this project...'}
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
              />
              <button
                onClick={sendProjectContext}
                disabled={!prompt.trim()}
                className="p-1.5 rounded-lg text-sky-400 hover:bg-sky-500/20 disabled:opacity-30 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
