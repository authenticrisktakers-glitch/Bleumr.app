import { AutomationLogger } from './AutomationLogger';
import { ElectronRPC } from './ElectronRPC';

/**
 * Standard IPC / Extension Transport bridging UI to background services.
 * In a real Electron setup, this routes through ElectronRPC or native window messaging.
 */
export class ExtensionTransport {
  private static portId = 0;
  private static handlers = new Map<string, Function>();

  static connect(name: string) {
    const id = `port_${++this.portId}`;
    AutomationLogger.log('INFO', 'EXT_PORT_CONNECTED', { port: id, name });

    // Setup window message listener for content-script equivalent communication
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        if (event.data?.source === 'jumari_background' && event.data?.target === name) {
          const handler = this.handlers.get(name);
          if (handler) handler(event.data.payload);
        }
      });
    }

    return {
      postMessage: (msg: any) => this.routeMessage(name, msg),
      onMessage: {
        addListener: (fn: Function) => this.handlers.set(name, fn),
        removeListener: () => this.handlers.delete(name)
      }
    };
  }

  private static routeMessage(source: string, msg: any) {
    AutomationLogger.log('DEBUG', 'EXT_RPC_ROUTE', { source, msg });
    
    // In production Electron, this delegates directly to the main process
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.invokeConnector('transport', 'route', { source, msg });
      return;
    }

    // Standard DOM messaging fallback
    if (typeof window !== 'undefined') {
       window.postMessage({ source: `jumari_${source}`, payload: msg }, '*');
    }
  }

  // Used by content scripts to invoke RPC methods in the background
  static async invokeRPC(method: string, params: any): Promise<any> {
    AutomationLogger.log('INFO', 'EXT_RPC_INVOKE', { method, params });
    
    // Defer to real Electron bridge
    return ElectronRPC.call('invokeConnector', 'rpc', method, params);
  }
}
