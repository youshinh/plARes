const PROCESSOR_NAME = 'plares-pcm-capture';

const WORKLET_SOURCE = `
class PlaresPcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const channel = input[0];
      const copied = new Float32Array(channel.length);
      copied.set(channel);
      this.port.postMessage(copied.buffer, [copied.buffer]);
    }
    const output = outputs[0];
    if (output) {
      for (let i = 0; i < output.length; i++) {
        output[i].fill(0);
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', PlaresPcmCaptureProcessor);
`;

const loadedContexts = new WeakSet<AudioContext>();

const ensureWorkletModule = async (context: AudioContext) => {
  if (loadedContexts.has(context)) return;
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await context.audioWorklet.addModule(url);
    loadedContexts.add(context);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export type PcmCaptureWorklet = {
  node: AudioWorkletNode;
  sinkGain: GainNode;
  disconnect: () => void;
};

export const createPcmCaptureWorklet = async (
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  onChunk: (chunk: Float32Array) => void,
): Promise<PcmCaptureWorklet> => {
  if (typeof AudioWorkletNode === 'undefined' || !context.audioWorklet) {
    throw new Error('AudioWorkletNode is not available in this browser');
  }

  await ensureWorkletModule(context);

  const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const sinkGain = context.createGain();
  sinkGain.gain.value = 0;

  node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    const data = event.data;
    if (!(data instanceof ArrayBuffer)) return;
    onChunk(new Float32Array(data));
  };

  source.connect(node);
  node.connect(sinkGain);
  sinkGain.connect(context.destination);

  return {
    node,
    sinkGain,
    disconnect: () => {
      node.port.onmessage = null;
      try {
        source.disconnect(node);
      } catch {
        // noop
      }
      try {
        node.disconnect();
      } catch {
        // noop
      }
      try {
        sinkGain.disconnect();
      } catch {
        // noop
      }
    },
  };
};

