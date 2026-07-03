/**
 * Decodes and extracts mono audio channel data from an audio or video file (like MP4).
 * Utilizes the browser's native AudioContext decoders.
 */
export async function extractAudioFromFile(file: File): Promise<{
  audioData: Float32Array;
  sampleRate: number;
  duration: number;
}> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  // Create an offline or standard AudioContext to decode the file
  const audioCtx = new AudioContextClass();
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // decodeAudioData handles many containers (MP4 video, WebM video, WAV, MP3, M4A, etc.)
    // as long as the audio codec inside is supported (e.g., AAC, MP3, PCM).
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    
    if (length === 0) {
      throw new Error('The decoded audio track is empty.');
    }

    // Convert multi-channel audio to mono (averaging channels) for pulse analysis
    let audioData: Float32Array;
    if (numChannels === 1) {
      // Direct copy to ensure independence from AudioBuffer lifecycle
      audioData = new Float32Array(audioBuffer.getChannelData(0));
    } else {
      const mono = new Float32Array(length);
      const channels: Float32Array[] = [];
      for (let c = 0; c < numChannels; c++) {
        channels.push(audioBuffer.getChannelData(c));
      }
      
      for (let i = 0; i < length; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) {
          sum += channels[c][i];
        }
        mono[i] = sum / numChannels;
      }
      audioData = mono;
    }

    return {
      audioData,
      sampleRate,
      duration,
    };
  } catch (error: any) {
    console.error('Error decoding audio:', error);
    throw new Error(
      `Failed to extract audio from the file. Please ensure it has a valid audio track (e.g., AAC in MP4). Details: ${error?.message || error}`
    );
  } finally {
    // Release the system audio resources
    await audioCtx.close();
  }
}
