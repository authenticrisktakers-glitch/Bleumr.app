import { AutomationLogger } from './AutomationLogger';
import { ElectronRPC } from './ElectronRPC';

export interface PluginConnectorSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
}

export interface PluginConnectorAction {
  name: string;
  description: string;
  schema: PluginConnectorSchema;
}

export interface PluginConnector {
  id: string;
  name: string;
  version: string;
  actions: PluginConnectorAction[];
  execute: (action: string, payload: any) => Promise<any>;
}

export class ConnectorFramework {
  private static plugins: Map<string, PluginConnector> = new Map();

  static register(plugin: PluginConnector) {
    this.plugins.set(plugin.id, plugin);
    AutomationLogger.log('INFO', 'PLUGIN_REGISTERED', { id: plugin.id, name: plugin.name });
  }

  static getPlugin(id: string): PluginConnector | undefined {
    return this.plugins.get(id);
  }

  static getAvailableActions(): Array<{pluginId: string, action: PluginConnectorAction}> {
    const available: Array<{pluginId: string, action: PluginConnectorAction}> = [];
    this.plugins.forEach((plugin, pluginId) => {
      plugin.actions.forEach(action => {
        available.push({ pluginId, action });
      });
    });
    return available;
  }

  static validatePayload(payload: any, schema: PluginConnectorSchema): boolean {
    if (!payload) return false;
    
    // Basic validation based on schema
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in payload)) {
          AutomationLogger.log('ERROR', 'PLUGIN_VALIDATION_FAILED', { missingField: req });
          return false;
        }
      }
    }
    return true;
  }

  static async runAction(pluginId: string, actionName: string, payload: any = {}): Promise<any> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }
    
    const actionDef = plugin.actions.find(a => a.name === actionName);
    if (!actionDef) {
      throw new Error(`Action ${actionName} not found on plugin ${pluginId}`);
    }

    if (!this.validatePayload(payload, actionDef.schema)) {
      throw new Error(`Invalid payload for action ${actionName}`);
    }
    
    AutomationLogger.log('INFO', 'EXECUTE_PLUGIN_ACTION', { pluginId, action: actionName });
    try {
      const result = await plugin.execute(actionName, payload);
      return result;
    } catch (error) {
      AutomationLogger.log('ERROR', 'PLUGIN_ACTION_FAILED', { pluginId, action: actionName, error });
      throw error;
    }
  }
}

// Default system plugin utilizing native Electron IPC with rich schema
ConnectorFramework.register({
  id: 'system-fs',
  name: 'System File Access',
  version: '1.0.0',
  actions: [
    {
      name: 'read_file',
      description: 'Read the contents of a file from the local file system',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    },
    {
      name: 'write_file',
      description: 'Write content to a file on the local file system',
      schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }
    },
    {
      name: 'list_dir',
      description: 'List the contents of a directory',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    }
  ],
  execute: async (action, payload) => {
    switch (action) {
      case 'read_file':
        return await ElectronRPC.call('readFile', payload.path);
      case 'write_file':
        return await ElectronRPC.call('writeFile', payload.path, payload.content);
      case 'list_dir':
        return await ElectronRPC.call('listDir', payload.path);
      default:
        throw new Error(`Unknown action: ${action} for system-fs plugin`);
    }
  }
});
