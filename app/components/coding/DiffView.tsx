import React, { useState, useMemo, memo } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, FileDiff } from 'lucide-react';

// ---- Types ----

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  fileName: string;
  language: string;
}

const enum DiffType {
  Added = 'added',
  Removed = 'removed',
  Unchanged = 'unchanged',
}

interface DiffLine {
  type: DiffType;
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

interface CollapsedSection {
  kind: 'collapsed';
  count: number;
}

type DisplayEntry = DiffLine | CollapsedSection;

function isCollapsed(entry: DisplayEntry): entry is CollapsedSection {
  return 'kind' in entry && entry.kind === 'collapsed';
}

// ---- LCS-based diff algorithm ----

function computeLCS(oldLines: string[], newLines: string[]): boolean[][] {
  const m = oldLines.length;
  const n = newLines.length;

  // dp[i][j] = LCS length for oldLines[0..i-1], newLines[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find which lines are in the LCS
  const inLcsOld: boolean[] = new Array(m).fill(false);
  const inLcsNew: boolean[] = new Array(n).fill(false);

  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      inLcsOld[i - 1] = true;
      inLcsNew[j - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return [inLcsOld, inLcsNew] as unknown as boolean[][];
}

function computeDiffLines(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const [inLcsOld, inLcsNew] = computeLCS(oldLines, newLines);

  const result: DiffLine[] = [];
  let oi = 0;
  let ni = 0;
  let oldNum = 1;
  let newNum = 1;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && inLcsOld[oi] && ni < newLines.length && inLcsNew[ni]) {
      // Matched (unchanged)
      result.push({
        type: DiffType.Unchanged,
        content: oldLines[oi],
        oldLineNum: oldNum,
        newLineNum: newNum,
      });
      oi++;
      ni++;
      oldNum++;
      newNum++;
    } else {
      // Emit all removals first, then additions, for a cleaner unified view
      const removals: DiffLine[] = [];
      const additions: DiffLine[] = [];

      while (oi < oldLines.length && !inLcsOld[oi]) {
        removals.push({
          type: DiffType.Removed,
          content: oldLines[oi],
          oldLineNum: oldNum,
          newLineNum: null,
        });
        oi++;
        oldNum++;
      }

      while (ni < newLines.length && !inLcsNew[ni]) {
        additions.push({
          type: DiffType.Added,
          content: newLines[ni],
          oldLineNum: null,
          newLineNum: newNum,
        });
        ni++;
        newNum++;
      }

      result.push(...removals, ...additions);
    }
  }

  return result;
}

// ---- Context collapsing ----

const CONTEXT_LINES = 3;

function collapseUnchanged(lines: DiffLine[]): DisplayEntry[] {
  // Find indices of all changed lines
  const changedIndices = new Set<number>();
  lines.forEach((line, idx) => {
    if (line.type !== DiffType.Unchanged) {
      changedIndices.add(idx);
    }
  });

  // Mark which lines should be visible (changed lines + context)
  const visible = new Set<number>();
  changedIndices.forEach((idx) => {
    for (let c = idx - CONTEXT_LINES; c <= idx + CONTEXT_LINES; c++) {
      if (c >= 0 && c < lines.length) {
        visible.add(c);
      }
    }
  });

  // If everything is visible or no changes, show all
  if (changedIndices.size === 0 || visible.size >= lines.length) {
    return lines;
  }

  const result: DisplayEntry[] = [];
  let hiddenCount = 0;

  for (let i = 0; i < lines.length; i++) {
    if (visible.has(i)) {
      if (hiddenCount > 0) {
        result.push({ kind: 'collapsed', count: hiddenCount });
        hiddenCount = 0;
      }
      result.push(lines[i]);
    } else {
      hiddenCount++;
    }
  }

  if (hiddenCount > 0) {
    result.push({ kind: 'collapsed', count: hiddenCount });
  }

  return result;
}

// ---- Styles ----

const styles = {
  container: {
    background: '#0d0d14',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
    fontSize: 13,
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    userSelect: 'none' as const,
  } as React.CSSProperties,

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  } as React.CSSProperties,

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  } as React.CSSProperties,

  fileName: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  stat: {
    fontSize: 12,
    fontWeight: 400,
    marginLeft: 8,
  } as React.CSSProperties,

  additions: {
    color: '#22c55e',
  } as React.CSSProperties,

  deletions: {
    color: '#ef4444',
  } as React.CSSProperties,

  copyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  } as React.CSSProperties,

  diffBody: {
    maxHeight: 400,
    overflowY: 'auto' as const,
    overflowX: 'auto' as const,
  } as React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    tableLayout: 'fixed' as const,
  } as React.CSSProperties,

  lineNum: {
    width: 48,
    minWidth: 48,
    padding: '1px 8px 1px 0',
    textAlign: 'right' as const,
    color: 'rgba(148,163,184,0.35)',
    fontSize: 12,
    verticalAlign: 'top',
    userSelect: 'none' as const,
    lineHeight: '20px',
  } as React.CSSProperties,

  prefix: {
    width: 20,
    minWidth: 20,
    padding: '1px 4px 1px 6px',
    textAlign: 'center' as const,
    fontWeight: 600,
    fontSize: 13,
    verticalAlign: 'top',
    userSelect: 'none' as const,
    lineHeight: '20px',
  } as React.CSSProperties,

  content: {
    padding: '1px 12px 1px 4px',
    whiteSpace: 'pre' as const,
    lineHeight: '20px',
    overflow: 'visible',
  } as React.CSSProperties,

  collapsedRow: {
    padding: '4px 0',
    textAlign: 'center' as const,
    color: 'rgba(148,163,184,0.4)',
    fontSize: 12,
    background: 'rgba(255,255,255,0.015)',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    lineHeight: '20px',
  } as React.CSSProperties,

  tooLarge: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '32px 16px',
    color: '#94a3b8',
    fontSize: 14,
  } as React.CSSProperties,
};

const ROW_STYLES: Record<DiffType, React.CSSProperties> = {
  [DiffType.Added]: { background: 'rgba(34,197,94,0.12)' },
  [DiffType.Removed]: { background: 'rgba(239,68,68,0.12)' },
  [DiffType.Unchanged]: {},
};

const PREFIX_COLORS: Record<DiffType, string> = {
  [DiffType.Added]: '#22c55e',
  [DiffType.Removed]: '#ef4444',
  [DiffType.Unchanged]: 'transparent',
};

const CONTENT_COLORS: Record<DiffType, string> = {
  [DiffType.Added]: '#bbf7d0',
  [DiffType.Removed]: '#fecaca',
  [DiffType.Unchanged]: 'rgba(226,232,240,0.5)',
};

const PREFIX_CHAR: Record<DiffType, string> = {
  [DiffType.Added]: '+',
  [DiffType.Removed]: '-',
  [DiffType.Unchanged]: ' ',
};

const TOO_LARGE_THRESHOLD = 1000;
const AUTO_COLLAPSE_THRESHOLD = 50;

// ---- Component ----

const DiffView = memo(function DiffView({
  oldContent,
  newContent,
  fileName,
  language: _language,
}: DiffViewProps) {
  const [copied, setCopied] = useState(false);

  const isTooLarge =
    oldContent.split('\n').length > TOO_LARGE_THRESHOLD ||
    newContent.split('\n').length > TOO_LARGE_THRESHOLD;

  const diffLines = useMemo(() => {
    if (isTooLarge) return [];
    return computeDiffLines(oldContent, newContent);
  }, [oldContent, newContent, isTooLarge]);

  const { additionCount, deletionCount } = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const line of diffLines) {
      if (line.type === DiffType.Added) additions++;
      if (line.type === DiffType.Removed) deletions++;
    }
    return { additionCount: additions, deletionCount: deletions };
  }, [diffLines]);

  const totalChanges = additionCount + deletionCount;

  const [expanded, setExpanded] = useState(() => {
    if (isTooLarge) return false;
    return totalChanges <= AUTO_COLLAPSE_THRESHOLD;
  });

  const displayEntries = useMemo(() => {
    return collapseUnchanged(diffLines);
  }, [diffLines]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(newContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header} onClick={toggleExpanded}>
        <div style={styles.headerLeft}>
          {expanded ? (
            <ChevronDown size={14} color="#94a3b8" />
          ) : (
            <ChevronRight size={14} color="#94a3b8" />
          )}
          <FileDiff size={14} color="#94a3b8" />
          <span style={styles.fileName}>{fileName}</span>
          <span style={styles.stat}>
            {!isTooLarge && (
              <>
                <span style={styles.additions}>+{additionCount}</span>
                {' '}
                <span style={styles.deletions}>-{deletionCount}</span>
              </>
            )}
          </span>
        </div>
        <div style={styles.headerRight}>
          <button
            style={styles.copyBtn}
            onClick={handleCopy}
            title="Copy new content"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div style={styles.diffBody}>
          {isTooLarge ? (
            <div style={styles.tooLarge}>
              <FileDiff size={24} color="#64748b" />
              <span>File too large for diff view</span>
              <button style={styles.copyBtn} onClick={handleCopy}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? 'Copied' : 'Copy new content'}</span>
              </button>
            </div>
          ) : (
            <table style={styles.table}>
              <colgroup>
                <col style={{ width: 48 }} />
                <col style={{ width: 48 }} />
                <col style={{ width: 20 }} />
                <col />
              </colgroup>
              <tbody>
                {displayEntries.map((entry, idx) => {
                  if (isCollapsed(entry)) {
                    return (
                      <tr key={`c-${idx}`}>
                        <td colSpan={4} style={styles.collapsedRow}>
                          &#8943; {entry.count} line{entry.count !== 1 ? 's' : ''} unchanged
                        </td>
                      </tr>
                    );
                  }

                  const line = entry as DiffLine;
                  return (
                    <tr key={`l-${idx}`} style={ROW_STYLES[line.type]}>
                      <td style={styles.lineNum}>
                        {line.oldLineNum ?? ''}
                      </td>
                      <td style={styles.lineNum}>
                        {line.newLineNum ?? ''}
                      </td>
                      <td
                        style={{
                          ...styles.prefix,
                          color: PREFIX_COLORS[line.type],
                        }}
                      >
                        {PREFIX_CHAR[line.type]}
                      </td>
                      <td
                        style={{
                          ...styles.content,
                          color: CONTENT_COLORS[line.type],
                        }}
                      >
                        {line.content}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
});

export default DiffView;
export { DiffView };
