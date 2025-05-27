class DropoutProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "intensity",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
      },
      {
        name: "frequency",
        defaultValue: 0,
        minValue: 0,
        maxValue: 20,
      },
    ];
  }

  constructor() {
    super();
    this.dropoutState = false;
    this.dropoutCounter = 0;
    this.dropoutLength = 0;
    this.randomCounter = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input.length) return true;

    const intensity = parameters.intensity[0];
    const frequency = parameters.frequency[0];

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        this.randomCounter++;

        if (!this.dropoutState && this.randomCounter % 1000 === 0) {
          if (Math.random() < intensity * frequency * 0.001) {
            this.dropoutState = true;
            this.dropoutCounter = 0;
            this.dropoutLength = Math.floor(10 + intensity * 500);
          }
        }

        if (this.dropoutState) {
          outputChannel[i] = inputChannel[i] * (0.1 + Math.random() * 0.2);
          this.dropoutCounter++;

          if (this.dropoutCounter >= this.dropoutLength) {
            this.dropoutState = false;
          }
        } else {
          outputChannel[i] = inputChannel[i];
        }
      }
    }

    return true;
  }
}

registerProcessor("dropout-processor", DropoutProcessor);
