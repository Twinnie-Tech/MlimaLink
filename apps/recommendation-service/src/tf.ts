import * as tfjs from '@tensorflow/tfjs';

/**
 * tfjs-node trains on native TensorFlow, but Google only publishes its binary for Linux;
 * elsewhere it has to be compiled with C++ build tools. Without it the same API runs in
 * plain JavaScript, which is slower but fine for a catalogue this size.
 */
function load(): typeof tfjs {
  try {
    return require('@tensorflow/tfjs-node');
  } catch {
    console.warn(
      'tfjs-node isn’t available, so recommendations train with the JavaScript backend.',
    );
    return tfjs;
  }
}

export const tf = load();
