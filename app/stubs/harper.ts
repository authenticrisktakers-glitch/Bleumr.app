/**
 * Stub for harper.js in browser-preview builds.
 * The real harper.js ships ~2 MB of inlined WASM that crashes Vite's dev server.
 * The linter is non-critical — App.tsx already wraps setup in try/catch.
 */
export const binaryInlined = null

export class LocalLinter {
  constructor(_opts?: unknown) {}
  async setup() {}
  async lint(_text: string) { return [] }
  async isLikelyEnglish(_text: string) { return true }
}

export class WorkerLinter {
  constructor(_opts?: unknown) {}
  async setup() {}
  async lint(_text: string) { return [] }
  async isLikelyEnglish(_text: string) { return true }
}

export class Lint {}
export class Span {}
export class Suggestion {}
export enum SuggestionKind { Remove = 0, Replace = 1, InsertAfter = 2 }
