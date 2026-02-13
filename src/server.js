#!/usr/bin/env node
// Browser Use Recorder - WebSocket Server
// Receives events from the Chrome extension and stores them

const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const { CodeGenerator } = require('./code-generator');

class RecorderServer {
  constructor(options = {}) {
    this.port = options.port || 3456;
    this.events = [];
    this.sessions = [];
    this.currentSession = null;
    this.outputDir = options.outputDir || path.join(process.cwd(), 'output');
    this.onEvent = options.onEvent || null;

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  start() {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && req.url === '/status') {
        res.end(JSON.stringify({
          recording: !!this.currentSession,
          eventCount: this.events.length,
          sessions: this.sessions.length,
        }));
      } else if (req.method === 'GET' && req.url === '/events') {
        res.end(JSON.stringify(this.events));
      } else if (req.method === 'POST' && req.url === '/generate') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const opts = JSON.parse(body || '{}');
            const result = this.generateCode(opts);
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else if (req.method === 'POST' && req.url === '/decision') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const decision = JSON.parse(body);
            this.addDecisionPoint(decision);
            res.end(JSON.stringify({ status: 'ok' }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else if (req.method === 'POST' && req.url === '/export-mcp') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const opts = JSON.parse(body || '{}');
            const result = this.exportMCPServer(opts);
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else if (req.method === 'POST' && req.url === '/clear') {
        this.events = [];
        this.currentSession = null;
        res.end(JSON.stringify({ status: 'cleared' }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      console.log('🔌 Browser connected');
      
      if (!this.currentSession) {
        this.currentSession = {
          id: Date.now().toString(36),
          startTime: Date.now(),
          events: [],
        };
      }

      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          event.sessionId = this.currentSession.id;
          event.eventIndex = this.events.length;
          
          this.events.push(event);
          this.currentSession.events.push(event);

          // Log event
          const icon = this._getEventIcon(event.type);
          const desc = this._getEventDescription(event);
          console.log(`  ${icon} [${event.type}] ${desc}`);

          if (this.onEvent) {
            this.onEvent(event);
          }

          // Broadcast to all connected clients
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === 1) {
              client.send(JSON.stringify({ type: 'event', event }));
            }
          });
        } catch (e) {
          console.error('Failed to parse event:', e.message);
        }
      });

      ws.on('close', () => {
        console.log('🔌 Browser disconnected');
        if (this.currentSession) {
          this.currentSession.endTime = Date.now();
          this.sessions.push(this.currentSession);
          this._saveSession(this.currentSession);
        }
      });
    });

    server.listen(this.port, () => {
      console.log(`\n🎬 Browser Use Recorder Server`);
      console.log(`   WebSocket: ws://localhost:${this.port}`);
      console.log(`   HTTP API:  http://localhost:${this.port}`);
      console.log(`   Output:    ${this.outputDir}\n`);
      console.log(`📋 Endpoints:`);
      console.log(`   GET  /status      - Server status`);
      console.log(`   GET  /events      - All recorded events`);
      console.log(`   POST /generate    - Generate automation code`);
      console.log(`   POST /decision    - Add AI decision point`);
      console.log(`   POST /export-mcp  - Export as MCP server`);
      console.log(`   POST /clear       - Clear all events\n`);
      console.log(`⏳ Waiting for browser connection...\n`);
    });

    this.server = server;
    this.wss = wss;
    return this;
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
  }

  addDecisionPoint(decision) {
    const event = {
      type: 'ai_decision',
      condition: decision.condition,
      ifTrue: decision.ifTrue || 'continue',
      ifFalse: decision.ifFalse || 'skip',
      targetSelector: decision.targetSelector || null,
      description: decision.description || '',
      timestamp: Date.now(),
      url: decision.url || '',
      sessionId: this.currentSession?.id,
      eventIndex: this.events.length,
    };
    this.events.push(event);
    console.log(`  🤖 [AI Decision] ${decision.condition}`);
    return event;
  }

  generateCode(options = {}) {
    const generator = new CodeGenerator(this.events, options);
    const code = generator.generate();
    
    const ext = options.language === 'typescript' ? 'ts' : 
                options.language === 'python' ? 'py' : 'js';
    const filename = `recording_${Date.now().toString(36)}.${ext}`;
    const filepath = path.join(this.outputDir, filename);
    
    fs.writeFileSync(filepath, code);
    console.log(`\n✅ Code generated: ${filepath}`);
    
    return { code, filepath, filename, eventCount: this.events.length };
  }

  exportMCPServer(options = {}) {
    const { MCPExporter } = require('./mcp-exporter');
    const exporter = new MCPExporter(this.events, options);
    const result = exporter.export();
    
    const dir = path.join(this.outputDir, `mcp-server-${Date.now().toString(36)}`);
    fs.mkdirSync(dir, { recursive: true });
    
    for (const [filename, content] of Object.entries(result.files)) {
      fs.writeFileSync(path.join(dir, filename), content);
    }
    
    console.log(`\n✅ MCP Server exported: ${dir}`);
    return { directory: dir, files: Object.keys(result.files) };
  }

  _saveSession(session) {
    const filename = `session_${session.id}.json`;
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(session, null, 2));
    console.log(`💾 Session saved: ${filepath}`);
  }

  _getEventIcon(type) {
    const icons = {
      click: '🖱️',
      dblclick: '🖱️🖱️',
      input: '⌨️',
      select: '📋',
      check: '☑️',
      submit: '📤',
      keydown: '⌨️',
      scroll: '📜',
      navigation: '🧭',
      pageload: '📄',
      ai_decision: '🤖',
    };
    return icons[type] || '📌';
  }

  _getEventDescription(event) {
    switch (event.type) {
      case 'click':
        return `${event.element?.tag || '?'} "${(event.element?.text || '').substring(0, 40)}" at (${event.x}, ${event.y})`;
      case 'input':
        return `${event.element?.tag || '?'}[${event.inputType || '?'}] = "${(event.inputValue || '').substring(0, 30)}"`;
      case 'select':
        return `Selected "${event.selectedText}" (${event.selectedValue})`;
      case 'navigation':
        return `${event.navigationType} → ${event.url}`;
      case 'pageload':
        return `"${event.title}" — ${event.url}`;
      case 'ai_decision':
        return `if (${event.condition}) → ${event.ifTrue} / ${event.ifFalse}`;
      case 'keydown':
        return `Key: ${event.key}`;
      case 'scroll':
        return `to (${event.scrollX}, ${event.scrollY})`;
      case 'submit':
        return `Form with ${Object.keys(event.formData || {}).length} fields`;
      default:
        return JSON.stringify(event).substring(0, 60);
    }
  }
}

module.exports = { RecorderServer };

// Run directly
if (require.main === module) {
  const server = new RecorderServer();
  server.start();
}
