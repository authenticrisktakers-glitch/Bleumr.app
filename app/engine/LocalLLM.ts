import { MLCEngine, InitProgressReport, CreateMLCEngine } from '@mlc-ai/web-llm';
import { AutomationLogger } from './AutomationLogger';
import { ElectronRPC } from './ElectronRPC';

export class LocalLLMEngine {
  private static engine: MLCEngine | null = null;
  private static isInitializing = false;
  private static onProgressCallbacks: ((report: InitProgressReport) => void)[] = [];

  // Tiny local model optimized for offline edge devices (requires no server)
  private static readonly MODEL_ID = "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC";
  // You could also use a Llama 3 8B, but it's heavier for the user's initial download:
  // "Llama-3-8B-Instruct-q4f32_1-MLC"

  static onProgress(cb: (report: InitProgressReport) => void) {
    this.onProgressCallbacks.push(cb);
  }

  static async initialize() {
    if (this.engine) return;
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      AutomationLogger.log('INFO', 'WEB_LLM_INIT_START', { model: this.MODEL_ID });
      
      this.engine = await CreateMLCEngine(this.MODEL_ID, {
        initProgressCallback: (progress: InitProgressReport) => {
          AutomationLogger.log('DEBUG', 'WEB_LLM_PROGRESS', progress);
          this.onProgressCallbacks.forEach(cb => cb(progress));
        }
      });
      
      AutomationLogger.log('INFO', 'WEB_LLM_READY', {});
    } catch (e) {
      AutomationLogger.log('ERROR', 'WEB_LLM_INIT_FAIL', { error: String(e) });
      this.engine = null;
    } finally {
      this.isInitializing = false;
    }
  }

  static async *streamChat(prompt: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    if (!this.engine) {
      await this.initialize();
      if (!this.engine) {
        // Fallback to local Electron IPC if WebGL/WebLLM fails in the renderer
        yield "[Fallback]: AI processing handed off to native Electron background.";
        const fallbackRes = await ElectronRPC.call('invokeModel', prompt);
        yield fallbackRes;
        return;
      }
    }

    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const chunks = await this.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of chunks) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) yield content;
      }
    } catch (e) {
      AutomationLogger.log('ERROR', 'WEB_LLM_GENERATION_ERROR', { error: String(e) });
      yield `\n[Error generating response: ${String(e)}]`;
    }
  }
}
