/**
 * Converts a Float32Array of audio samples (mono) into a 16-bit PCM WAV file Blob.
 */
export function float32ToWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // 1. RIFF Identifier
  writeString(view, 0, 'RIFF');
  // 2. File size (36 + data size)
  view.setUint32(4, 36 + samples.length * 2, true);
  // 3. RIFF Type
  writeString(view, 8, 'WAVE');
  // 4. Format Chunk Identifier
  writeString(view, 12, 'fmt ');
  // 5. Format Chunk Length (16 for PCM)
  view.setUint32(16, 16, true);
  // 6. Audio Format (1 = uncompressed PCM)
  view.setUint16(20, 1, true);
  // 7. Channel Count (1 = mono)
  view.setUint16(22, 1, true);
  // 8. Sample Rate
  view.setUint32(24, sampleRate, true);
  // 9. Byte Rate (SampleRate * BlockAlign)
  view.setUint32(28, sampleRate * 2, true);
  // 10. Block Align (ChannelCount * BytesPerSample)
  view.setUint16(32, 2, true);
  // 11. Bits Per Sample (16-bit PCM)
  view.setUint16(34, 16, true);
  // 12. Data Chunk Identifier
  writeString(view, 36, 'data');
  // 13. Data Chunk Length (samples * bytes per sample)
  view.setUint32(40, samples.length * 2, true);

  // 14. Write 16-bit PCM samples
  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: 'audio/wav' });
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

/**
 * Helper to write ASCII strings to the DataView
 */
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
