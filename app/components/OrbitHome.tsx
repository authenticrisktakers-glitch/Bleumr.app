import React, { useMemo, useState } from 'react';
import { Bot, BookOpen, Wrench, Sparkles, Cpu, Shield, Zap, CheckCircle2, ChevronLeft, Terminal, Activity, FileCode, History, Settings, BrainCircuit, ToggleLeft, ToggleRight, Sliders } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function OrbitHome() {
  const [activeView, setActiveView] = useState<string>('home');
  
  // Settings State for Learning Mode
  const [learningMode, setLearningMode] = useState(() => {
    const saved = localStorage.getItem('orbit_learningMode');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [strictMode, setStrictMode] = useState(() => {
    const saved = localStorage.getItem('orbit_strictMode');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [retryThreshold, setRetryThreshold] = useState(() => {
    const saved = localStorage.getItem('orbit_retryThreshold');
    return saved !== null ? JSON.parse(saved) : 3;
  });

  React.useEffect(() => {
    localStorage.setItem('orbit_learningMode', JSON.stringify(learningMode));
    localStorage.setItem('orbit_strictMode', JSON.stringify(strictMode));
    localStorage.setItem('orbit_retryThreshold', JSON.stringify(retryThreshold));
  }, [learningMode, strictMode, retryThreshold]);

  // Generate 100 random stars
  const stars = useMemo(() => {
    return Array.from({ length: 100 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 2 + 1 + 'px',
      opacity: Math.random() * 0.5 + 0.3,
      animationDelay: `${Math.random() * 3}s`
    }));
  }, []);

  const renderContent = () => {
    if (activeView === 'settings') {
      return (
        <motion.div 
          key="settings"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="max-w-4xl mx-auto pt-8 relative z-10"
        >
          <button 
            onClick={() => setActiveView('home')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </button>

          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-rose-500/10 rounded-full border border-rose-500/20">
              <Settings className="w-8 h-8 text-rose-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Bot Engine Settings</h1>
              <p className="text-slate-400 font-light mt-1">Configure JUMARI 1.0 offline execution behaviors</p>
            </div>
          </div>

          <div className="space-y-8">
            {/* Adaptive Learning Section */}
            <div className="bg-[#111] border border-slate-800 rounded-2xl p-8 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 blur-[100px] rounded-full pointer-events-none" />
              
              <div className="flex items-start justify-between relative z-10">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-3">
                    <BrainCircuit className="w-6 h-6 text-rose-400" />
                    <h2 className="text-xl font-semibold text-white">Adaptive Learning Mode</h2>
                  </div>
                  <p className="text-slate-400 font-light leading-relaxed">
                    When enabled, the bot will pause execution when stuck and ask you for clarification via the chat UI instead of failing. It will memorize your correction for future runs.
                  </p>
                </div>
                <button 
                  onClick={() => setLearningMode(!learningMode)}
                  className="text-rose-400 hover:text-rose-300 transition-colors"
                >
                  {learningMode ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10 text-slate-600" />}
                </button>
              </div>

              <div className={`space-y-6 pt-6 border-t border-slate-800 transition-opacity duration-300 ${learningMode ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                {/* Fallback Threshold Slider */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-500" />
                      Failure Threshold Before Asking
                    </label>
                    <span className="text-rose-400 font-mono text-sm bg-rose-500/10 px-2 py-1 rounded">
                      {retryThreshold} Attempts
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="1" max="10" 
                    value={retryThreshold}
                    onChange={(e) => setRetryThreshold(parseInt(e.target.value))}
                    className="w-full accent-rose-500 bg-slate-800 rounded-lg appearance-none h-2 cursor-pointer"
                  />
                  <p className="text-xs text-slate-500 font-light">
                    The number of consecutive times the bot must fail to find an element or complete an action before triggering Learn Mode.
                  </p>
                </div>

                {/* Strict Mode Toggle */}
                <div className="flex items-start justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                  <div className="space-y-1 pr-6">
                    <h3 className="text-sm font-medium text-slate-200">Strict Mode (Anti-Lazy Feature)</h3>
                    <p className="text-xs text-slate-500 font-light leading-relaxed">
                      Forces the bot to attempt at least two alternate DOM traversal strategies (like keyword fuzzy-matching) before it is allowed to fallback to asking you.
                    </p>
                  </div>
                  <button 
                    onClick={() => setStrictMode(!strictMode)}
                    className="text-rose-400 hover:text-rose-300 transition-colors shrink-0 mt-1"
                  >
                    {strictMode ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                  </button>
                </div>
              </div>
            </div>
            
          </div>
        </motion.div>
      );
    }

    if (activeView === 'task-history') {
      return (
        <motion.div key="task-history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-4xl mx-auto pt-8 relative z-10">
          <button onClick={() => setActiveView('home')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group cursor-pointer">
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Home
          </button>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-indigo-500/10 rounded-full border border-indigo-500/20"><History className="w-8 h-8 text-indigo-400" /></div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Task History</h1>
              <p className="text-slate-400 font-light mt-1">Review recent autonomous actions by JUMARI 1.0</p>
            </div>
          </div>
          <div className="space-y-4">
            {[
              { task: "Extract product pricing from competitors", status: "Success", time: "2 mins ago", icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" /> },
              { task: "Log into internal dashboard", status: "Clarified", time: "1 hour ago", icon: <BrainCircuit className="w-5 h-5 text-amber-400" /> },
              { task: "Scrape daily news headlines", status: "Failed", time: "3 hours ago", icon: <Activity className="w-5 h-5 text-rose-400" /> },
              { task: "Automated form submission", status: "Success", time: "Yesterday", icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" /> },
            ].map((run, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-slate-800 rounded-lg">{run.icon}</div>
                  <div>
                    <h3 className="text-white font-medium">{run.task}</h3>
                    <p className="text-sm text-slate-500 font-light">Status: {run.status}</p>
                  </div>
                </div>
                <span className="text-sm text-slate-500 font-mono">{run.time}</span>
              </div>
            ))}
          </div>
        </motion.div>
      );
    }

    if (activeView === 'dom-inspector') {
      return (
        <motion.div key="dom-inspector" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-4xl mx-auto pt-8 relative z-10">
          <button onClick={() => setActiveView('home')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group cursor-pointer">
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Home
          </button>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20"><FileCode className="w-8 h-8 text-emerald-400" /></div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">DOM Inspector</h1>
              <p className="text-slate-400 font-light mt-1">Live view of elements currently seen by the bot</p>
            </div>
          </div>
          <div className="bg-[#111] border border-slate-800 rounded-2xl p-6 font-mono text-sm overflow-x-auto">
            <div className="text-slate-400">{'<!DOCTYPE html>'}</div>
            <div className="text-slate-300 ml-4">{'<html lang="en">'}</div>
            <div className="text-slate-300 ml-8">{'<body>'}</div>
            <div className="text-slate-300 ml-12 hover:bg-slate-800/50 p-1 rounded cursor-pointer transition-colors">{'<div id="app" class="relative">'}</div>
            <div className="text-slate-300 ml-16 hover:bg-slate-800/50 p-1 rounded cursor-pointer transition-colors border-l-2 border-emerald-500 pl-2">{'<header class="navbar">...</header>'} <span className="text-emerald-500 text-xs ml-2 uppercase tracking-wider">Target Acquired</span></div>
            <div className="text-slate-300 ml-16 hover:bg-slate-800/50 p-1 rounded cursor-pointer transition-colors">{'<main class="content">'}</div>
            <div className="text-slate-300 ml-20 hover:bg-slate-800/50 p-1 rounded cursor-pointer transition-colors">{'<button id="submit-btn">Submit</button>'}</div>
            <div className="text-slate-300 ml-16">{'</main>'}</div>
            <div className="text-slate-300 ml-12">{'</div>'}</div>
            <div className="text-slate-300 ml-8">{'</body>'}</div>
            <div className="text-slate-300 ml-4">{'</html>'}</div>
          </div>
        </motion.div>
      );
    }

    if (activeView === 'network-log') {
      return (
        <motion.div key="network-log" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-4xl mx-auto pt-8 relative z-10">
          <button onClick={() => setActiveView('home')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group cursor-pointer">
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Home
          </button>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-blue-500/10 rounded-full border border-blue-500/20"><Terminal className="w-8 h-8 text-blue-400" /></div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Network Log</h1>
              <p className="text-slate-400 font-light mt-1">Intercepted requests and offline analytics blocking</p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { method: "GET", url: "https://api.tracker.com/v1/collect", status: "BLOCKED", type: "Analytics" },
              { method: "POST", url: "http://localhost:3000/api/local/data", status: "200 OK", type: "Fetch" },
              { method: "GET", url: "https://analytics.google.com/...", status: "BLOCKED", type: "Tracker" },
              { method: "OPTIONS", url: "http://localhost:3000/api/local/auth", status: "204 No Content", type: "Preflight" },
            ].map((req, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800 rounded-lg font-mono text-sm">
                <div className="flex items-center gap-4">
                  <span className={`px-2 py-1 rounded font-bold text-xs ${req.status === 'BLOCKED' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {req.status}
                  </span>
                  <span className="text-blue-400 font-bold">{req.method}</span>
                  <span className="text-slate-300 truncate max-w-sm" title={req.url}>{req.url}</span>
                </div>
                <span className="text-slate-500">{req.type}</span>
              </div>
            ))}
          </div>
        </motion.div>
      );
    }

    if (['write-tasks', 'browser-feedback', 'mdm-security', 'mcp-plugins'].includes(activeView)) {
      const guides: Record<string, {title: string, content: string}> = {
        'write-tasks': {
          title: "Writing Effective Tasks",
          content: "JUMARI 1.0 operates best with explicit constraints. Always define the scope of the action. For example, instead of 'Click the button', use 'Click the submit button inside the login form'. Ensure semantic anchors are present in your queries."
        },
        'browser-feedback': {
          title: "Browser Feedback Loop",
          content: "The feedback loop allows JUMARI to continuously monitor the DOM mutations after taking an action. If a button click doesn't yield a network request or DOM change within 2000ms, the bot will automatically reassess its state."
        },
        'mdm-security': {
          title: "MDM Security Guidelines",
          content: "Bleumr runs completely locally, which means zero data leaves your network. However, when connecting to corporate MDM policies, ensure that Bleumr's local binary is allowlisted. All scraped data is saved to encrypted SQLite locally."
        },
        'mcp-plugins': {
          title: "Offline MCP Plugins",
          content: "You can extend Bleumr using the Model Context Protocol. Place your plugin binaries in the `~/.orbit/plugins` directory. The engine will auto-discover them on the next reboot, making new offline actions available."
        }
      };
      
      const guide = guides[activeView];
      
      return (
        <motion.div key="guide" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-4xl mx-auto pt-8 relative z-10">
          <button onClick={() => setActiveView('home')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group cursor-pointer">
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Home
          </button>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-amber-500/10 rounded-full border border-amber-500/20"><BookOpen className="w-8 h-8 text-amber-400" /></div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">{guide.title}</h1>
              <p className="text-slate-400 font-light mt-1">Bleumr Bot Guide</p>
            </div>
          </div>
          <div className="bg-[#111] border border-slate-800 rounded-2xl p-8">
            <p className="text-slate-300 leading-relaxed font-light text-lg">{guide.content}</p>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div 
        key="home"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="max-w-5xl mx-auto space-y-16 pt-4 relative z-10"
      >
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6 mb-20"
        >
          
          <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            Bleumr Browser
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto font-light">
            A privacy-first, fully local browser automation tool powered by offline AI bot brains.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          {/* Bot Brains Section - Containerless */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3">
              <Cpu className="w-7 h-7 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              <h2 className="text-2xl font-light text-white tracking-wide">Bot Brains <span className="font-semibold">(JUMARI 1.0)</span></h2>
            </div>
            <p className="text-base text-slate-400 leading-relaxed font-light">
              JUMARI 1.0 is a specialized offline AI agent designed for DOM interaction and task execution. It operates completely on your machine, ensuring zero data leakage.
            </p>
            <ul className="space-y-4 pt-2">
              {[
                "Local inference without cloud APIs",
                "Translates natural language to JavaScript",
                "Privacy-first execution environment",
                "Context-aware page understanding"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500/80 shrink-0 mt-0.5" />
                  <span className="font-light">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Capabilities Section - Containerless */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-7 h-7 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
              <h2 className="text-2xl font-semibold text-white tracking-wide">Capabilities</h2>
            </div>
            <p className="text-base text-slate-400 leading-relaxed font-light">
              Bleumr agents can autonomously navigate the web, fill forms, extract data, and execute complex multi-step routines.
            </p>
            <div className="grid grid-cols-2 gap-6 pt-2">
              {[
                { icon: <Sparkles className="w-5 h-5"/>, label: "Smart Navigation" },
                { icon: <Wrench className="w-5 h-5"/>, label: "DOM Injection" },
                { icon: <Shield className="w-5 h-5"/>, label: "Local Storage" },
                { icon: <Bot className="w-5 h-5"/>, label: "Form Automation" },
              ].map((cap, i) => (
                <div key={i} className="flex items-center gap-3 text-slate-300">
                  <div className="text-blue-400/80">{cap.icon}</div>
                  <span className="font-light">{cap.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Guides & Tools Section - Containerless */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-16 pt-8"
        >
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <BookOpen className="w-7 h-7 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
              <h2 className="text-2xl font-semibold text-white tracking-wide">Bot Guides</h2>
            </div>
            <p className="text-base text-slate-400 font-light">
              Learn how to get the most out of your local bot brains with these quick tutorials.
            </p>
            <div className="space-y-3">
              {[
                { label: "How to write effective tasks for JUMARI", id: "write-tasks" },
                { label: "Understanding the Browser Feedback Loop", id: "browser-feedback" },
                { label: "Managing MDM Security Settings", id: "mdm-security" },
                { label: "Connecting Offline MCP Plugins", id: "mcp-plugins" }
              ].map((guide, i) => (
                <button 
                  key={i} 
                  onClick={() => setActiveView(guide.id)}
                  className="w-full text-left py-2 hover:translate-x-2 transition-transform text-slate-300 flex items-center justify-between group cursor-pointer"
                >
                  <span className="font-light">{guide.label}</span>
                  <span className="text-slate-600 group-hover:text-amber-400 transition-colors">→</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Wrench className="w-7 h-7 text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.5)]" />
              <h2 className="text-2xl font-semibold text-white tracking-wide">Built-in Tools</h2>
            </div>
            <p className="text-base text-slate-400 font-light">
              Access built-in local development and inspection tools for managing your automated flows.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                { title: "Bot Engine Settings", desc: "Learning & Fallbacks", icon: <Settings className="w-5 h-5"/>, id: "settings" },
                { title: "Task History", desc: "View past executions", icon: <History className="w-5 h-5"/>, id: "task-history" },
                { title: "DOM Inspector", desc: "Analyze page elements", icon: <Activity className="w-5 h-5"/>, id: "dom-inspector" },
                { title: "Network Log", desc: "Offline requests", icon: <Terminal className="w-5 h-5"/>, id: "network-log" }
              ].map((tool, i) => (
                <button 
                  key={i} 
                  onClick={() => setActiveView(tool.id)}
                  className="text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-purple-400/70 group-hover:text-purple-400 transition-colors">
                      {tool.icon}
                    </div>
                    <h3 className="text-base font-medium text-white group-hover:text-purple-300 transition-colors">{tool.title}</h3>
                  </div>
                  <p className="text-sm text-slate-500 font-light group-hover:text-slate-400 transition-colors pl-7">{tool.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center pt-16 pb-8"
        >
          <p className="text-sm text-slate-600 font-light tracking-wider uppercase">
            Bleumr v1.0 • Running Locally • Fully Offline
          </p>
        </motion.div>
      </motion.div>
    );
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#030305] text-slate-300 font-sans">
      {/* 100 Immersive Stars Background */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#06060a] via-[#030305] to-[#010102] z-0" />
        {stars.map(star => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white z-10"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              boxShadow: `0 0 ${Math.random() * 4 + 2}px rgba(255,255,255,0.8)`,
              animation: `pulse ${Math.random() * 3 + 2}s infinite alternate ${star.animationDelay}`
            }}
          />
        ))}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0.2; }
          100% { transform: scale(1.2); opacity: 1; }
        }
      `}} />

      <div className="w-full h-full relative z-10 overflow-y-auto overflow-x-hidden p-8 md:p-12 lg:p-16">
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </div>
    </div>
  );
}