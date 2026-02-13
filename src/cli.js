#!/usr/bin/env node
// Browser Use Recorder - CLI

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { RecorderServer } = require('./server');
const { CodeGenerator } = require('./code-generator');
const { MCPExporter } = require('./mcp-exporter');

program
  .name('browser-recorder')
  .description('Record browser interactions and generate automation code')
  .version('1.0.0');

// ─── Record Command ─────────────────────────────────────────────────

program
  .command('record')
  .description('Start the recorder server and wait for browser connections')
  .option('-p, --port <port>', 'WebSocket server port', '3456')
  .option('-o, --output <dir>', 'Output directory', './output')
  .action((opts) => {
    console.log(chalk.bold.red('\n  🔴 Browser Use Recorder\n'));
    console.log(chalk.gray('  Record browser interactions → generate automation code\n'));

    const server = new RecorderServer({
      port: parseInt(opts.port),
      outputDir: path.resolve(opts.output),
    });

    server.start();

    console.log(chalk.yellow('  📌 Load the Chrome extension from:'));
    console.log(chalk.cyan(`     ${path.resolve(__dirname, '..', 'extension')}\n`));
    console.log(chalk.yellow('  📌 Then click "Start Recording" in the extension popup\n'));
    console.log(chalk.gray('  Press Ctrl+C to stop the server\n'));

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\n  ⏹ Stopping recorder...\n'));
      
      if (server.events.length > 0) {
        console.log(chalk.green(`  📊 Recorded ${server.events.length} events\n`));
        
        // Auto-generate code on exit
        const result = server.generateCode({ framework: 'playwright', language: 'javascript' });
        console.log(chalk.green(`  ✅ Playwright JS: ${result.filepath}`));
        
        const resultPy = server.generateCode({ framework: 'playwright', language: 'python' });
        console.log(chalk.green(`  ✅ Python:        ${resultPy.filepath}`));
        
        const resultPup = server.generateCode({ framework: 'puppeteer', language: 'javascript' });
        console.log(chalk.green(`  ✅ Puppeteer JS:  ${resultPup.filepath}\n`));
      } else {
        console.log(chalk.gray('  No events recorded.\n'));
      }

      server.stop();
      process.exit(0);
    });
  });

// ─── Generate Command ───────────────────────────────────────────────

program
  .command('generate')
  .description('Generate automation code from a recorded session file')
  .argument('<session-file>', 'Path to session JSON file')
  .option('-f, --framework <framework>', 'Framework: playwright or puppeteer', 'playwright')
  .option('-l, --language <language>', 'Language: javascript, typescript, or python', 'javascript')
  .option('-o, --output <file>', 'Output file path')
  .option('--no-comments', 'Exclude comments from generated code')
  .option('--no-waits', 'Exclude wait statements')
  .option('--headless', 'Generate code for headless mode', true)
  .option('--test-name <name>', 'Function name for the test', 'recorded_automation')
  .action((sessionFile, opts) => {
    console.log(chalk.bold.red('\n  🔴 Browser Use Recorder - Code Generator\n'));

    const filePath = path.resolve(sessionFile);
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`  ❌ File not found: ${filePath}`));
      process.exit(1);
    }

    const session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const events = session.events || session;

    console.log(chalk.gray(`  📂 Session: ${filePath}`));
    console.log(chalk.gray(`  📊 Events: ${events.length}`));
    console.log(chalk.gray(`  🔧 Framework: ${opts.framework}`));
    console.log(chalk.gray(`  📝 Language: ${opts.language}\n`));

    const generator = new CodeGenerator(events, {
      framework: opts.framework,
      language: opts.language,
      includeComments: opts.comments !== false,
      includeWaits: opts.waits !== false,
      headless: opts.headless,
      testName: opts.testName,
    });

    const code = generator.generate();

    if (opts.output) {
      const outPath = path.resolve(opts.output);
      fs.writeFileSync(outPath, code);
      console.log(chalk.green(`  ✅ Code written to: ${outPath}\n`));
    } else {
      console.log(chalk.cyan('  ─── Generated Code ───\n'));
      console.log(code);
      console.log(chalk.cyan('\n  ─── End ───\n'));
    }
  });

// ─── Export MCP Command ─────────────────────────────────────────────

program
  .command('export-mcp')
  .description('Export a recorded session as a reusable MCP server')
  .argument('<session-file>', 'Path to session JSON file')
  .option('-n, --name <name>', 'MCP server name', 'browser-automation')
  .option('-d, --description <desc>', 'Server description')
  .option('-t, --tool-name <name>', 'Main tool name', 'run_browser_automation')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-f, --framework <framework>', 'Framework: playwright or puppeteer', 'playwright')
  .action((sessionFile, opts) => {
    console.log(chalk.bold.red('\n  🔴 Browser Use Recorder - MCP Exporter\n'));

    const filePath = path.resolve(sessionFile);
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`  ❌ File not found: ${filePath}`));
      process.exit(1);
    }

    const session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const events = session.events || session;

    console.log(chalk.gray(`  📂 Session: ${filePath}`));
    console.log(chalk.gray(`  📊 Events: ${events.length}\n`));

    const exporter = new MCPExporter(events, {
      serverName: opts.name,
      description: opts.description || `Browser automation: ${path.basename(sessionFile)}`,
      toolName: opts.toolName,
      framework: opts.framework,
    });

    const result = exporter.export();
    const dir = path.join(path.resolve(opts.output), `mcp-server-${opts.name}`);
    fs.mkdirSync(dir, { recursive: true });

    for (const [filename, content] of Object.entries(result.files)) {
      fs.writeFileSync(path.join(dir, filename), content);
      console.log(chalk.green(`  ✅ ${filename}`));
    }

    console.log(chalk.bold.green(`\n  📦 MCP Server exported to: ${dir}\n`));
    console.log(chalk.yellow('  To use it:\n'));
    console.log(chalk.cyan(`    cd ${dir}`));
    console.log(chalk.cyan('    npm install'));
    console.log(chalk.cyan('    node index.js\n'));
    console.log(chalk.yellow('  Add to MCP settings:\n'));
    console.log(chalk.gray(`    {`));
    console.log(chalk.gray(`      "mcpServers": {`));
    console.log(chalk.gray(`        "${opts.name}": {`));
    console.log(chalk.gray(`          "command": "node",`));
    console.log(chalk.gray(`          "args": ["${path.join(dir, 'index.js')}"]`));
    console.log(chalk.gray(`        }`));
    console.log(chalk.gray(`      }`));
    console.log(chalk.gray(`    }\n`));
  });

// ─── Decision Command ───────────────────────────────────────────────

program
  .command('add-decision')
  .description('Add an AI decision point to a running recorder')
  .option('-p, --port <port>', 'Recorder server port', '3456')
  .option('-c, --condition <condition>', 'Condition to evaluate (e.g., "price > 100")')
  .option('--if-true <action>', 'Action if condition is true', 'continue')
  .option('--if-false <action>', 'Action if condition is false', 'skip')
  .option('-s, --selector <selector>', 'Target element selector')
  .option('-d, --description <desc>', 'Description of the decision point')
  .action(async (opts) => {
    if (!opts.condition) {
      console.error(chalk.red('  ❌ --condition is required'));
      process.exit(1);
    }

    const http = require('http');
    const data = JSON.stringify({
      condition: opts.condition,
      ifTrue: opts.ifTrue,
      ifFalse: opts.ifFalse,
      targetSelector: opts.selector,
      description: opts.description || opts.condition,
    });

    const req = http.request({
      hostname: 'localhost',
      port: parseInt(opts.port),
      path: '/decision',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(chalk.green(`  🤖 Decision point added: ${opts.condition}`));
      });
    });

    req.on('error', (e) => {
      console.error(chalk.red(`  ❌ Could not connect to recorder server on port ${opts.port}`));
      console.error(chalk.gray(`     Make sure the recorder is running: browser-recorder record`));
    });

    req.write(data);
    req.end();
  });

// ─── Info Command ───────────────────────────────────────────────────

program
  .command('info')
  .description('Show information about a recorded session')
  .argument('<session-file>', 'Path to session JSON file')
  .action((sessionFile) => {
    const filePath = path.resolve(sessionFile);
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`  ❌ File not found: ${filePath}`));
      process.exit(1);
    }

    const session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const events = session.events || session;

    console.log(chalk.bold.red('\n  🔴 Session Info\n'));
    console.log(chalk.gray(`  File: ${filePath}`));
    console.log(chalk.gray(`  Events: ${events.length}`));

    if (session.startTime) {
      console.log(chalk.gray(`  Started: ${new Date(session.startTime).toISOString()}`));
    }
    if (session.endTime) {
      console.log(chalk.gray(`  Ended: ${new Date(session.endTime).toISOString()}`));
      console.log(chalk.gray(`  Duration: ${((session.endTime - session.startTime) / 1000).toFixed(1)}s`));
    }

    // Event type breakdown
    const types = {};
    events.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
    console.log(chalk.bold('\n  Event Breakdown:'));
    for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
      console.log(chalk.cyan(`    ${type}: ${count}`));
    }

    // URLs
    const urls = [...new Set(events.filter(e => e.url).map(e => e.url))];
    if (urls.length > 0) {
      console.log(chalk.bold('\n  URLs visited:'));
      urls.forEach(u => console.log(chalk.cyan(`    ${u}`)));
    }

    // Decision points
    const decisions = events.filter(e => e.type === 'ai_decision');
    if (decisions.length > 0) {
      console.log(chalk.bold('\n  AI Decision Points:'));
      decisions.forEach(d => {
        console.log(chalk.yellow(`    🤖 ${d.condition}`));
        console.log(chalk.gray(`       ✅ ${d.ifTrue} / ❌ ${d.ifFalse}`));
      });
    }

    console.log('');
  });

program.parse();
