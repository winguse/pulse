import type { PulsePeak } from '../dsp/PulseDetector';

/**
 * Downloads a text file in the browser.
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports detected heartbeat peaks to a CSV file.
 */
export function exportPeaksToCSV(peaks: PulsePeak[], filename: string) {
  const headers = ['Beat Index', 'Timestamp (s)', 'Envelope Amplitude', 'Instantaneous BPM'];
  const rows = peaks.map((p, idx) => [
    idx + 1,
    p.time.toFixed(3),
    p.amplitude.toFixed(5),
    p.bpm ? p.bpm.toFixed(1) : 'N/A',
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
  downloadFile(csvContent, `${baseName}_heart_beats.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Exports downsampled waveform data (filtered signal & envelope) to CSV.
 * Downsampling ensures file sizes are small and loadable in spreadsheet editors.
 */
export function exportWaveformDataToCSV(
  filteredAudio: Float32Array,
  envelope: Float32Array,
  originalSampleRate: number,
  filename: string,
  targetSampleRate: number = 200 // Downsample to 200Hz
) {
  const step = Math.max(1, Math.floor(originalSampleRate / targetSampleRate));
  const headers = ['Time (s)', 'Filtered Amplitude', 'Envelope'];
  const rows: string[] = [];

  for (let i = 0; i < filteredAudio.length; i += step) {
    const time = i / originalSampleRate;
    const amp = filteredAudio[i];
    const env = envelope[i];
    rows.push(`${time.toFixed(3)},${amp.toFixed(5)},${env.toFixed(5)}`);
  }

  const csvContent = [headers.join(','), ...rows].join('\n');
  const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
  downloadFile(csvContent, `${baseName}_waveform_data.csv`, 'text/csv;charset=utf-8;');
}
