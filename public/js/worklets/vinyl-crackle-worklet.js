class VinylCrackleProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "intensity",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
      },
      {
        name: "density",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
      },
    ];
  }

  constructor() {
    super();
    this.crackleBuffer = [];
    this.bufferIndex = 0;
    this.lastCrackle = 0;
    this.crackleLength = 0;

    for (let i = 0; i < 1000; i++) {
      this.crackleBuffer.push((Math.random() - 0.5) * 2);
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input.length) return true;

    const intensity = parameters.intensity[0];
    const density = parameters.density[0];

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        let sample = inputChannel[i];

        if (intensity > 0) {
          if (Math.random() < density * intensity * 0.001) {
            this.lastCrackle =
              this.crackleBuffer[
                Math.floor(Math.random() * this.crackleBuffer.length)
              ];
            this.crackleLength = Math.floor(1 + intensity * 10);
          }

          if (this.crackleLength > 0) {
            sample += this.lastCrackle * intensity * 0.1;
            this.crackleLength--;
          }

          sample += (Math.random() - 0.5) * intensity * 0.02;
        }

        outputChannel[i] = sample;
      }
    }

    return true;
  }
}

registerProcessor("vinyl-crackle-processor", VinylCrackleProcessor);
