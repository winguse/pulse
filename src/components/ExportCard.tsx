import { Save, Download } from "lucide-react";

interface ExportCardProps {
  hasData: boolean;
  hasPeaks: boolean;
  onSaveSession: () => void;
  onDownloadWav: () => void;
  onDownloadPeaksCsv: () => void;
  onDownloadWaveformCsv: () => void;
}

export function ExportCard({
  hasData,
  hasPeaks,
  onSaveSession,
  onDownloadWav,
  onDownloadPeaksCsv,
  onDownloadWaveformCsv,
}: ExportCardProps) {
  return (
    <div className="panel-card export-card">
      <h2>Save &amp; Export Results</h2>
      <div className="export-actions">
        <button onClick={onSaveSession} className="btn btn-primary" disabled={!hasData}>
          <Save className="btn-icon" />
          <span>Save Session locally</span>
        </button>
        <button onClick={onDownloadWav} className="btn btn-secondary" disabled={!hasData}>
          <Download className="btn-icon" />
          <span>Download Cleaned WAV</span>
        </button>
        <button onClick={onDownloadPeaksCsv} disabled={!hasPeaks} className="btn btn-secondary">
          <Download className="btn-icon" />
          <span>Download Beats CSV</span>
        </button>
        <button onClick={onDownloadWaveformCsv} className="btn btn-secondary" disabled={!hasData}>
          <Download className="btn-icon" />
          <span>Download Waveform CSV</span>
        </button>
      </div>
    </div>
  );
}
