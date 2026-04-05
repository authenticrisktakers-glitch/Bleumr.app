export interface SubAgentResult {
  agentName: string;
  status: 'success' | 'error';
  summary: string;
  data?: any;
  filesRead?: { path: string; content: string }[];
  filesWritten?: { path: string; content: string }[];
  errors?: string[];
}

export interface SubAgentTask {
  id: string;
  agentName: string;
  description: string;
  status: 'queued' | 'running' | 'done' | 'error';
  result?: SubAgentResult;
}

export interface FileAccess {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<boolean>;
  listDir: (path: string) => string[];
  projectFiles: { path: string; name: string }[];
}
