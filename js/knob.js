/**
 * D!RTDUB - Audio Degradation Engine
 * One knob controls progressive audio destruction
 */

class AudioDegradationEngine {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.degradationLevel = 0; // 0-1 (0% to 100%)

    this.inputGain = null;
    this.preFilter = null;
    this.bitCrusher = null;
    this.distortion = null;
    this.noiseGenerator = null;
    this.noiseGain = null;
    this.dropoutProcessor = null;
    this.postFilter = null;
    this.pitchShifter = null;
    this.outputGain = null;
    this.masterGain = null;

    this.workletNodes = new Map();

    this.lastUpdateTime = 0;
    this.updateThreshold = 16; // ~60fps update rate

    this.isReady = false;
    this.isDestroyed = false;

    console.log(
      "AudioDegradationEngine constructor - degradationLevel:",
      this.degradationLevel,
    );
  }

  createSmoothCurve(input, type = "exponential") {
    const x = Math.max(0, Math.min(1, input));

    switch (type) {
      case "exponential":
        return Math.pow(x, 2.2);

      case "logarithmic":
        return x === 0 ? 0 : Math.log10(1 + x * 9) / 1;

      case "smooth":
        return x * x * x * (x * (x * 6 - 15) + 10);

      case "gentle":
        return x * (2 - x * 0.5);

      case "inverse":
        return 1 - Math.pow(1 - x, 2);

      case "audio_taper":
        return Math.log10(1 + x * 9) / Math.log10(10);

      case "musical":
        return Math.pow(x, 1.5);

      case "aggressive":
        return x < 0.1 ? 0 : Math.pow((x - 0.1) / 0.9, 0.5);

      case "stepped":
        const steps = 8;
        return Math.floor(x * steps) / steps;

      case "linear":
      default:
        return x;
    }
  }

  async setupAudioChain() {
    if (this.isDestroyed) return;

    try {
      console.log("Setting up audio chain...");

      await this.loadAudioWorklets();

      this.createAudioNodes();
      this.connectAudioChain();

      this.resetAllParameters();

      this.isReady = true;
      console.log("D!RTDUB degradation engine initialized with clean state");
    } catch (error) {
      console.error("Error setting up audio chain:", error);
      throw error;
    }
  }

  resetAllParameters() {
    if (this.isDestroyed) return;

    console.log("Resetting all parameters to clean state...");

    this.degradationLevel = 0;

    try {
      if (this.workletNodes.has("bitcrusher")) {
        this.bitCrusher.parameters.get("bitDepth").value = 16;
        this.bitCrusher.parameters.get("sampleRate").value = 44100;
      } else if (this.bitCrusher?.curve) {
        this.bitCrusher.curve = this.createBitCrushCurve(16);
      }

      if (this.preFilter) {
        this.preFilter.frequency.setValueAtTime(
          20,
          this.audioContext.currentTime,
        );
        this.preFilter.Q.setValueAtTime(0.7, this.audioContext.currentTime);
      }

      if (this.postFilter) {
        this.postFilter.frequency.setValueAtTime(
          20000,
          this.audioContext.currentTime,
        );
        this.postFilter.Q.setValueAtTime(0.7, this.audioContext.currentTime);
      }

      if (this.distortion) {
        this.distortion.curve = this.createDistortionCurve(1); // Minimal distortion
      }

      if (this.inputGain) {
        this.inputGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);
      }

      if (this.noiseGain) {
        this.noiseGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      }

      if (this.outputGain) {
        this.outputGain.gain.setValueAtTime(0.8, this.audioContext.currentTime);
      }

      if (this.workletNodes.has("dropout")) {
        this.dropoutProcessor.parameters.get("intensity").value = 0;
        this.dropoutProcessor.parameters.get("frequency").value = 0;
      } else if (this.dropoutProcessor?.gain) {
        this.dropoutProcessor.gain.setValueAtTime(
          1.0,
          this.audioContext.currentTime,
        );
      }

      if (this.pitchLFOGain) {
        this.pitchLFOGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      }

      if (this.pitchLFO) {
        this.pitchLFO.frequency.setValueAtTime(
          0.1,
          this.audioContext.currentTime,
        );
      }

      console.log("All parameters reset to clean state");
    } catch (error) {
      console.warn("Error during parameter reset:", error);
    }
  }

  async loadAudioWorklets() {
    if (this.isDestroyed) return;

    try {
      const workletPromises = [
        this.audioContext.audioWorklet.addModule(
          "./js/worklets/bitcrusher-worklet.js",
        ),
        this.audioContext.audioWorklet.addModule(
          "./js/worklets/dropout-worklet.js",
        ),
      ];

      await Promise.allSettled(workletPromises);
      console.log("Audio worklets loaded successfully");
    } catch (error) {
      console.warn(
        "Some audio worklets failed to load, using fallback implementations",
      );
    }
  }

  createAudioNodes() {
    if (this.isDestroyed) return;

    console.log("Creating audio nodes...");

    try {
      this.inputGain = this.audioContext.createGain();
      this.inputGain.gain.value = 1.0;

      this.preFilter = this.audioContext.createBiquadFilter();
      this.preFilter.type = "highpass";
      this.preFilter.frequency.value = 20;
      this.preFilter.Q.value = 0.7;

      this.createBitCrusher();

      this.distortion = this.audioContext.createWaveShaper();
      this.distortion.curve = this.createDistortionCurve(1);
      this.distortion.oversample = "2x";

      this.createNoiseGenerator();

      this.createDropoutProcessor();

      this.postFilter = this.audioContext.createBiquadFilter();
      this.postFilter.type = "lowpass";
      this.postFilter.frequency.value = 20000;
      this.postFilter.Q.value = 0.7;

      this.createPitchShifter();

      this.outputGain = this.audioContext.createGain();
      this.outputGain.gain.value = 0.8;

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;

      console.log("Audio nodes created successfully");
    } catch (error) {
      console.error("Error creating audio nodes:", error);
      throw error;
    }
  }

  createBitCrusher() {
    try {
      this.bitCrusher = new AudioWorkletNode(
        this.audioContext,
        "bitcrusher-processor",
      );
      this.bitCrusher.parameters.get("bitDepth").value = 16;
      this.bitCrusher.parameters.get("sampleRate").value = 44100;
      this.workletNodes.set("bitcrusher", this.bitCrusher);
      console.log("Using BitCrusher worklet - initialized to clean state");
    } catch (error) {
      console.log("BitCrusher worklet failed, using fallback");
      this.bitCrusher = this.audioContext.createWaveShaper();
      this.bitCrusher.curve = this.createBitCrushCurve(16); // start with 16-bit (clean)
      this.bitCrusher.oversample = "none";
    }
  }

  createNoiseGenerator() {
    try {
      const bufferSize = this.audioContext.sampleRate * 2; // 2 seconds of noise
      const noiseBuffer = this.audioContext.createBuffer(
        2,
        bufferSize,
        this.audioContext.sampleRate,
      );

      // pink noise
      for (let channel = 0; channel < 2; channel++) {
        const channelData = noiseBuffer.getChannelData(channel);
        let b0 = 0,
          b1 = 0,
          b2 = 0,
          b3 = 0,
          b4 = 0,
          b5 = 0,
          b6 = 0;

        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.969 * b2 + white * 0.153852;
          b3 = 0.8665 * b3 + white * 0.3104856;
          b4 = 0.55 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.016898;
          channelData[i] =
            (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
          b6 = white * 0.115926;
        }
      }

      this.noiseGenerator = this.audioContext.createBufferSource();
      this.noiseGenerator.buffer = noiseBuffer;
      this.noiseGenerator.loop = true;
      this.noiseGenerator.start();

      this.noiseGain = this.audioContext.createGain();
      this.noiseGain.gain.value = 0;

      this.noiseGenerator.connect(this.noiseGain);
    } catch (error) {
      console.error("Error creating noise generator:", error);
      this.noiseGain = this.audioContext.createGain();
      this.noiseGain.gain.value = 0;
    }
  }

  createDropoutProcessor() {
    try {
      this.dropoutProcessor = new AudioWorkletNode(
        this.audioContext,
        "dropout-processor",
      );
      this.dropoutProcessor.parameters.get("intensity").value = 0;
      this.dropoutProcessor.parameters.get("frequency").value = 0;
      this.workletNodes.set("dropout", this.dropoutProcessor);
      console.log("Using Dropout worklet - initialized to clean state");
    } catch (error) {
      console.log("Dropout worklet failed, using fallback");
      this.dropoutProcessor = this.audioContext.createGain();
      this.dropoutProcessor.gain.value = 1.0;
    }
  }

  createPitchShifter() {
    try {
      this.pitchShifter = this.audioContext.createDelay(0.1);
      this.pitchShifter.delayTime.value = 0.001;

      // LFO for pitch modulation
      this.pitchLFO = this.audioContext.createOscillator();
      this.pitchLFO.frequency.value = 0.1;
      this.pitchLFO.type = "sine";

      this.pitchLFOGain = this.audioContext.createGain();
      this.pitchLFOGain.gain.value = 0;

      this.pitchLFO.connect(this.pitchLFOGain);
      this.pitchLFOGain.connect(this.pitchShifter.delayTime);
      this.pitchLFO.start();
    } catch (error) {
      console.error("Error creating pitch shifter:", error);
      this.pitchShifter = this.audioContext.createGain();
      this.pitchShifter.gain.value = 1.0;
    }
  }

  connectAudioChain() {
    if (this.isDestroyed) return;

    console.log("Connecting audio chain...");

    try {
      this.inputGain.connect(this.preFilter);
      this.preFilter.connect(this.bitCrusher);
      this.bitCrusher.connect(this.distortion);
      this.distortion.connect(this.dropoutProcessor);
      this.dropoutProcessor.connect(this.postFilter);
      this.postFilter.connect(this.pitchShifter);
      this.pitchShifter.connect(this.outputGain);

      this.noiseGain.connect(this.outputGain);

      this.outputGain.connect(this.masterGain);

      console.log("Audio chain connected successfully");
    } catch (error) {
      console.error("Error connecting audio chain:", error);
      throw error;
    }
  }

  connectSource(sourceNode) {
    if (!this.isReady || this.isDestroyed) {
      console.warn("Degradation engine not ready, connecting directly");
      return sourceNode;
    }

    try {
      console.log("Connecting source to degradation chain");
      sourceNode.connect(this.inputGain);
      return this.masterGain;
    } catch (error) {
      console.error("Error connecting source:", error);
      return sourceNode;
    }
  }

  applyDegradationEffects() {
    const intensity = this.degradationLevel;

    const bitcrushIntensity = this.createSmoothCurve(intensity, "audio_taper");
    const filterIntensity = this.createSmoothCurve(intensity, "musical");
    const distortionIntensity = this.createSmoothCurve(
      intensity,
      "exponential",
    );
    const noiseIntensity = this.createSmoothCurve(intensity, "gentle");
    const dropoutIntensity = this.createSmoothCurve(
      Math.max(0, intensity - 0.3),
      "aggressive",
    );
    const pitchIntensity = this.createSmoothCurve(intensity, "smooth");

    this.applyBitCrushing(bitcrushIntensity);
    this.applyFiltering(filterIntensity);
    this.applyDistortion(distortionIntensity);
    this.applyNoise(noiseIntensity);
    this.applyDropouts(dropoutIntensity);
    this.applyPitchWarping(pitchIntensity);
  }

  setDegradationLevel(level) {
    if (!this.isReady || this.isDestroyed) return;

    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateThreshold) return;
    this.lastUpdateTime = now;

    const oldLevel = this.degradationLevel;
    this.degradationLevel = Math.max(0, Math.min(1, level));

    if (Math.abs(this.degradationLevel - oldLevel) < 0.001) return;

    try {
      this.applyDegradationEffects();

      if (Math.abs(this.degradationLevel - oldLevel) > 0.01) {
        console.log(
          `Degradation level: ${(this.degradationLevel * 100).toFixed(1)}%`,
        );
      }
    } catch (error) {
      console.error("Error applying degradation:", error);
    }
  }

  applyBitCrushing() {
    const intensity = this.createSmoothCurve(this.degradationLevel, "smooth");

    try {
      if (this.workletNodes.has("bitcrusher")) {
        // 16-bit to 6-bit
        const bitDepth = Math.max(6, 16 - intensity * 10);
        // 44kHz to 8kHz
        const sampleRate = Math.max(8000, 44100 - intensity * 36100);

        this.bitCrusher.parameters.get("bitDepth").value = bitDepth;
        this.bitCrusher.parameters.get("sampleRate").value = sampleRate;
      } else if (this.bitCrusher?.curve) {
        const bitDepth = Math.max(6, 16 - intensity * 10);
        this.bitCrusher.curve = this.createBitCrushCurve(bitDepth);
      }
    } catch (error) {
      console.warn("Error applying bit crushing:", error);
    }
  }

  applyFiltering() {
    const lowPassIntensity = this.createSmoothCurve(
      this.degradationLevel,
      "gentle",
    );
    const highPassIntensity = this.createSmoothCurve(
      this.degradationLevel,
      "exponential",
    );

    try {
      const preFilterFreq = 20 + highPassIntensity * 150; // 20Hz to 170Hz
      this.preFilter?.frequency.setValueAtTime(
        preFilterFreq,
        this.audioContext.currentTime,
      );

      const postFilterFreq = 20000 - lowPassIntensity * 12000; // 20kHz to 8kHz
      this.postFilter?.frequency.setValueAtTime(
        postFilterFreq,
        this.audioContext.currentTime,
      );

      const qValue = 0.7 + lowPassIntensity * 1.5;
      this.postFilter?.Q.setValueAtTime(qValue, this.audioContext.currentTime);
    } catch (error) {
      console.warn("Error applying filtering:", error);
    }
  }

  applyDistortion() {
    const intensity = this.createSmoothCurve(
      this.degradationLevel,
      "exponential",
    );

    try {
      // 1x to 8x gain
      const driveAmount = 1 + intensity * 7;

      if (this.distortion) {
        this.distortion.curve = this.createDistortionCurve(driveAmount);
      }

      const inputLevel = 1 - intensity * 0.2;
      this.inputGain?.gain.setValueAtTime(
        inputLevel,
        this.audioContext.currentTime,
      );
    } catch (error) {
      console.warn("Error applying distortion:", error);
    }
  }

  applyNoise() {
    const intensity = this.createSmoothCurve(this.degradationLevel, "smooth");
    const noiseLevel = intensity * 0.02;

    try {
      this.noiseGain?.gain.setValueAtTime(
        noiseLevel,
        this.audioContext.currentTime,
      );
    } catch (error) {
      console.warn("Error applying noise:", error);
    }
  }

  applyDropouts() {
    const intensity = this.createSmoothCurve(
      this.degradationLevel,
      "exponential",
    );

    try {
      if (this.workletNodes.has("dropout")) {
        const dropoutIntensity = Math.max(0, (intensity - 0.3) / 0.7);
        this.dropoutProcessor.parameters.get("intensity").value =
          dropoutIntensity;
        this.dropoutProcessor.parameters.get("frequency").value =
          dropoutIntensity * 5;
      } else if (this.dropoutProcessor?.gain) {
        if (intensity > 0.4 && Math.random() < intensity * 0.003) {
          const dropoutTime = this.audioContext.currentTime;
          const dropoutDuration = 0.001 + intensity * 0.015;

          this.dropoutProcessor.gain.setValueAtTime(1, dropoutTime);
          this.dropoutProcessor.gain.setValueAtTime(0.3, dropoutTime + 0.001);
          this.dropoutProcessor.gain.setValueAtTime(
            1,
            dropoutTime + dropoutDuration,
          );
        }
      }
    } catch (error) {
      console.warn("Error applying dropouts:", error);
    }
  }

  applyPitchWarping() {
    const intensity = this.createSmoothCurve(this.degradationLevel, "gentle");

    try {
      const modDepth = intensity * 0.0008;
      const modSpeed = 0.1 + intensity * 0.8;

      this.pitchLFOGain?.gain.setValueAtTime(
        modDepth,
        this.audioContext.currentTime,
      );
      this.pitchLFO?.frequency.setValueAtTime(
        modSpeed,
        this.audioContext.currentTime,
      );
    } catch (error) {
      console.warn("Error applying pitch warping:", error);
    }
  }

  createDistortionCurve(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      let output;

      if (amount < 3) {
        output = Math.tanh(amount * x * 1.2) * 0.85;
      } else if (amount < 6) {
        const asymmetry = 0.3;
        const driven = amount * x * 0.8;
        output =
          Math.sign(driven) *
          Math.pow(Math.abs(driven), 0.7 + asymmetry * Math.sign(driven));
        output = Math.tanh(output) * 0.8;
      } else {
        const clipLevel = (1 / amount) * 4;
        output = Math.max(-clipLevel, Math.min(clipLevel, x * amount * 0.6));
        output = Math.tanh(output * 2) * 0.7;
      }

      curve[i] = output;
    }

    return curve;
  }

  createBitCrushCurve(bitDepth) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const step = Math.pow(2, bitDepth - 1);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.round(x * step) / step;
    }

    return curve;
  }

  destroy() {
    if (this.isDestroyed) return;

    console.log("Destroying degradation engine...");
    this.isDestroyed = true;
    this.isReady = false;

    try {
      if (this.noiseGenerator) {
        try {
          this.noiseGenerator.stop();
          this.noiseGenerator.disconnect();
        } catch (e) {}
      }
      if (this.pitchLFO) {
        try {
          this.pitchLFO.stop();
          this.pitchLFO.disconnect();
        } catch (e) {}
      }

      const nodesToDisconnect = [
        this.inputGain,
        this.preFilter,
        this.bitCrusher,
        this.distortion,
        this.noiseGain,
        this.dropoutProcessor,
        this.postFilter,
        this.pitchShifter,
        this.outputGain,
        this.masterGain,
        this.pitchLFOGain,
      ];

      nodesToDisconnect.forEach((node) => {
        if (node) {
          try {
            node.disconnect();
          } catch (e) {}
        }
      });

      this.workletNodes.clear();

      this.degradationLevel = 0;

      console.log("Degradation engine destroyed successfully");
    } catch (error) {
      console.error("Error during destruction:", error);
    }
  }
}

window.AudioDegradationEngine = AudioDegradationEngine;
