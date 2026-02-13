// Browser Use Recorder - Main Entry Point
const { RecorderServer } = require('./server');
const { CodeGenerator } = require('./code-generator');
const { MCPExporter } = require('./mcp-exporter');

module.exports = { RecorderServer, CodeGenerator, MCPExporter };
