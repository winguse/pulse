import { Upload } from "lucide-react";

interface UploadCardProps {
  fileName: string;
  duration: number;
  sampleRate: number;
  dragActive: boolean;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function UploadCard({
  fileName,
  duration,
  sampleRate,
  dragActive,
  onDrag,
  onDrop,
  onFileInput,
}: UploadCardProps) {
  return (
    <div className="panel-card upload-card">
      <div
        className={`dropzone ${dragActive ? "active" : ""} ${fileName ? "has-file" : ""}`}
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={onDrop}
      >
        <input
          type="file"
          id="file-upload-input"
          className="file-input-hidden"
          accept="video/mp4,audio/*,video/*"
          onChange={onFileInput}
        />
        <label htmlFor="file-upload-input" className="dropzone-label">
          <Upload className="upload-icon" />
          {fileName ? (
            <div className="loaded-file-info">
              <span className="file-name">{fileName}</span>
              <span className="file-details">
                {duration.toFixed(1)}s @ {(sampleRate / 1000).toFixed(1)} kHz (Mono)
              </span>
              <span className="replace-prompt">Drop another file to replace</span>
            </div>
          ) : (
            <div className="upload-prompt">
              <span className="bold-prompt">Drag &amp; drop your media file here</span>
              <span className="sub-prompt">or click to browse local files</span>
            </div>
          )}
        </label>
      </div>
    </div>
  );
}
