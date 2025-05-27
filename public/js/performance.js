/**
 * Performance monitoring for D!RTDUB
 */

class PerformanceMonitor {
  constructor() {
    this.isMonitoring = false;
    this.stats = {
      audioDropouts: 0,
      cpuUsage: 0,
      memoryUsage: 0,
    };
  }

  startMonitoring(audioContext) {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.audioContext = audioContext;

    // Monitor audio performance
    this.monitorAudio();

    // Log performance every 10 seconds
    this.performanceInterval = setInterval(() => {
      this.logPerformance();
    }, 10000);
  }

  monitorAudio() {
    if (!this.audioContext) return;

    // Check audio context state
    if (this.audioContext.state !== "running") {
      console.warn("Audio context not running:", this.audioContext.state);
    }

    // Monitor sample rate
    if (this.audioContext.sampleRate !== 44100) {
      console.info("Non-standard sample rate:", this.audioContext.sampleRate);
    }
  }

  logPerformance() {
    const memory = performance.memory;
    if (memory) {
      const used = Math.round(memory.usedJSHeapSize / 1048576);
      const total = Math.round(memory.totalJSHeapSize / 1048576);
      console.log(`Memory usage: ${used}MB / ${total}MB`);
    }

    if (this.audioContext) {
      console.log(
        `Audio context: ${this.audioContext.state} @ ${this.audioContext.sampleRate}Hz`,
      );
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
  }
}

window.PerformanceMonitor = PerformanceMonitor;
