import { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SafetyCheckRequest } from '../engine/SafetyMiddleware';

export function JumariApprovalModal() {
  const [request, setRequest] = useState<SafetyCheckRequest | null>(null);
  const [callbacks, setCallbacks] = useState<{ approve: () => void, deny: () => void } | null>(null);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setRequest(e.detail.request);
      setCallbacks({
        approve: e.detail.approve,
        deny: e.detail.deny
      });
    };
    
    const timeoutHandler = () => {
      setRequest(null);
      setCallbacks(null);
    };

    window.addEventListener('jumari_require_approval' as any, handler);
    window.addEventListener('jumari_approval_timeout' as any, timeoutHandler);
    return () => {
      window.removeEventListener('jumari_require_approval' as any, handler);
      window.removeEventListener('jumari_approval_timeout' as any, timeoutHandler);
    };
  }, []);

  if (!request || !callbacks) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div 
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: -20 }}
          className="bg-black border border-red-900/50 shadow-2xl shadow-red-900/20 rounded-2xl w-full max-w-md overflow-hidden"
        >
          <div className="bg-red-950/30 p-6 border-b border-red-900/30 flex items-start gap-4">
            <div className="bg-red-500/20 p-3 rounded-full shrink-0">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-50">Action Requires Approval</h2>
              <p className="text-red-200/80 text-sm mt-1">
                JUMARI is attempting to perform a sensitive system action.
              </p>
            </div>
          </div>
          
          <div className="p-6">
            <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-gray-300 overflow-x-auto border border-gray-800">
              <div className="text-red-400 font-bold mb-2">ACTION: {request.actionType}</div>
              <pre>{JSON.stringify(request.context, null, 2)}</pre>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => {
                  callbacks.deny();
                  setRequest(null);
                }}
                className="flex-1 px-4 py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors border border-gray-700"
              >
                <X className="w-5 h-5" /> Deny Action
              </button>
              <button 
                onClick={() => {
                  callbacks.approve();
                  setRequest(null);
                }}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-5 h-5" /> Approve
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
