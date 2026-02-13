// Browser Use Recorder - Code Generator
// Transforms recorded events into Playwright, Puppeteer, or Python code

class CodeGenerator {
  constructor(events, options = {}) {
    this.events = events;
    this.framework = options.framework || 'playwright'; // playwright | puppeteer
    this.language = options.language || 'javascript';    // javascript | typescript | python
    this.includeComments = options.includeComments !== false;
    this.includeWaits = options.includeWaits !== false;
    this.headless = options.headless !== false;
    this.baseUrl = options.baseUrl || null;
    this.testName = options.testName || 'recorded_automation';
  }

  generate() {
    if (this.language === 'python') {
      return this._generatePython();
    }
    if (this.framework === 'puppeteer') {
      return this._generatePuppeteer();
    }
    return this._generatePlaywright();
  }

  // ─── Playwright (JS/TS) ───────────────────────────────────────────

  _generatePlaywright() {
    const isTS = this.language === 'typescript';
    const lines = [];

    // Imports
    if (isTS) {
      lines.push(`import { chromium, Browser, Page } from 'playwright';`);
    } else {
      lines.push(`const { chromium } = require('playwright');`);
    }
    lines.push('');

    // Main function
    lines.push(`async function ${this.testName}() {`);
    lines.push(`  const browser = await chromium.launch({ headless: ${this.headless} });`);
    lines.push(`  const context = await browser.newContext({`);
    lines.push(`    viewport: { width: ${this._getViewport().width}, height: ${this._getViewport().height} },`);
    lines.push(`  });`);
    lines.push(`  const page = await context.newPage();`);
    lines.push('');

    // Navigate to first URL
    const firstNav = this.events.find(e => e.url);
    if (firstNav) {
      lines.push(`  // Navigate to starting page`);
      lines.push(`  await page.goto('${this._escapeString(firstNav.url)}');`);
      lines.push('');
    }

    // Process events
    let lastUrl = firstNav?.url;
    let lastTimestamp = firstNav?.timestamp || 0;

    for (const event of this.events) {
      // Skip the initial pageload since we already navigated
      if (event === this.events[0] && event.type === 'pageload') continue;

      // Add wait between actions if significant time gap
      if (this.includeWaits && event.timestamp && lastTimestamp) {
        const gap = event.timestamp - lastTimestamp;
        if (gap > 2000) {
          lines.push(`  await page.waitForTimeout(${Math.min(gap, 5000)});`);
        }
      }

      // Handle navigation changes
      if (event.url && event.url !== lastUrl && event.type === 'navigation') {
        lines.push(`  await page.goto('${this._escapeString(event.url)}');`);
        lastUrl = event.url;
        lastTimestamp = event.timestamp;
        continue;
      }

      const code = this._eventToPlaywright(event);
      if (code) {
        if (this.includeComments && event.type !== 'ai_decision') {
          lines.push(`  // ${this._getEventComment(event)}`);
        }
        code.forEach(line => lines.push(`  ${line}`));
        lines.push('');
      }

      lastTimestamp = event.timestamp;
      if (event.url) lastUrl = event.url;
    }

    // Cleanup
    lines.push(`  await browser.close();`);
    lines.push(`}`);
    lines.push('');
    lines.push(`${this.testName}().catch(console.error);`);

    return lines.join('\n');
  }

  _eventToPlaywright(event) {
    const sel = event.element?.selector;
    switch (event.type) {
      case 'click':
        if (event.element?.text && event.element.tag === 'a') {
          return [`await page.click('${this._escapeSelector(sel)}');`];
        }
        if (event.element?.text && ['button', 'a'].includes(event.element.tag)) {
          return [`await page.getByRole('${event.element.tag === 'a' ? 'link' : 'button'}', { name: '${this._escapeString(event.element.text.substring(0, 50))}' }).click();`];
        }
        return [`await page.click('${this._escapeSelector(sel)}');`];

      case 'dblclick':
        return [`await page.dblclick('${this._escapeSelector(sel)}');`];

      case 'input':
        if (event.element?.placeholder) {
          return [`await page.getByPlaceholder('${this._escapeString(event.element.placeholder)}').fill('${this._escapeString(event.inputValue)}');`];
        }
        return [`await page.fill('${this._escapeSelector(sel)}', '${this._escapeString(event.inputValue)}');`];

      case 'select':
        return [`await page.selectOption('${this._escapeSelector(sel)}', '${this._escapeString(event.selectedValue)}');`];

      case 'check':
        return event.checked
          ? [`await page.check('${this._escapeSelector(sel)}');`]
          : [`await page.uncheck('${this._escapeSelector(sel)}');`];

      case 'submit':
        // Generate fill commands for form data, then submit
        const formLines = [];
        if (event.formData) {
          for (const [name, value] of Object.entries(event.formData)) {
            formLines.push(`await page.fill('[name="${name}"]', '${this._escapeString(value)}');`);
          }
        }
        formLines.push(`await page.click('${this._escapeSelector(sel)} [type="submit"]');`);
        return formLines;

      case 'keydown':
        return [`await page.keyboard.press('${event.key}');`];

      case 'scroll':
        return [`await page.evaluate(() => window.scrollTo(${event.scrollX}, ${event.scrollY}));`];

      case 'ai_decision':
        return this._generateAIDecisionPlaywright(event);

      case 'pageload':
        return [`await page.waitForLoadState('networkidle');`];

      default:
        return null;
    }
  }

  _generateAIDecisionPlaywright(event) {
    const lines = [];
    lines.push(`// 🤖 AI Decision Point: ${event.description || event.condition}`);
    lines.push(`{`);
    
    if (event.targetSelector) {
      lines.push(`  const targetEl = await page.$('${this._escapeSelector(event.targetSelector)}');`);
      lines.push(`  const targetText = targetEl ? await targetEl.textContent() : '';`);
      lines.push(`  const conditionMet = (() => {`);
      lines.push(`    const text = targetText;`);
      lines.push(`    // Evaluate: ${event.condition}`);
      lines.push(`    ${this._conditionToCode(event.condition, 'text')}`);
      lines.push(`  })();`);
    } else {
      lines.push(`  const pageContent = await page.content();`);
      lines.push(`  const conditionMet = (() => {`);
      lines.push(`    const text = pageContent;`);
      lines.push(`    // Evaluate: ${event.condition}`);
      lines.push(`    ${this._conditionToCode(event.condition, 'text')}`);
      lines.push(`  })();`);
    }

    lines.push(`  if (conditionMet) {`);
    lines.push(`    console.log('✅ Condition met: ${this._escapeString(event.condition)}');`);
    lines.push(`    ${this._actionToCode(event.ifTrue, 'page')}`);
    lines.push(`  } else {`);
    lines.push(`    console.log('❌ Condition not met: ${this._escapeString(event.condition)}');`);
    lines.push(`    ${this._actionToCode(event.ifFalse, 'page')}`);
    lines.push(`  }`);
    lines.push(`}`);
    return lines;
  }

  // ─── Puppeteer (JS/TS) ───────────────────────────────────────────

  _generatePuppeteer() {
    const isTS = this.language === 'typescript';
    const lines = [];

    if (isTS) {
      lines.push(`import puppeteer, { Browser, Page } from 'puppeteer';`);
    } else {
      lines.push(`const puppeteer = require('puppeteer');`);
    }
    lines.push('');

    lines.push(`async function ${this.testName}() {`);
    lines.push(`  const browser = await puppeteer.launch({ headless: ${this.headless ? '"new"' : 'false'} });`);
    lines.push(`  const page = await browser.newPage();`);
    lines.push(`  await page.setViewport({ width: ${this._getViewport().width}, height: ${this._getViewport().height} });`);
    lines.push('');

    const firstNav = this.events.find(e => e.url);
    if (firstNav) {
      lines.push(`  await page.goto('${this._escapeString(firstNav.url)}', { waitUntil: 'networkidle2' });`);
      lines.push('');
    }

    let lastUrl = firstNav?.url;
    let lastTimestamp = firstNav?.timestamp || 0;

    for (const event of this.events) {
      if (event === this.events[0] && event.type === 'pageload') continue;

      if (this.includeWaits && event.timestamp && lastTimestamp) {
        const gap = event.timestamp - lastTimestamp;
        if (gap > 2000) {
          lines.push(`  await new Promise(r => setTimeout(r, ${Math.min(gap, 5000)}));`);
        }
      }

      if (event.url && event.url !== lastUrl && event.type === 'navigation') {
        lines.push(`  await page.goto('${this._escapeString(event.url)}', { waitUntil: 'networkidle2' });`);
        lastUrl = event.url;
        lastTimestamp = event.timestamp;
        continue;
      }

      const code = this._eventToPuppeteer(event);
      if (code) {
        if (this.includeComments && event.type !== 'ai_decision') {
          lines.push(`  // ${this._getEventComment(event)}`);
        }
        code.forEach(line => lines.push(`  ${line}`));
        lines.push('');
      }

      lastTimestamp = event.timestamp;
      if (event.url) lastUrl = event.url;
    }

    lines.push(`  await browser.close();`);
    lines.push(`}`);
    lines.push('');
    lines.push(`${this.testName}().catch(console.error);`);

    return lines.join('\n');
  }

  _eventToPuppeteer(event) {
    const sel = event.element?.selector;
    switch (event.type) {
      case 'click':
        return [`await page.click('${this._escapeSelector(sel)}');`];

      case 'dblclick':
        return [
          `await page.click('${this._escapeSelector(sel)}', { clickCount: 2 });`,
        ];

      case 'input':
        return [
          `await page.click('${this._escapeSelector(sel)}');`,
          `await page.type('${this._escapeSelector(sel)}', '${this._escapeString(event.inputValue)}');`,
        ];

      case 'select':
        return [`await page.select('${this._escapeSelector(sel)}', '${this._escapeString(event.selectedValue)}');`];

      case 'check':
        return [`await page.click('${this._escapeSelector(sel)}');`];

      case 'keydown':
        return [`await page.keyboard.press('${event.key}');`];

      case 'scroll':
        return [`await page.evaluate(() => window.scrollTo(${event.scrollX}, ${event.scrollY}));`];

      case 'ai_decision':
        return this._generateAIDecisionPuppeteer(event);

      case 'pageload':
        return [`await page.waitForNavigation({ waitUntil: 'networkidle2' });`];

      default:
        return null;
    }
  }

  _generateAIDecisionPuppeteer(event) {
    const lines = [];
    lines.push(`// 🤖 AI Decision Point: ${event.description || event.condition}`);
    lines.push(`{`);
    
    if (event.targetSelector) {
      lines.push(`  const targetEl = await page.$('${this._escapeSelector(event.targetSelector)}');`);
      lines.push(`  const targetText = targetEl ? await page.evaluate(el => el.textContent, targetEl) : '';`);
    } else {
      lines.push(`  const targetText = await page.evaluate(() => document.body.textContent);`);
    }

    lines.push(`  const conditionMet = (() => {`);
    lines.push(`    const text = targetText;`);
    lines.push(`    ${this._conditionToCode(event.condition, 'text')}`);
    lines.push(`  })();`);
    lines.push(`  if (conditionMet) {`);
    lines.push(`    console.log('✅ Condition met: ${this._escapeString(event.condition)}');`);
    lines.push(`    ${this._actionToCode(event.ifTrue, 'page')}`);
    lines.push(`  } else {`);
    lines.push(`    console.log('❌ Condition not met: ${this._escapeString(event.condition)}');`);
    lines.push(`    ${this._actionToCode(event.ifFalse, 'page')}`);
    lines.push(`  }`);
    lines.push(`}`);
    return lines;
  }

  // ─── Python (Playwright) ─────────────────────────────────────────

  _generatePython() {
    const lines = [];

    lines.push(`import asyncio`);
    lines.push(`from playwright.async_api import async_playwright`);
    lines.push('');
    lines.push('');
    lines.push(`async def ${this.testName}():`);
    lines.push(`    async with async_playwright() as p:`);
    lines.push(`        browser = await p.chromium.launch(headless=${this.headless ? 'True' : 'False'})`);
    lines.push(`        context = await browser.new_context(`);
    lines.push(`            viewport={"width": ${this._getViewport().width}, "height": ${this._getViewport().height}}`);
    lines.push(`        )`);
    lines.push(`        page = await context.new_page()`);
    lines.push('');

    const firstNav = this.events.find(e => e.url);
    if (firstNav) {
      lines.push(`        # Navigate to starting page`);
      lines.push(`        await page.goto("${this._escapeString(firstNav.url)}")`);
      lines.push('');
    }

    let lastUrl = firstNav?.url;
    let lastTimestamp = firstNav?.timestamp || 0;

    for (const event of this.events) {
      if (event === this.events[0] && event.type === 'pageload') continue;

      if (this.includeWaits && event.timestamp && lastTimestamp) {
        const gap = event.timestamp - lastTimestamp;
        if (gap > 2000) {
          lines.push(`        await page.wait_for_timeout(${Math.min(gap, 5000)})`);
        }
      }

      if (event.url && event.url !== lastUrl && event.type === 'navigation') {
        lines.push(`        await page.goto("${this._escapeString(event.url)}")`);
        lastUrl = event.url;
        lastTimestamp = event.timestamp;
        continue;
      }

      const code = this._eventToPython(event);
      if (code) {
        if (this.includeComments && event.type !== 'ai_decision') {
          lines.push(`        # ${this._getEventComment(event)}`);
        }
        code.forEach(line => lines.push(`        ${line}`));
        lines.push('');
      }

      lastTimestamp = event.timestamp;
      if (event.url) lastUrl = event.url;
    }

    lines.push(`        await browser.close()`);
    lines.push('');
    lines.push('');
    lines.push(`asyncio.run(${this.testName}())`);

    return lines.join('\n');
  }

  _eventToPython(event) {
    const sel = event.element?.selector;
    switch (event.type) {
      case 'click':
        if (event.element?.text && ['button', 'a'].includes(event.element.tag)) {
          const role = event.element.tag === 'a' ? 'link' : 'button';
          return [`await page.get_by_role("${role}", name="${this._escapeString(event.element.text.substring(0, 50))}").click()`];
        }
        return [`await page.click("${this._escapeSelector(sel)}")`];

      case 'dblclick':
        return [`await page.dblclick("${this._escapeSelector(sel)}")`];

      case 'input':
        if (event.element?.placeholder) {
          return [`await page.get_by_placeholder("${this._escapeString(event.element.placeholder)}").fill("${this._escapeString(event.inputValue)}")`];
        }
        return [`await page.fill("${this._escapeSelector(sel)}", "${this._escapeString(event.inputValue)}")`];

      case 'select':
        return [`await page.select_option("${this._escapeSelector(sel)}", "${this._escapeString(event.selectedValue)}")`];

      case 'check':
        return event.checked
          ? [`await page.check("${this._escapeSelector(sel)}")`]
          : [`await page.uncheck("${this._escapeSelector(sel)}")`];

      case 'keydown':
        return [`await page.keyboard.press("${event.key}")`];

      case 'scroll':
        return [`await page.evaluate("window.scrollTo(${event.scrollX}, ${event.scrollY})")`];

      case 'ai_decision':
        return this._generateAIDecisionPython(event);

      case 'pageload':
        return [`await page.wait_for_load_state("networkidle")`];

      default:
        return null;
    }
  }

  _generateAIDecisionPython(event) {
    const lines = [];
    lines.push(`# 🤖 AI Decision Point: ${event.description || event.condition}`);
    
    if (event.targetSelector) {
      lines.push(`target_el = await page.query_selector("${this._escapeSelector(event.targetSelector)}")`);
      lines.push(`target_text = await target_el.text_content() if target_el else ""`);
    } else {
      lines.push(`target_text = await page.evaluate("document.body.textContent")`);
    }

    lines.push(`# Evaluate: ${event.condition}`);
    lines.push(`${this._conditionToPython(event.condition, 'target_text')}`);
    lines.push(`if condition_met:`);
    lines.push(`    print("✅ Condition met: ${this._escapeString(event.condition)}")`);
    lines.push(`    ${this._actionToPython(event.ifTrue, 'page')}`);
    lines.push(`else:`);
    lines.push(`    print("❌ Condition not met: ${this._escapeString(event.condition)}")`);
    lines.push(`    ${this._actionToPython(event.ifFalse, 'page')}`);
    return lines;
  }

  // ─── AI Decision Helpers ──────────────────────────────────────────

  _conditionToCode(condition, varName) {
    // Parse common condition patterns
    const c = condition.toLowerCase().trim();
    
    // "price > 100" pattern
    const numMatch = c.match(/(.*?)\s*(>|<|>=|<=|==|!=)\s*\$?(\d+(?:\.\d+)?)/);
    if (numMatch) {
      return `const num = parseFloat(${varName}.replace(/[^0-9.]/g, '')); return num ${numMatch[2]} ${numMatch[3]};`;
    }

    // "contains/includes X" pattern
    const containsMatch = c.match(/(?:contains?|includes?)\s+["']?(.+?)["']?\s*$/);
    if (containsMatch) {
      return `return ${varName}.toLowerCase().includes('${containsMatch[1].toLowerCase()}');`;
    }

    // "text is/equals X" pattern
    const equalsMatch = c.match(/(?:is|equals?)\s+["']?(.+?)["']?\s*$/);
    if (equalsMatch) {
      return `return ${varName}.trim().toLowerCase() === '${equalsMatch[1].toLowerCase()}';`;
    }

    // Default: treat as JS expression
    return `return eval(\`${condition.replace(/`/g, '\\`')}\`);`;
  }

  _conditionToPython(condition, varName) {
    const c = condition.toLowerCase().trim();
    
    const numMatch = c.match(/(.*?)\s*(>|<|>=|<=|==|!=)\s*\$?(\d+(?:\.\d+)?)/);
    if (numMatch) {
      return `import re\ncondition_met = float(re.sub(r'[^0-9.]', '', ${varName})) ${numMatch[2]} ${numMatch[3]}`;
    }

    const containsMatch = c.match(/(?:contains?|includes?)\s+["']?(.+?)["']?\s*$/);
    if (containsMatch) {
      return `condition_met = "${containsMatch[1].toLowerCase()}" in ${varName}.lower()`;
    }

    return `condition_met = eval("""${condition}""")`;
  }

  _actionToCode(action, pageVar) {
    if (!action || action === 'continue') return '// Continue with next steps';
    if (action === 'skip') return 'return; // Skip remaining steps';
    
    // "click X" pattern
    const clickMatch = action.match(/click\s+["']?(.+?)["']?\s*$/i);
    if (clickMatch) {
      return `await ${pageVar}.click('text=${clickMatch[1]}');`;
    }

    // "goto/navigate X" pattern
    const gotoMatch = action.match(/(?:goto|navigate|go to)\s+["']?(.+?)["']?\s*$/i);
    if (gotoMatch) {
      return `await ${pageVar}.goto('${gotoMatch[1]}');`;
    }

    return `// Action: ${action}`;
  }

  _actionToPython(action, pageVar) {
    if (!action || action === 'continue') return '# Continue with next steps\n    pass';
    if (action === 'skip') return 'return  # Skip remaining steps';
    
    const clickMatch = action.match(/click\s+["']?(.+?)["']?\s*$/i);
    if (clickMatch) {
      return `await ${pageVar}.click("text=${clickMatch[1]}")`;
    }

    const gotoMatch = action.match(/(?:goto|navigate|go to)\s+["']?(.+?)["']?\s*$/i);
    if (gotoMatch) {
      return `await ${pageVar}.goto("${gotoMatch[1]}")`;
    }

    return `# Action: ${action}\n    pass`;
  }

  // ─── Utilities ────────────────────────────────────────────────────

  _getViewport() {
    const vpEvent = this.events.find(e => e.viewport);
    return vpEvent?.viewport || { width: 1280, height: 720 };
  }

  _escapeString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  _escapeSelector(sel) {
    if (!sel) return 'body';
    return sel.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  _getEventComment(event) {
    switch (event.type) {
      case 'click': return `Click on ${event.element?.tag} "${(event.element?.text || '').substring(0, 40)}"`;
      case 'input': return `Type "${(event.inputValue || '').substring(0, 30)}" into ${event.element?.tag}`;
      case 'select': return `Select "${event.selectedText}"`;
      case 'check': return `${event.checked ? 'Check' : 'Uncheck'} ${event.element?.tag}`;
      case 'keydown': return `Press ${event.key}`;
      case 'scroll': return `Scroll to (${event.scrollX}, ${event.scrollY})`;
      case 'navigation': return `Navigate to ${event.url}`;
      case 'submit': return `Submit form`;
      default: return event.type;
    }
  }
}

module.exports = { CodeGenerator };
