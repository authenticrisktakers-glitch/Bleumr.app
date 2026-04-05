// ─── Code Bleu Types ─────────────────────────────────────────────────────────

export interface CodingPageProps { onClose: () => void; apiKey?: string; }

export interface CodingSession {
  id: string;
  name: string;
  projectName: string | null;
  messages: AgentMessage[];
  projectPath: string | null;
  projectContext: string;
  projectFiles: { path: string; name: string }[];
  timestamp: number;
}

export interface ProjectFile { name: string; path: string; content: string; }

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'activity' | 'subagent';
  content: string;
  activity?: 'reading' | 'writing' | 'analyzing' | 'thinking';
  files?: { path: string; content: string; action: 'read' | 'write' }[];
  codeBlocks?: { language: string; code: string; file?: string }[];
  streaming?: boolean;
  collapsed?: boolean;
  suggestions?: string[];
  images?: { name: string; dataUri: string }[];
  subAgent?: { name: string; status: 'running' | 'done' | 'error' };
  timestamp: number;
}
