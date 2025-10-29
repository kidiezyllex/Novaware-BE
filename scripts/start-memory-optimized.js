#!/usr/bin/env node

/**
 * Memory-Optimized Server Startup Script
 * Starts the server with proper memory configuration
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Memory configuration
const MEMORY_LIMIT = '4096'; // 4GB
const NODE_OPTIONS = [
  `--max-old-space-size=${MEMORY_LIMIT}`,
  '--expose-gc',
  '--optimize-for-size',
  '--gc-interval=100'
].join(' ');

console.log('🚀 Starting Novaware-BE with memory optimization...');
console.log(`📊 Memory limit: ${MEMORY_LIMIT}MB`);
console.log(`🔧 Node options: ${NODE_OPTIONS}`);

// Set environment variables
process.env.NODE_OPTIONS = NODE_OPTIONS;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Start the server
const serverPath = path.join(__dirname, '..', 'server.js');
const serverProcess = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: NODE_OPTIONS
  }
});

// Handle process events
serverProcess.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

serverProcess.on('exit', (code, signal) => {
  if (signal) {
    console.log(`🛑 Server stopped by signal: ${signal}`);
  } else {
    console.log(`🛑 Server exited with code: ${code}`);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down server...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down server...');
  serverProcess.kill('SIGTERM');
});

// Memory monitoring
let memoryCheckInterval;
if (process.env.MONITOR_MEMORY === 'true') {
  memoryCheckInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const usagePercentage = Math.round((heapUsedMB / heapTotalMB) * 100);
    
    console.log(`📊 Memory: ${heapUsedMB}MB/${heapTotalMB}MB (${usagePercentage}%)`);
    
    if (usagePercentage > 90) {
      console.log('🚨 CRITICAL: Memory usage above 90%!');
    } else if (usagePercentage > 80) {
      console.log('⚠️  WARNING: Memory usage above 80%');
    }
  }, 10000); // Check every 10 seconds
}

// Cleanup on exit
process.on('exit', () => {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
  }
});
