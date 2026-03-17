export * from './AutomationLogger';
export * from './CheckpointManager';
export * from './TaskRegistry';
export * from './SafetyMiddleware';
export * from './VerificationEngine';
export * from './SmartSelector';
export * from './ElectronRPC';
export * from './ConnectorFramework';
export * from './BackgroundTaskRunner';
export * from './LocalAgentStream';
export * from './LocalLLM';
export * from './DurableAgentRuntime';
export * from './AssistantChannel';
export * from './AgentWebSocket';
export * from './AssistantSSE';
export * from './ExtensionTransport';

import { BackgroundTaskRunner } from './BackgroundTaskRunner';

// Initialize background systems seamlessly on import
BackgroundTaskRunner.resumeRecoverableTasks();