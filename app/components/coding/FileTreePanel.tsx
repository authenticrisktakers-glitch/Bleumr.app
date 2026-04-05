import React, { useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FolderOpen, Folder, File, ChevronRight, ChevronDown,
  FileCode, FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileTreePanelProps {
  files: { path: string; name: string }[];
  modifiedFiles: Set<string>;
  onFileSelect: (path: string) => void;
  projectName: string | null;
  projectPath: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  depth: number;
}

// ─── Extension color map ──────────────────────────────────────────────────────

const EXT_COLORS: Record<string, string> = {
  ts: '#3b82f6',
  tsx: '#3b82f6',
  js: '#eab308',
  jsx: '#eab308',
  mjs: '#eab308',
  cjs: '#eab308',
  html: '#f97316',
  htm: '#f97316',
  css: '#a855f7',
  scss: '#a855f7',
  sass: '#a855f7',
  less: '#a855f7',
  json: '#22c55e',
  jsonc: '#22c55e',
  md: '#6b7280',
  mdx: '#6b7280',
  py: '#3b82f6',
  rs: '#f97316',
  go: '#06b6d4',
  java: '#ef4444',
  rb: '#ef4444',
  php: '#8b5cf6',
  swift: '#f97316',
  kt: '#a855f7',
  yaml: '#22c55e',
  yml: '#22c55e',
  toml: '#22c55e',
  xml: '#f97316',
  svg: '#eab308',
  sh: '#22c55e',
  bash: '#22c55e',
  zsh: '#22c55e',
  sql: '#3b82f6',
  graphql: '#e91e90',
  gql: '#e91e90',
  vue: '#22c55e',
  svelte: '#f97316',
  dockerfile: '#3b82f6',
  env: '#eab308',
};

const DEFAULT_DOT_COLOR = '#6b7280';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  // Handle dotfiles / special names
  if (lower === 'dockerfile' || lower === 'makefile') return lower;
  if (lower.startsWith('.env')) return 'env';
  const dot = lower.lastIndexOf('.');
  if (dot === -1 || dot === 0) return '';
  return lower.slice(dot + 1);
}

function getDotColor(filename: string): string {
  const ext = getExtension(filename);
  return EXT_COLORS[ext] || DEFAULT_DOT_COLOR;
}

function buildTree(files: { path: string; name: string }[]): TreeNode[] {
  const root: Map<string, TreeNode> = new Map();

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let currentMap = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      if (!currentMap.has(part)) {
        const node: TreeNode = {
          name: part,
          path: isLast ? file.path : currentPath,
          isFolder: !isLast,
          children: [],
          depth: i,
        };
        currentMap.set(part, node);
      }

      const existing = currentMap.get(part)!;

      if (isLast) {
        existing.isFolder = false;
        existing.path = file.path;
      } else {
        existing.isFolder = true;
        // Build a child map from existing children
        if (existing.children.length === 0) {
          (existing as any)._childMap = new Map<string, TreeNode>();
        }
        if (!(existing as any)._childMap) {
          const childMap = new Map<string, TreeNode>();
          for (const c of existing.children) childMap.set(c.name, c);
          (existing as any)._childMap = childMap;
        }
        currentMap = (existing as any)._childMap;
      }
    }
  }

  function collectNodes(map: Map<string, TreeNode>): TreeNode[] {
    const nodes: TreeNode[] = [];
    for (const node of map.values()) {
      if (node.isFolder && (node as any)._childMap) {
        node.children = collectNodes((node as any)._childMap);
        delete (node as any)._childMap;
      }
      nodes.push(node);
    }
    return sortNodes(nodes);
  }

  return collectNodes(root);
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    // Folders first
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    // Alphabetical within same type
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: '#0d0d14',
    color: '#e5e7eb',
    fontSize: 13,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    overflow: 'hidden',
    userSelect: 'none' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#f3f4f6',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    letterSpacing: '0.01em',
  },
  headerCount: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: 500,
    flexShrink: 0,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.05)',
  },
  treeContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    padding: '4px 0',
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '32px 16px',
    textAlign: 'center' as const,
  },
  placeholderIcon: {
    color: '#374151',
    marginBottom: 12,
  },
  placeholderText: {
    color: '#4b5563',
    fontSize: 12,
    lineHeight: 1.5,
  },
};

// ─── File icon dot ────────────────────────────────────────────────────────────

const FileDot = memo(({ filename }: { filename: string }) => {
  const color = getDotColor(filename);
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
});
FileDot.displayName = 'FileDot';

// ─── Modified indicator ───────────────────────────────────────────────────────

const ModifiedDot = memo(() => (
  <span
    style={{
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: '#f59e0b',
      display: 'inline-block',
      flexShrink: 0,
      marginLeft: 4,
    }}
  />
));
ModifiedDot.displayName = 'ModifiedDot';

// ─── Tree Row ─────────────────────────────────────────────────────────────────

interface TreeRowProps {
  node: TreeNode;
  modifiedFiles: Set<string>;
  onFileSelect: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  depth: number;
}

const TreeRow = memo(({
  node,
  modifiedFiles,
  onFileSelect,
  expandedFolders,
  onToggleFolder,
  depth,
}: TreeRowProps) => {
  const [hovered, setHovered] = useState(false);
  const isExpanded = expandedFolders.has(node.path);
  const isModified = modifiedFiles.has(node.path);

  const handleClick = useCallback(() => {
    if (node.isFolder) {
      onToggleFolder(node.path);
    } else {
      onFileSelect(node.path);
    }
  }, [node.isFolder, node.path, onToggleFolder, onFileSelect]);

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: 28,
    paddingLeft: 12 + depth * 16,
    paddingRight: 8,
    cursor: 'pointer',
    background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
    transition: 'background 0.12s ease',
    gap: 6,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  };

  const nameStyle: React.CSSProperties = {
    fontSize: 12.5,
    color: isModified ? '#fbbf24' : (node.isFolder ? '#d1d5db' : '#9ca3af'),
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: node.isFolder ? 500 : 400,
    letterSpacing: '0.005em',
    lineHeight: '28px',
  };

  const chevronStyle: React.CSSProperties = {
    width: 14,
    height: 14,
    flexShrink: 0,
    color: '#6b7280',
    transition: 'transform 0.15s ease',
  };

  const folderIconStyle: React.CSSProperties = {
    width: 15,
    height: 15,
    flexShrink: 0,
    color: isExpanded ? '#60a5fa' : '#6b7280',
  };

  return (
    <>
      <div
        style={rowStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        role="treeitem"
        aria-expanded={node.isFolder ? isExpanded : undefined}
      >
        {/* Chevron for folders, spacer for files */}
        {node.isFolder ? (
          isExpanded
            ? <ChevronDown style={chevronStyle} />
            : <ChevronRight style={chevronStyle} />
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}

        {/* Icon */}
        {node.isFolder ? (
          isExpanded
            ? <FolderOpen style={folderIconStyle} />
            : <Folder style={folderIconStyle} />
        ) : (
          <FileDot filename={node.name} />
        )}

        {/* Name */}
        <span style={nameStyle}>{node.name}</span>

        {/* Modified indicator */}
        {isModified && <ModifiedDot />}
      </div>

      {/* Children */}
      {node.isFolder && (
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              {node.children.map((child) => (
                <TreeRow
                  key={child.path}
                  node={child}
                  modifiedFiles={modifiedFiles}
                  onFileSelect={onFileSelect}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  depth={depth + 1}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
});
TreeRow.displayName = 'TreeRow';

// ─── Compute initially expanded folders (first 2 levels) ─────────────────────

function getInitialExpanded(tree: TreeNode[], maxDepth = 2): Set<string> {
  const expanded = new Set<string>();

  function walk(nodes: TreeNode[], depth: number) {
    if (depth >= maxDepth) return;
    for (const node of nodes) {
      if (node.isFolder) {
        expanded.add(node.path);
        walk(node.children, depth + 1);
      }
    }
  }

  walk(tree, 0);
  return expanded;
}

// ─── FileTreePanel ────────────────────────────────────────────────────────────

export const FileTreePanel = memo(({
  files,
  modifiedFiles,
  onFileSelect,
  projectName,
  projectPath,
}: FileTreePanelProps) => {
  const tree = useMemo(() => buildTree(files), [files]);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() =>
    getInitialExpanded(tree)
  );

  // Recompute initial expansion when tree changes structurally
  const prevFileCountRef = React.useRef(files.length);
  React.useEffect(() => {
    if (files.length !== prevFileCountRef.current) {
      prevFileCountRef.current = files.length;
      setExpandedFolders(getInitialExpanded(tree));
    }
  }, [files.length, tree]);

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const fileCount = files.length;

  // ── Empty state ──
  if (files.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <FileCode style={{ width: 14, height: 14, color: '#4b5563' }} />
            <span style={{ ...styles.headerTitle, color: '#6b7280' }}>Explorer</span>
          </div>
        </div>
        <div style={styles.placeholder}>
          <FolderOpen style={{ ...styles.placeholderIcon, width: 32, height: 32 }} />
          <span style={styles.placeholderText}>
            Open a project to see files
          </span>
        </div>
      </div>
    );
  }

  // ── Tree view ──
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <FolderOpen style={{ width: 14, height: 14, color: '#60a5fa', flexShrink: 0 }} />
          <span style={styles.headerTitle} title={projectPath || undefined}>
            {projectName || 'Project'}
          </span>
        </div>
        <span style={styles.headerCount}>
          {fileCount} file{fileCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tree */}
      <div
        style={styles.treeContainer}
        role="tree"
        aria-label="File explorer"
      >
        {tree.map((node) => (
          <TreeRow
            key={node.path}
            node={node}
            modifiedFiles={modifiedFiles}
            onFileSelect={onFileSelect}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
});
FileTreePanel.displayName = 'FileTreePanel';

export default FileTreePanel;
