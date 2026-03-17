/**
 * Stub for @mlc-ai/web-llm in browser-preview / non-Electron builds.
 * The 6.5 MB WASM bundle can't be served by Vite's dev server.
 * In the real Electron app, LocalLLM.ts automatically falls back to
 * ElectronRPC when the engine fails to initialise, so this stub is safe.
 */
export class MLCEngine {}
export class InitProgressReport {}
export async function CreateMLCEngine(): Promise<MLCEngine> {
  return new MLCEngine()
}
