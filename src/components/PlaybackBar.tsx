import { Play, Pause, Volume2, Clock } from "lucide-react";

interface PlaybackBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  volume: number;
  yScale: number;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (vol: number) => void;
  onYScaleChange: (scale: number) => void;
}

export function PlaybackBar({
  isPlaying,
  currentTime,
  duration,
  playbackSpeed,
  volume,
  yScale,
  onPlayPause,
  onSpeedChange,
  onVolumeChange,
  onYScaleChange,
}: PlaybackBarProps) {
  return (
    <div className="playback-bar bg-slate-950/60 rounded-xl p-3 border border-slate-800/80">
      <div className="flex-controls">
        <button
          onClick={onPlayPause}
          className={`play-btn ${isPlaying ? "playing" : ""}`}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current" />
          )}
        </button>

        <div className="time-display text-sm font-mono text-slate-300">
          <Clock className="w-4 h-4 text-slate-500" />
          <span>{currentTime.toFixed(2)}s</span>
          <span className="time-separator">/</span>
          <span className="text-slate-500">{duration.toFixed(2)}s</span>
        </div>

        <div className="speed-control flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">Speed:</span>
          <input
            type="range" min="0.1" max="2.0" step="0.05"
            value={playbackSpeed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="speed-slider"
          />
          <span className="text-xs font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded text-cyan-400 w-12 text-center">
            {playbackSpeed.toFixed(2)}x
          </span>
        </div>

        <div className="volume-control flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-slate-400" />
          <input
            type="range" min="0.0" max="20.0" step="0.1"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            style={{ width: "80px", height: "4px" }}
          />
          <span className="text-xs font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded text-cyan-400 w-16 text-center">
            {volume <= 1.0 ? `${Math.round(volume * 100)}%` : `${volume.toFixed(1)}x`}
          </span>
        </div>

        <div className="y-scale-control flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">Scale:</span>
          <input
            type="range" min="1" max="100" step="1"
            value={yScale}
            onChange={(e) => onYScaleChange(parseFloat(e.target.value))}
            style={{ width: "80px", height: "4px" }}
            title="Y-Axis Amplitude Zoom (Gain)"
          />
          <span className="text-xs font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded text-cyan-400 w-12 text-center">
            {yScale.toFixed(0)}x
          </span>
        </div>
      </div>
    </div>
  );
}
