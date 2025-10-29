#!/usr/bin/env node

/**
 * Memory Monitoring Script for Novaware-BE
 * Monitors memory usage and provides recommendations
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';

class MemoryMonitor {
  constructor() {
    this.startTime = Date.now();
    this.peakMemory = 0;
    this.memoryHistory = [];
    this.isMonitoring = false;
    this.intervalId = null;
  }

  startMonitoring(intervalMs = 5000) {
    if (this.isMonitoring) {
      console.log('⚠️  Memory monitoring is already running');
      return;
    }

    console.log('🔍 Starting memory monitoring...');
    this.isMonitoring = true;
    
    this.intervalId = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    // Initial check
    this.checkMemoryUsage();
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️  Memory monitoring is not running');
      return;
    }

    console.log('🛑 Stopping memory monitoring...');
    this.isMonitoring = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.generateReport();
  }

  checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const timestamp = new Date().toISOString();
    
    const memoryData = {
      timestamp,
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      uptime: process.uptime()
    };

    this.memoryHistory.push(memoryData);
    
    // Update peak memory
    if (memUsage.heapUsed > this.peakMemory) {
      this.peakMemory = memUsage.heapUsed;
    }

    // Log current status
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    
    console.log(`📊 Memory Status - Heap: ${heapUsedMB}MB/${heapTotalMB}MB, RSS: ${rssMB}MB, Peak: ${Math.round(this.peakMemory / 1024 / 1024)}MB`);

    // Check for memory warnings
    this.checkMemoryWarnings(memUsage);
  }

  checkMemoryWarnings(memUsage) {
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const usagePercentage = (heapUsedMB / heapTotalMB) * 100;

    if (usagePercentage > 90) {
      console.log('🚨 CRITICAL: Memory usage is above 90%!');
      this.recommendActions('critical');
    } else if (usagePercentage > 80) {
      console.log('⚠️  WARNING: Memory usage is above 80%');
      this.recommendActions('warning');
    } else if (usagePercentage > 70) {
      console.log('💡 INFO: Memory usage is above 70%');
      this.recommendActions('info');
    }
  }

  recommendActions(level) {
    const recommendations = {
      critical: [
        '🔄 Force garbage collection: global.gc()',
        '🧹 Clear large data structures',
        '📉 Reduce batch sizes in processing',
        '⏸️  Pause non-essential operations',
        '🔄 Restart the application if needed'
      ],
      warning: [
        '🧹 Perform memory cleanup',
        '📉 Consider reducing dataset sizes',
        '⏰ Schedule garbage collection',
        '📊 Monitor memory trends'
      ],
      info: [
        '📊 Continue monitoring',
        '🧹 Regular cleanup recommended',
        '📈 Consider optimization opportunities'
      ]
    };

    console.log(`\n💡 Recommendations for ${level.toUpperCase()} level:`);
    recommendations[level].forEach(rec => console.log(`   ${rec}`));
    console.log('');
  }

  generateReport() {
    const runtime = Date.now() - this.startTime;
    const runtimeMinutes = Math.round(runtime / 60000);
    
    console.log('\n📊 Memory Monitoring Report');
    console.log('='.repeat(50));
    console.log(`⏱️  Runtime: ${runtimeMinutes} minutes`);
    console.log(`📈 Peak Memory: ${Math.round(this.peakMemory / 1024 / 1024)}MB`);
    console.log(`📊 Data Points: ${this.memoryHistory.length}`);
    
    if (this.memoryHistory.length > 0) {
      const first = this.memoryHistory[0];
      const last = this.memoryHistory[this.memoryHistory.length - 1];
      
      console.log(`📉 Initial Memory: ${Math.round(first.heapUsed / 1024 / 1024)}MB`);
      console.log(`📈 Final Memory: ${Math.round(last.heapUsed / 1024 / 1024)}MB`);
      
      const memoryGrowth = last.heapUsed - first.heapUsed;
      console.log(`📊 Memory Growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB`);
    }

    // Save detailed report
    this.saveDetailedReport();
  }

  async saveDetailedReport() {
    try {
      const reportData = {
        summary: {
          startTime: new Date(this.startTime).toISOString(),
          endTime: new Date().toISOString(),
          runtime: Date.now() - this.startTime,
          peakMemory: this.peakMemory,
          dataPoints: this.memoryHistory.length
        },
        memoryHistory: this.memoryHistory,
        recommendations: {
          critical: 'Memory usage exceeded 90% - immediate action required',
          warning: 'Memory usage exceeded 80% - monitoring recommended',
          info: 'Memory usage exceeded 70% - optimization opportunities'
        }
      };

      const reportPath = path.join(process.cwd(), 'memory-report.json');
      await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`💾 Detailed report saved to: ${reportPath}`);
    } catch (error) {
      console.error('❌ Error saving detailed report:', error.message);
    }
  }

  // Utility method to force garbage collection
  forceGC() {
    if (global.gc) {
      console.log('🧹 Forcing garbage collection...');
      global.gc();
      console.log('✅ Garbage collection completed');
    } else {
      console.log('⚠️  Garbage collection not available (use --expose-gc flag)');
    }
  }

  // Method to get current memory stats
  getCurrentStats() {
    const memUsage = process.memoryUsage();
    return {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024),
      peakMemory: Math.round(this.peakMemory / 1024 / 1024),
      uptime: Math.round(process.uptime())
    };
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new MemoryMonitor();
  
  console.log('🚀 Novaware-BE Memory Monitor');
  console.log('Press Ctrl+C to stop monitoring and generate report\n');
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, stopping monitoring...');
    monitor.stopMonitoring();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, stopping monitoring...');
    monitor.stopMonitoring();
    process.exit(0);
  });

  // Start monitoring
  monitor.startMonitoring(3000); // Check every 3 seconds
}

export default MemoryMonitor;
