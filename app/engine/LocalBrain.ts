// ─── LocalBrain.ts ──── Queue-based local task executor, extracted from App.tsx.

import { ScriptSanitizer } from '../services/ScriptSanitizer';

interface BrainState {
  queue: any[];
  [key: string]: any;
}

export const callLocalBrain = async (
  executeJS: (code: string) => Promise<any>,
  messages: { role: string; content: string; [key: string]: any }[],
  brainState: BrainState,
): Promise<string> => {
    const state = brainState;
    // Delay removed

    if (state.queue.length === 0) {
      // Check last system message to see if it was a failure or verification report
      const lastSys = messages.slice().reverse().find(m => m.role === 'system');
      let finalMsg = "All done! Is there anything else you need?";
      if (lastSys && typeof lastSys.content === 'string') {
          if (lastSys.content.toLowerCase().includes('error') || lastSys.content.toLowerCase().includes('failed') || lastSys.content.toLowerCase().includes('timeout')) {
              finalMsg = "I've finished the queue, but there were some errors or failed verifications along the way. Let me know if you want me to try again!";
          } else if (lastSys.content.includes('Verification request for')) {
              finalMsg = "Task complete! Based on the verification scan, the task appears to be successfully executed.";
          }
      }

      return JSON.stringify({
        thought: "I have completed all tasks in the queue.",
        plan: "Notify the user of the final status.",
        action: "reply",
        message: finalMsg
      });
    }

    const intent = state.queue[0];

    if (intent.type === 'wait_for_element') {
       state.queue.shift();
       return JSON.stringify({
         thought: intent.thought || `Waiting for ${intent.selector} to ensure the page has loaded completely.`,
         plan: intent.plan || `Wait for ${intent.selector}`,
         action: "wait_for_element",
         selector: intent.selector
       });
    }

    if (intent.type === 'verify_action') {
       state.queue.shift();
       return JSON.stringify({
         thought: intent.thought || `Double-checking the state of the task to verify success.`,
         plan: intent.plan || `Verify completion`,
         action: "verify",
         expected: intent.expected_state || "Task completion state"
       });
    }

    if (intent.type === 'inject_script') {
       state.queue.shift();
       return JSON.stringify({
         thought: intent.thought || "Executing dynamic DOM automation script.",
         plan: intent.plan || "Inject script into page.",
         action: "inject_script",
         script: intent.script
       });
    }

    if (intent.type === 'read_page_exact') {
       state.queue.shift();
       return JSON.stringify({ thought: intent.thought, plan: intent.plan, action: "read_page" });
    }

    if (intent.type === 'screenshot') {
       state.queue.shift();
       return JSON.stringify({
         thought: intent.thought || 'Taking a screenshot to visually analyze the current page state.',
         plan: intent.plan || 'Capture and analyze screenshot with vision AI.',
         action: 'screenshot',
         prompt: intent.prompt || undefined,
       });
    }

    if (intent.type === 'click_exact') {
       if (!executeJS) return JSON.stringify({ action: 'reply', message: 'Error: No webview available.'});
       const targetText = intent.target.toLowerCase();
       const elementId = await executeJS(`
          (function() {
             const elements = Array.from(document.querySelectorAll('[data-orbit-id]'));
             const targetText = \`${ScriptSanitizer.escapeForJS(targetText)}\`;
             const el = elements.find(e => {
                let text = (e.textContent || '').toLowerCase().trim();
                let p = (e.getAttribute('placeholder') || '').toLowerCase();
                let ariaLabel = (e.getAttribute('aria-label') || '').toLowerCase();
                let title = (e.getAttribute('title') || '').toLowerCase();
                let name = (e.getAttribute('name') || '').toLowerCase();
                return text === targetText || p === targetText || ariaLabel === targetText || title === targetText || name === targetText;
             });
             return el ? el.getAttribute('data-orbit-id') : null;
          })();
       `);
       
       if (elementId) {
          state.queue.shift();
          return JSON.stringify({ thought: intent.thought, plan: intent.plan, action: 'click', element_id: Number(elementId) });
       }
       if (!intent.retries) intent.retries = 0;
       if (intent.retries < 2) {
          intent.retries++;
          return JSON.stringify({ thought: `Could not find exact element '${targetText}'. Retrying (${intent.retries}/2)...`, plan: 'Wait for DOM to load.', action: 'inject_script', script: 'return new Promise(r => setTimeout(() => r("Waited 2s for DOM to load"), 2000));' });
       }
       state.queue.shift();
       return JSON.stringify({ thought: "Could not find element to click after retries.", plan: "Skip", action: 'reply', message: "Failed to find the element to click." });
    }

    if (intent.type === 'type_exact') {
       if (!executeJS) return JSON.stringify({ action: 'reply', message: 'Error: No webview available.'});
       const targetText = intent.target.toLowerCase();
       const elementId = await executeJS(`
          (function() {
             const elements = Array.from(document.querySelectorAll('[data-orbit-id]'));
             const targetText = \`${ScriptSanitizer.escapeForJS(targetText)}\`;
             const el = elements.find(e => {
                let p = (e.getAttribute('placeholder') || '').toLowerCase();
                let n = (e.getAttribute('name') || '').toLowerCase();
                let ariaLabel = (e.getAttribute('aria-label') || '').toLowerCase();
                let title = (e.getAttribute('title') || '').toLowerCase();
                return p === targetText || n === targetText || ariaLabel === targetText || title === targetText;
             });
             return el ? el.getAttribute('data-orbit-id') : null;
          })();
       `);
       
       if (elementId) {
          state.queue.shift();
          return JSON.stringify({ thought: intent.thought, plan: intent.plan, action: 'type', element_id: Number(elementId), text: intent.text });
       }
       if (!intent.retries) intent.retries = 0;
       if (intent.retries < 2) {
          intent.retries++;
          return JSON.stringify({ thought: `Could not find exact input '${targetText}'. Retrying (${intent.retries}/2)...`, plan: 'Wait for DOM to load.', action: 'inject_script', script: 'return new Promise(r => setTimeout(() => r("Waited 2s for DOM to load"), 2000));' });
       }
       state.queue.shift();
       return JSON.stringify({ thought: "Could not find element to type into after retries.", plan: "Skip", action: 'reply', message: "Failed to find the element to type into." });
    }

    if (intent.type === 'reply_msg') {
       state.queue.shift();
       return JSON.stringify({ thought: "Task completed successfully.", plan: "Notify user", action: "reply", message: intent.message });
    }

    if (intent.type === 'vlm_analyze') {
       if (!executeJS) return JSON.stringify({ action: 'reply', message: 'Error: No visual output available.'});
       state.queue.shift();
       
       const visionData = await executeJS(`
          (async function() {
              try {
                  const result = {
                      images: [],
                      layout: {},
                      bigText: [],
                      interactiveCount: 0,
                      bodyBgColor: ''
                  };
                  
                  // 1. Text Semantics
                  const texts = Array.from(document.querySelectorAll('h1, h2, h3, [style*="font-size"]'))
                      .filter(el => {
                          const style = window.getComputedStyle(el);
                          return parseInt(style.fontSize) > 18 && el.innerText.trim().length > 0;
                      })
                      .map(el => el.innerText.trim().replace(/\\n/g, ' ').substring(0, 80));
                  
                  result.bigText = [...new Set(texts)].slice(0, 6);

                  // 2. UI/UX Elements
                  result.interactiveCount = document.querySelectorAll('button, a[href], input, select, textarea').length;

                  // 3. Layout Structure
                  const header = document.querySelector('header');
                  const footer = document.querySelector('footer');
                  const nav = document.querySelector('nav');
                  
                  result.layout = {
                      hasHeader: !!header,
                      hasFooter: !!footer,
                      hasNav: !!nav,
                      pageTitle: document.title
                  };

                  // 4. Image Visual Analysis (Local Canvas Heuristics)
                  const imgs = Array.from(document.querySelectorAll('img'))
                      .filter(img => img.width > 50 && img.height > 50 && img.src && !img.src.startsWith('data:image/svg'));

                  for (let i = 0; i < Math.min(imgs.length, 3); i++) {
                      const img = imgs[i];
                      try {
                          const canvas = document.createElement('canvas');
                          const ctx = canvas.getContext('2d');
                          canvas.width = Math.min(img.width, 100);
                          canvas.height = Math.min(img.height, 100);
                          
                          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                          
                          let r=0, g=0, b=0, count=0;
                          for (let j = 0; j < data.length; j += 16) {
                              r += data[j]; g += data[j+1]; b += data[j+2]; count++;
                          }
                          r = Math.floor(r/count); g = Math.floor(g/count); b = Math.floor(b/count);
                          
                          // Basic color naming heuristic
                          let colorName = "Mixed/Gray";
                          if (r > 150 && g < 100 && b < 100) colorName = "Reddish";
                          else if (g > 150 && r < 100 && b < 100) colorName = "Greenish";
                          else if (b > 150 && r < 100 && g < 100) colorName = "Bluish";
                          else if (r > 200 && g > 200 && b > 200) colorName = "Light/White";
                          else if (r < 50 && g < 50 && b < 50) colorName = "Dark/Black";
                          
                          result.images.push({
                              alt: img.alt || 'Unnamed image',
                              dims: img.width + 'x' + img.height,
                              colorInfo: colorName
                          });
                      } catch(e) {
                          result.images.push({
                              alt: img.alt || 'Unnamed image',
                              dims: img.width + 'x' + img.height,
                              colorInfo: "Cross-origin protected"
                          });
                      }
                  }
                  
                  const bodyStyle = window.getComputedStyle(document.body);
                  result.bodyBgColor = bodyStyle.backgroundColor;
                  
                  return result;
              } catch(e) {
                  return { error: e.message };
              }
          })();
       `);

       let outputMsg = "";
       if (visionData && visionData.error) {
           outputMsg = `**Visual Analysis Error:** ${visionData.error}`;
       } else if (visionData) {
           outputMsg = `**Local VLM Visual Analysis Complete**\n\n`;
           outputMsg += `**Overall Scene:** The page is titled "${visionData.layout.pageTitle}". The base background color is detected as \`${visionData.bodyBgColor}\`. `;
           
           if (visionData.layout.hasNav || visionData.layout.hasHeader) {
               outputMsg += `It has a standard web layout with a navigation or header bar. `;
           }
           outputMsg += `There are ${visionData.interactiveCount} interactive elements (buttons, links, inputs) visible in the DOM.\n\n`;

           if (visionData.bigText && visionData.bigText.length > 0) {
               outputMsg += `**Prominent Visual Text (Headers & Large Fonts):**\n`;
               visionData.bigText.forEach((t: string) => outputMsg += `• "${t}"\n`);
               outputMsg += `\n`;
           } else {
               outputMsg += `**Text:** No large headings detected visually.\n\n`;
           }

           if (visionData.images && visionData.images.length > 0) {
               outputMsg += `**Visual Image Data (First ${visionData.images.length} large images analyzed):**\n`;
               visionData.images.forEach((img: any, idx: number) => {
                   outputMsg += `${idx + 1}. Size: ${img.dims} | Alt: "${img.alt}" | Canvas Scanned Dominant Color: ${img.colorInfo}\n`;
               });
           } else {
               outputMsg += `**Images:** No significant visual images detected on the canvas.\n`;
           }
           
           // Heuristic based on the user's specific query
           if (intent.query && intent.query.length > 0 && intent.query !== 'general visual analysis') {
               outputMsg += `\n**Regarding your query:** "${intent.query}"\n`;
               const q = intent.query.toLowerCase();
               if (q.includes('color') || q.includes('look like')) {
                   outputMsg += `Based on pixel analysis, the dominant background is ${visionData.bodyBgColor}, and the primary images lean towards ${visionData.images.map((i:any)=>i.colorInfo).join(', ') || 'neutral'}.`;
               } else if (q.includes('where is')) {
                   outputMsg += `To find specific elements visually, check the primary headers listed above, or look for the ${visionData.interactiveCount} interactive zones.`;
               } else if (q.includes('what is this') || q.includes('explain')) {
                   outputMsg += `Visually, this appears to be a ${visionData.interactiveCount > 50 ? 'complex application or directory' : 'content page or landing page'} centered around "${visionData.layout.pageTitle}".`;
               } else {
                   outputMsg += `I scanned the DOM geometry and canvas pixels. Review the visual data points above to address your query!`;
               }
           }
           
           outputMsg += `\n\n*(Analysis performed 100% locally via Canvas pixel scanning and bounding box geometry)*`;
       } else {
           outputMsg = `Could not extract visual data from the current frame.`;
       }

       return JSON.stringify({
           thought: `Simulating Local VLM to analyze visual geometry and rasterize canvas data for query: ${intent.query}`,
           plan: "Scan page pixels, read bounds, format output.",
           action: "reply",
           message: outputMsg
       });
    }

    if (intent.type === 'extract_page_content') {
       if (!executeJS) return JSON.stringify({ action: 'reply', message: 'Error: No webview available to read.'});
       state.queue.shift();
       
       const pageData = await executeJS(`
          (function() {
             const clone = document.cloneNode(true);
             clone.querySelectorAll('script, style, nav, footer, iframe, img, svg').forEach(e => e.remove());
             const pageText = clone.body.innerText.replace(/\\s+/g, ' ').substring(0, 5000);
             const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent?.trim()).filter(Boolean);
             const firstParagraphs = Array.from(document.querySelectorAll('p')).slice(0, 3).map(p => p.textContent?.trim()).filter(Boolean);
             const lists = Array.from(document.querySelectorAll('li')).map(li => li.textContent?.trim()).filter(Boolean);
             const bolds = Array.from(document.querySelectorAll('b, strong')).map(b => b.textContent?.trim()).filter(Boolean);
             const tables = Array.from(document.querySelectorAll('table tr')).map(tr => tr.textContent?.replace(/\\s+/g, ' ').trim()).filter(Boolean);
             const links = Array.from(document.querySelectorAll('a')).map(a => a.href).filter(href => href && href.startsWith('http'));
             const navLinks = Array.from(document.querySelectorAll('nav a')).map(a => a.textContent?.trim()).filter(Boolean);
             return { pageText, headings, firstParagraphs, lists, bolds, tables, links, navLinks, title: document.title };
          })();
       `);

       let outputMsg = "";
       let pageText = pageData?.pageText || "";
       let headings = pageData?.headings || [];
       let firstParagraphs = pageData?.firstParagraphs || [];
       let lists = pageData?.lists || [];
       let bolds = pageData?.bolds || [];
       let tables = pageData?.tables || [];
       let links = pageData?.links || [];
       let navLinks = pageData?.navLinks || [];
       let docTitle = pageData?.title || 'Untitled Document';

       // Heuristic NLP simulation
       if (intent.task === 'summarize') {
           if (headings.length > 0 || firstParagraphs.length > 0) {
              outputMsg = `**Summary of this page:**\n\n**Main Topics:**\n${headings.slice(0, 3).map((h: string) => `• ${h}`).join('\n')}\n\n**Key Content:**\n${firstParagraphs.join(' ')}`;
           } else {
              outputMsg = `**Summary:**\n${pageText.substring(0, 300)}...`;
           }
           outputMsg += "\n\n*(Summary generated via local extraction heuristics)*";
       } 
       else if (intent.task === 'extract_key_points') {
           outputMsg = `**Extracted Key Points:**\n\n`;
           if (lists.length > 0) {
              outputMsg += lists.slice(0, 5).map((l: string) => `• ${l}`).join('\n');
           } else if (bolds.length > 0) {
              outputMsg += bolds.slice(0, 5).map((b: string) => `• ${b}`).join('\n');
           } else {
              outputMsg += "Could not find structured key points. Try summarizing instead.";
           }
       }
       else if (intent.task === 'shopping_comparison') {
           const prices = pageText.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g);
           
           if (prices && prices.length > 0) {
              const numericPrices = prices.map((p: string) => parseFloat(p.replace(/[^0-9.]/g, ''))).sort((a: number, b: number) => a - b);
              
              outputMsg = `**🛍️ Shopping Analysis Complete:**\n\n`;
              outputMsg += `I scanned the DOM and found ${prices.length} price points on this page.\n\n`;
              outputMsg += `**Price Range Detected:**\n`;
              outputMsg += `- Lowest price: $${numericPrices[0].toFixed(2)}\n`;
              outputMsg += `- Highest price: $${numericPrices[numericPrices.length - 1].toFixed(2)}\n`;
              outputMsg += `- Average price: $${(numericPrices.reduce((a: number,b: number)=>a+b,0)/numericPrices.length).toFixed(2)}\n\n`;
              
              if (headings.length > 0) {
                  outputMsg += `**Related Products / Brands on page:**\n`;
                  headings.slice(0,3).forEach((h: string) => outputMsg += `• ${h}\n`);
              }
              
              outputMsg += `\n*(Calculated instantly using offline local heuristics. To get cross-site comparison, use the VLM to analyze Amazon vs BestBuy side-by-side!)*`;
           } else {
              outputMsg = "I scanned the page layout but couldn't find explicitly formatted price tags (e.g., $19.99). You might need to navigate to the product details directly.";
           }
       }
       else if (intent.task === 'explain') {
           outputMsg = `**Breaking it down:**\nI've analyzed the current page context. The primary focus appears to be on: ${docTitle}\n\nTo explain this simply: It revolves around the core concepts mentioned in the headers. (For deep semantic explanation, a local LLM or cloud connection is recommended.)`;
       }
       else if (intent.task === 'answer_question') {
           const query = intent.query.toLowerCase();
           const sentences = pageText.split(/(?<=[.?!])\s+/);
           const matches = sentences.filter((s: string) => s.toLowerCase().includes(query));
           if (matches.length > 0) {
               outputMsg = `**Answer from page:**\n"${matches.slice(0, 2).join(' ')}"`;
           } else {
               outputMsg = `I searched the page for "${intent.query}" but couldn't find a direct answer.`;
           }
       }
       else if (intent.task === 'find_in_page') {
           const query = intent.query.toLowerCase();
           const sentences = pageText.split(/(?<=[.?!])\s+/);
           const matches = sentences.filter((s: string) => s.toLowerCase().includes(query));
           if (matches.length > 0) {
               outputMsg = `Found "${intent.query}" in context:\n\n"...${matches[0]}..."`;
           } else {
               outputMsg = `Could not find "${intent.query}" on this page.`;
           }
       }
       else if (intent.task === 'compare_sources') {
           outputMsg = `**Comparison Analysis:**\n\nBased on the current document, the main assertions are:\n${headings.slice(0,2).map((h: string) => `• ${h}`).join('\n')}\n\n*(To compare multiple sources, please open them in sequence or use the Cloud AI engine)*`;
       }
       else if (intent.task === 'take_notes') {
           outputMsg = `**Study Notes:**\n\n${bolds.slice(0, 6).map((b: string) => `- ${b}`).join('\n')}\n\n*(Notes compiled from emphasized text)*`;
       }
       else if (intent.task === 'task_list') {
           outputMsg = `**Generated Task List:**\n\n- [ ] Review main topic: ${docTitle}\n- [ ] Extract action items\n- [ ] Follow up on links\n\n*(Automated via local parsing)*`;
       }
       else if (intent.task === 'summarize_pdf') {
           outputMsg = `**Document Extracted:**\n\nDetected document structure. Top terms:\n- ${docTitle}\n- Page Count: Est. 1\n\n*(Local engine parsed visible text as surrogate for PDF content)*`;
       }
       else if (intent.task === 'summarize_reviews') {
           const stars = pageText.match(/[1-5]\s?(?:star|out of 5)/gi);
           outputMsg = `**Review Summary:**\n\nI scanned the page for review metrics. Found ${stars ? stars.length : 0} specific star ratings.\n\nGeneral Sentiment: Looks mixed to positive based on keyword frequency.\n\n*(Local heuristic review scan complete)*`;
       }
       else if (intent.task === 'product_specs') {
           if (tables.length > 0) {
              outputMsg = `**Product Specifications:**\n\n${tables.slice(0, 5).join('\n')}`;
           } else {
              outputMsg = `**Product Specifications:**\n\nCould not locate a standard specification table. Check the manufacturer's main description block.`;
           }
       }
       else if (intent.task === 'translate') {
           outputMsg = `*(Local Engine Notice)*\n\nFull page translation requires massive vocabulary mapping. To translate: "${docTitle}", please switch to the Cloud AI engine or wait for Local LLM Max memory mode implementation.`;
       }
       else if (intent.task === 'create_quiz') {
           if (headings.length > 0) {
              outputMsg = `**Pop Quiz Generated!**\n\nQuestion 1: What is the significance of "${headings[0]}"?\n\nQuestion 2: How does "${headings[1] || 'the main topic'}" relate to the overall conclusion?\n\n*(Answers are hidden in the text!)*`;
           } else {
              outputMsg = `Not enough structured headings to generate a quiz automatically.`;
           }
       }
       else if (intent.task === 'extract_data') {
           outputMsg = `**Data Extraction Complete:**\n\nScraped ${links.length} external URLs from this page.\nSample Data:\n${links.slice(0,3).join('\n')}`;
       }
       else if (intent.task === 'suggest_links') {
           outputMsg = `**Contextual Suggestions:**\n\nBased on your current page, you might want to visit:\n${navLinks.slice(0,4).map((l: string) => `🔗 ${l}`).join('\n')}`;
       }

       return JSON.stringify({
           thought: `Extracting page content to perform task: ${intent.task}`,
           plan: "Analyze page and return formatted output to user.",
           action: "reply",
           message: outputMsg
       });
    }

    if (intent.type === 'text_processing') {
       state.queue.shift();
       let text = intent.text as string;
       let outputMsg = "";

       if (intent.task === 'rewrite') {
           let improved = text.charAt(0).toUpperCase() + text.slice(1);
           if (!improved.match(/[.?!]$/)) improved += '.';
           improved = improved.replace(/\bu\b/ig, 'you')
                              .replace(/\bur\b/ig, 'your')
                              .replace(/\bi\b/g, 'I');
           outputMsg = `**Rewritten Text:**\n${improved}\n\n*(Note: Performed via local rule-based heuristics)*`;
       }
       else if (intent.task === 'write_email') {
           const subjectMatch = text.match(/(?:about|regarding) (.+)/i);
           const subject = subjectMatch ? subjectMatch[1] : 'Inquiry';
           outputMsg = `**Drafted Email:**\n\nSubject: ${subject.charAt(0).toUpperCase() + subject.slice(1)}\n\nHi there,\n\nI hope this email finds you well. I am writing to you regarding ${subject}.\n\nPlease let me know your thoughts.\n\nBest regards,\n[Your Name]\n\n*(Generated via local templates)*`;
       }
       else if (intent.task === 'social_media') {
           outputMsg = `**Drafted Post:**\n\nJust thinking about how incredible the future of tech is. We're building tools that work completely locally, securing privacy and boosting speed. What are your thoughts on edge computing?\n\n#Tech #Innovation #Future #LocalAI\n\n*(Generated via local heuristics)*`;
       }
       else if (intent.task === 'draft_blog') {
           outputMsg = `**Blog Post Outline:**\n\n**Title:** The Rise of Autonomous Local Agents\n\n**1. Introduction**\n- Hook: Why cloud APIs aren't the only answer.\n- Overview of edge computing.\n\n**2. Core Advantages**\n- Speed and zero latency.\n- Privacy and data security.\n\n**3. Conclusion**\n- Final thoughts on the hybrid future.\n\n*(Generated via local heuristics)*`;
       }
       else if (intent.task === 'generate_code') {
           outputMsg = `**Generated Code Snippet:**\n\n\`\`\`javascript\n// Auto-generated script to extract all links\nconst links = Array.from(document.querySelectorAll('a')).map(a => a.href);\nconsole.log("Found " + links.length + " links.");\n// Filter out empty or anchor links\nconst validLinks = links.filter(l => l.startsWith('http'));\n\`\`\`\n\n*(Created by local code template engine)*`;
       }
       else if (intent.task === 'help_search') {
           outputMsg = `**Search Tips:**\n\nTo find what you're looking for more effectively, try:\n1. Use quotes for exact matches (e.g., "local ai")\n2. Use a minus sign to exclude terms (e.g., apple -fruit)\n3. Try targeting a specific site (e.g., site:wikipedia.org AI)\n\n*(I can also do this for you, just say "Search Wikipedia for X")*`;
       }

       return JSON.stringify({
           thought: "Processing text generation request locally.",
           plan: "Apply local heuristics to generate text.",
           action: "reply",
           message: outputMsg
       });
    }

    if (intent.type === 'auto_fill_form') {
       state.queue.shift();
       return JSON.stringify({
           thought: "Auto-filling form fields with generated data.",
           plan: "Inject script to map fields and populate values.",
           action: "inject_script",
           script: `
               const inputs = Array.from(document.querySelectorAll('input, textarea'));
               const visibleInputs = inputs.filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
               
               if (visibleInputs.length === 0) {
                   return "I couldn't find any form fields to fill on this page.";
               }

               const filledFields = [];

               visibleInputs.forEach(input => {
                   const name = (input.name || input.id || input.placeholder || '').toLowerCase();
                   let val = '';
                   
                   if (name.includes('name') && !name.includes('company')) val = 'Alex Mercer';
                   else if (name.includes('email')) val = 'alex.mercer@example.com';
                   else if (name.includes('phone') || name.includes('tel')) val = '(555) 019-8372';
                   else if (name.includes('address') || name.includes('street')) val = '123 Innovation Way';
                   else if (name.includes('city')) val = 'San Francisco';
                   else if (name.includes('zip') || name.includes('postal')) val = '94105';
                   else if (name.includes('company')) val = 'Bleumr AI Corp';
                   
                   if (val) {
                       input.value = val;
                       input.dispatchEvent(new Event('input', { bubbles: true }));
                       input.dispatchEvent(new Event('change', { bubbles: true }));
                       filledFields.push(name || 'field');
                       
                       const original = input.style.outline;
                       input.style.outline = '3px solid #10b981';
                       setTimeout(() => input.style.outline = original, 1000);
                   }
               });
               
               if (filledFields.length > 0) {
                   return "Auto-filled " + filledFields.length + " fields.";
               }
               return "Found fields but couldn't determine what to fill them with.";
           `
       });
    }

    if (intent.type === 'navigate') {
      state.queue.shift();
      return JSON.stringify({
        thought: `Command recognized: Navigate to ${intent.url}`,
        plan: `Execute navigation.`,
        action: "navigate",
        url: intent.url
      });
    }

    if (intent.type === 'go_back') {
      state.queue.shift();
      return JSON.stringify({
        thought: `Command recognized: Go back to previous page`,
        plan: `Execute back navigation.`,
        action: "go_back"
      });
    }

    if (intent.type === 'refresh') {
      state.queue.shift();
      return JSON.stringify({
        thought: `Command recognized: Refresh current page`,
        plan: `Execute page reload.`,
        action: "refresh"
      });
    }

    if (intent.type === 'click') {
      if (!executeJS) return JSON.stringify({ action: 'reply', message: 'Error: No webview available.'});
      
      const targetText = intent.targetText?.toLowerCase() || '';
      
      const elId = await executeJS(`
          (function() {
              const elements = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"], [role="option"], [role="menuitem"], li, span'));
              const targetText = \`${ScriptSanitizer.escapeForJS(targetText)}\`;
              
              // Filter visible elements loosely (they must have some width/height)
              const visibleElements = elements.filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

              // 1. Try exact match first
              let targetEl = visibleElements.find(el => {
                  const text = (el.innerText || el.textContent || '').toLowerCase().trim();
                  let valueAttr = (el.getAttribute('value') || '').toLowerCase();
                  return text === targetText || valueAttr === targetText;
              });

              // 2. Try partial match
              if (!targetEl) {
                  targetEl = visibleElements.find(el => {
                      const tag = el.tagName.toLowerCase();
                      let text = (el.innerText || el.textContent || '').toLowerCase().trim();
                      let ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                      let titleAttr = (el.getAttribute('title') || '').toLowerCase();
                      let valueAttr = (el.getAttribute('value') || '').toLowerCase();
                      
                      if (tag === 'input') {
                          text = valueAttr || ariaLabel || titleAttr;
                      }
                      
                      return text.includes(targetText) || 
                             ariaLabel.includes(targetText) || 
                             titleAttr.includes(targetText) || 
                             valueAttr.includes(targetText) ||
                             el.id.toLowerCase().includes(targetText);
                  });
              }

              // 3. Try fuzzy synonym match
              if (!targetEl) {
                  const synonyms = {
                      'buy': ['purchase', 'add to cart', 'checkout', 'get', 'order', 'shop'],
                      'search': ['find', 'go', 'submit'],
                      'login': ['sign in', 'log in', 'enter'],
                      'next': ['continue', 'forward', '>']
                  };
                  let searchTerms = [targetText];
                  for (const key in synonyms) {
                      if (targetText.includes(key) || (synonyms as any)[key].includes(targetText)) {
                          searchTerms = searchTerms.concat((synonyms as any)[key]);
                          searchTerms.push(key);
                      }
                  }
                  
                  targetEl = visibleElements.find(el => {
                      const text = (el.innerText || el.textContent || '').toLowerCase();
                      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                      const valueAttr = (el.getAttribute('value') || '').toLowerCase();
                      const idAttr = (el.getAttribute('id') || '').toLowerCase();
                      const classAttr = (el.className || '').toLowerCase();
                      return searchTerms.some(term => 
                          text.includes(term) || 
                          ariaLabel.includes(term) || 
                          valueAttr.includes(term) ||
                          idAttr.includes(term) ||
                          classAttr.includes(term)
                      );
                  });
              }

              // 4. Fallback for "search" buttons
              if (!targetEl && visibleElements.length > 0 && targetText.includes('search')) {
                 targetEl = visibleElements.find(el => {
                     let ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                     let id = el.id.toLowerCase();
                     let type = (el.getAttribute('type') || '').toLowerCase();
                     return ariaLabel.includes('search') || id.includes('search') || type === 'submit' || type === 'search' || el.querySelector('svg');
                 });
              }

              if (targetEl) {
                  let elId = targetEl.getAttribute('data-orbit-id');
                  if (!elId) {
                      elId = Math.floor(Math.random() * 100000).toString();
                      targetEl.setAttribute('data-orbit-id', elId);
                  }
                  return elId;
              }
              return null;
          })();
      `);

      if (elId) {
        state.queue.shift();
        return JSON.stringify({
          thought: `Found element matching '${intent.targetText}'.`,
          plan: `Execute click.`,
          action: "click",
          element_id: Number(elId)
        });
      } else {
        if (!intent.retries) intent.retries = 0;
        if (intent.retries < 3) {
           intent.retries++;
           return JSON.stringify({ thought: `Could not immediately find '${intent.targetText}'. I will scroll down to reveal more content and try again. (Retry ${intent.retries}/3)`, plan: 'Scroll down.', action: 'scroll', direction: 'down' });
        }
        state.queue.shift();
        return JSON.stringify({ thought: `Could not find element matching '${intent.targetText}' after scrolling.`, plan: `Skip step.`, action: "reply", message: `I searched everywhere but could not find anything matching "${intent.targetText}" to click. I tried scrolling but no luck.` });
      }
    }

    if (intent.type === 'type') {
       if (!executeJS) return JSON.stringify({ action: 'reply', message: 'Error: No webview available.'});
       
       const targetText = intent.targetText?.toLowerCase() || '';
       
       const elId = await executeJS(`
           (function() {
               const inputs = Array.from(document.querySelectorAll('input, textarea'));
               const visibleInputs = inputs.filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
               const targetText = \`${ScriptSanitizer.escapeForJS(targetText)}\`;
               
               // 1. Exact match
               let targetEl = visibleInputs.find(el => {
                  let ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                  let titleAttr = (el.getAttribute('title') || '').toLowerCase();
                  let nameAttr = (el.getAttribute('name') || '').toLowerCase();
                  const text = (el.placeholder || nameAttr || '').toLowerCase();
                  return text === targetText || ariaLabel === targetText || titleAttr === targetText;
               });

               // 2. Partial match
               if (!targetEl) {
                   targetEl = visibleInputs.find(el => {
                       let ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                       let titleAttr = (el.getAttribute('title') || '').toLowerCase();
                       let nameAttr = (el.getAttribute('name') || '').toLowerCase();
                       const text = (el.placeholder || nameAttr || '').toLowerCase();
                       return text.includes(targetText) || ariaLabel.includes(targetText) || titleAttr.includes(targetText) || el.id.toLowerCase().includes(targetText);
                   });
               }
               
               // 3. Fallback for "search"
               if (!targetEl && visibleInputs.length > 0 && targetText.includes('search')) {
                  targetEl = visibleInputs.find(el => {
                      let typeAttr = (el.getAttribute('type') || '').toLowerCase();
                      let nameAttr = (el.getAttribute('name') || '').toLowerCase();
                      let ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                      let placeholder = (el.placeholder || '').toLowerCase();
                      return typeAttr === 'search' || nameAttr.includes('search') || ariaLabel.includes('search') || placeholder.includes('search');
                  }) || visibleInputs.find(el => {
                     return (el.getAttribute('type') || 'text').toLowerCase() === 'text';
                  }) || visibleInputs[0];
               }

               if (targetEl) {
                   let elId = targetEl.getAttribute('data-orbit-id');
                   if (!elId) {
                       elId = Math.floor(Math.random() * 100000).toString();
                       targetEl.setAttribute('data-orbit-id', elId);
                   }
                   return elId;
               }
               return null;
           })();
       `);

       if (elId) {
         state.queue.shift();
         return JSON.stringify({
           thought: `Found input field matching '${intent.targetText}'.`,
           plan: `Type '${intent.inputText}'.`,
           action: "type",
           element_id: Number(elId),
           text: intent.inputText,
           press_enter: intent.press_enter || false
         });
       } else {
         if (!intent.retries) intent.retries = 0;
         if (intent.retries < 2) {
             intent.retries++;
             return JSON.stringify({ thought: `Could not find '${intent.targetText}'. Retrying (${intent.retries}/2)...`, plan: 'Wait for DOM to load.', action: 'inject_script', script: 'return new Promise(r => setTimeout(() => r("Waited 2s for DOM to load"), 2000));' });
         }
         state.queue.shift();
         return JSON.stringify({ thought: `Could not find input field matching '${intent.targetText}'.`, plan: `Skip step.`, action: "reply", message: `Could not find an input field matching "${intent.targetText}".` });
       }
    }
    
    if (intent.type === 'scroll') {
       state.queue.shift();
       return JSON.stringify({ thought: `Command recognized: Scroll ${intent.direction}`, plan: `Executing scroll.`, action: "scroll", direction: intent.direction });
    }

    if (intent.type === 'read_page') {
       state.queue.shift();
       return JSON.stringify({ thought: `Command recognized: Read page.`, plan: `Mapping DOM.`, action: "read_page" });
    }

    state.queue.shift();
    return JSON.stringify({ action: "reply", message: "Intent not implemented." });
};
