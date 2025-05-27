class BitCrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "bitDepth",
        defaultValue: 16,
        minValue: 1,
        maxValue: 16,
      },
      {
        name: "sampleRate",
        defaultValue: 44100,
        minValue: 1000,
        maxValue: 44100,
      },
    ];
  }

  constructor() {
    super();
    this.lastSampleTime = 0;
    this.lastSample = [0, 0];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input.length) return true;

    const bitDepth = parameters.bitDepth[0];
    const sampleRate = parameters.sampleRate[0];

    const step = Math.pow(2, bitDepth - 1);
    const sampleRateRatio = sampleRate / globalThis.sampleRate;

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        this.lastSampleTime += sampleRateRatio;

        if (this.lastSampleTime >= 1.0) {
          this.lastSampleTime -= 1.0;
          // Bit crush the sample
          this.lastSample[channel] = Math.round(inputChannel[i] * step) / step;
        }

        outputChannel[i] = this.lastSample[channel] || 0;
      }
    }

    return true;
  }
}

registerProcessor("bitcrusher-processor", BitCrusherProcessor);
