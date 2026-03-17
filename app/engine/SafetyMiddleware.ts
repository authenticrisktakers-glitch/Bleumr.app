import { AutomationLogger } from './AutomationLogger';

export type SensitiveAction = 'PURCHASE' | 'SEND_EMAIL' | 'POST_CONTENT' | 'DELETE_DATA' | 'MODIFY_DATA';

export interface SafetyCheckRequest {
  actionType: SensitiveAction | string;
  context: Record<string, any>;
}

export interface SafetyCheckResult {
  approved: boolean;
  reason?: 'USER_APPROVED' | 'USER_DENIED' | 'TIMEOUT' | 'AUTO_APPROVED';
}

export class SafetyMiddleware {
  // FIX: Removed NAVIGATE, CLICK, SCROLL — these are routine browser actions that
  // triggered an approval modal on every single interaction, making the app unusable.
  // Only keep actions that have irreversible real-world consequences.
  private static sensitiveActions = new Set<string>([
    'PURCHASE', 'SEND_EMAIL', 'POST_CONTENT', 'DELETE_DATA', 'MODIFY_DATA'
  ]);

  // When true, all actions are auto-approved without showing the modal.
  // WARNING: disables ALL safety checks. Set only by explicit user preference.
  static bypassAll: boolean = false;

  static requestApproval(request: SafetyCheckRequest): Promise<SafetyCheckResult> {
    return new Promise((resolve) => {
      // Global bypass — user opted in via Settings
      if (this.bypassAll) {
        AutomationLogger.log('WARN', 'ACTION_BYPASS_ALL', { actionType: request.actionType });
        return resolve({ approved: true, reason: 'AUTO_APPROVED' });
      }

      // If it's not a sensitive action, auto-approve immediately — no UI needed
      if (!this.sensitiveActions.has(request.actionType)) {
        AutomationLogger.log('DEBUG', 'ACTION_AUTO_APPROVED', { actionType: request.actionType });
        return resolve({ approved: true, reason: 'AUTO_APPROVED' });
      }

      AutomationLogger.log('WARN', 'SENSITIVE_ACTION_INTERCEPTED', { actionType: request.actionType });
      
      let isResolved = false;

      // In a real UI, this would trigger a system-level prompt or emit an event
      // that the UI listens to for rendering an approval dialog.
      // For this extension layer, we simulate a global event:
      const event = new CustomEvent('jumari_require_approval', { 
        detail: {
          request,
          approve: () => {
            if (isResolved) return;
            isResolved = true;
            AutomationLogger.log('INFO', 'ACTION_APPROVED_BY_USER', { actionType: request.actionType });
            resolve({ approved: true, reason: 'USER_APPROVED' });
          },
          deny: () => {
            if (isResolved) return;
            isResolved = true;
            AutomationLogger.log('INFO', 'ACTION_DENIED_BY_USER', { actionType: request.actionType });
            resolve({ approved: false, reason: 'USER_DENIED' });
          }
        }
      });
      window.dispatchEvent(event);
      
      // If no UI handles it within 10 seconds, auto-deny for safety
      setTimeout(() => {
        if (isResolved) return;
        isResolved = true;
        AutomationLogger.log('WARN', 'ACTION_DENIED_BY_TIMEOUT', { actionType: request.actionType });
        // Also fire an event so the UI can close the modal if it's open
        window.dispatchEvent(new CustomEvent('jumari_approval_timeout'));
        resolve({ approved: false, reason: 'TIMEOUT' });
      }, 10000);
    });
  }
}