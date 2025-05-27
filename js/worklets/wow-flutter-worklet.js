class WowFlutterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "wowDepth",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
      },
      {
        name: "flutterDepth",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
      },
    ];
  }

  constructor() {
    super();
    this.wowPhase = 0;
    this.flutterPhase = 0;
    this.delayBuffer = new Array(2)
      .fill(null)
      .map(() => new Float32Array(8192));
    this.delayIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input.length) return true;

    const wowDepth = parameters.wowDepth[0];
    const flutterDepth = parameters.flutterDepth[0];

    // Wow: slow pitch variations (0.5-2 Hz)
    this.wowPhase += ((0.5 + Math.random() * 1.5) * 2 * Math.PI) / sampleRate;
    if (this.wowPhase > 2 * Math.PI) this.wowPhase -= 2 * Math.PI;

    // Flutter: fast pitch variations (5-25 Hz)
    this.flutterPhase += ((5 + Math.random() * 20) * 2 * Math.PI) / sampleRate;
    if (this.flutterPhase > 2 * Math.PI) this.flutterPhase -= 2 * Math.PI;

    for (let channel = 0; channel < Math.min(input.length, 2); channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      const delayLine = this.delayBuffer[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        delayLine[this.delayIndex] = inputChannel[i];

        const wowMod = Math.sin(this.wowPhase) * wowDepth * 50;
        const flutterMod = Math.sin(this.flutterPhase) * flutterDepth * 10;
        const totalDelay = Math.max(1, 100 + wowMod + flutterMod);

        const delayedIndex =
          (this.delayIndex - totalDelay + delayLine.length) % delayLine.length;
        const intIndex = Math.floor(delayedIndex);
        const fracIndex = delayedIndex - intIndex;

        const sample1 = delayLine[intIndex];
        const sample2 = delayLine[(intIndex + 1) % delayLine.length];
        const delayedSample = sample1 + fracIndex * (sample2 - sample1);

        outputChannel[i] = delayedSample;

        this.delayIndex = (this.delayIndex + 1) % delayLine.length;
      }
    }

    return true;
  }
}

registerProcessor("wow-flutter-processor", WowFlutterProcessor);
