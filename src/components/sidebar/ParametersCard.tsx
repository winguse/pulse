import { useState } from "react";
import type { DSPParams } from "../../dsp/dspWrapper";
import type { PulseParams } from "../../hooks/useAudioEngine";

interface PresetsBarProps {
  presets: Record<string, { dsp: DSPParams; pulse: PulseParams }>;
  selectedPresetKey: string;
  systemPresetKeys: string[];
  isChanged: boolean;
  onLoad: (key: string) => void;
  onSaveAs: () => void;
  onOverwrite: () => void;
  onDelete: (key: string) => void;
}

function PresetsBar({
  presets,
  selectedPresetKey,
  systemPresetKeys,
  isChanged,
  onLoad,
  onSaveAs,
  onOverwrite,
  onDelete,
}: PresetsBarProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const isSystem = systemPresetKeys.includes(selectedPresetKey);

  return (
    <div className="presets-section">
      <div className="preset-actions-row">
        <select
          value={selectedPresetKey}
          onChange={(e) => onLoad(e.target.value)}
          className="preset-select"
        >
          {Object.keys(presets).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>

        {isChanged ? (
          isSystem ? (
            <button onClick={onSaveAs} className="preset-btn-save" title="Save as new preset">
              Save As...
            </button>
          ) : (
            <div className="preset-split-container">
              <button onClick={onOverwrite} className="preset-btn-split-main" title="Overwrite preset">
                Save
              </button>
              <button
                onClick={() => setShowDropdown((v) => !v)}
                className="preset-btn-split-arrow"
                title="More options"
              >
                ▼
              </button>
              {showDropdown && (
                <div className="preset-dropdown-menu">
                  <button
                    onClick={() => {
                      onSaveAs();
                      setShowDropdown(false);
                    }}
                    className="preset-dropdown-item font-mono"
                  >
                    Save as New...
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          <button
            onClick={() => onDelete(selectedPresetKey)}
            disabled={isSystem}
            className="preset-btn-delete"
            title="Delete preset"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ─── DSP Tab ──────────────────────────────────────────────────────────────────

interface DspTabProps {
  dspParams: DSPParams;
  onChange: React.Dispatch<React.SetStateAction<DSPParams>>;
}

function DspTab({ dspParams, onChange }: DspTabProps) {
  return (
    <div className="tab-pane">
      {/* Pass filter cutoff range */}
      <div className="param-group">
        <label>
          <span>Pass Filter Cutoff Range</span>
          <span className="param-value">
            {dspParams.highpassFreq} Hz – {dspParams.lowpassFreq} Hz
          </span>
        </label>
        <div className="double-slider-wrapper">
          <div className="double-slider-track" />
          <div
            className="double-slider-range"
            style={{
              left: `${((dspParams.highpassFreq - 5) / 345) * 100}%`,
              width: `${((dspParams.lowpassFreq - dspParams.highpassFreq) / 345) * 100}%`,
            }}
          />
          <input
            type="range" min="5" max="350"
            value={dspParams.highpassFreq}
            onChange={(e) => {
              const val = Math.min(dspParams.lowpassFreq - 10, parseInt(e.target.value) || 5);
              onChange((prev) => ({ ...prev, highpassFreq: val }));
            }}
            className="double-slider-input"
          />
          <input
            type="range" min="5" max="350"
            value={dspParams.lowpassFreq}
            onChange={(e) => {
              const val = Math.max(dspParams.highpassFreq + 10, parseInt(e.target.value) || 350);
              onChange((prev) => ({ ...prev, lowpassFreq: val }));
            }}
            className="double-slider-input"
          />
        </div>
        <span className="param-desc">
          High-Pass removes subsonic drift; Low-Pass cuts high-frequency hiss.
        </span>
      </div>

      {/* Notch filter */}
      <div className="param-group">
        <label><span>AC Powerline Hum Notch Filter</span></label>
        <select
          value={dspParams.notchFreq}
          onChange={(e) => onChange((prev) => ({ ...prev, notchFreq: parseInt(e.target.value) }))}
          className="custom-select"
        >
          <option value={0}>Disabled</option>
          <option value={50}>50 Hz (Europe/Asia Hum)</option>
          <option value={60}>60 Hz (US Power Hum)</option>
        </select>
        <span className="param-desc">Cuts electric static hum noise at precise grid frequencies.</span>
      </div>

      <div className="divider" />

      {/* Noise gate threshold */}
      <div className="param-group">
        <label>
          <span>Noise Gate Threshold</span>
          <span className="param-value">{dspParams.noiseThreshold.toFixed(3)}</span>
        </label>
        <input
          type="range" min="0.001" max="0.08" step="0.001"
          value={dspParams.noiseThreshold}
          onChange={(e) => onChange((prev) => ({ ...prev, noiseThreshold: parseFloat(e.target.value) }))}
        />
        <span className="param-desc">Envelopes below this level will be quieted.</span>
      </div>

      {/* Noise reduction strength */}
      <div className="param-group">
        <label>
          <span>Noise Reduction Strength</span>
          <span className="param-value">{Math.round(dspParams.noiseAttenuation * 100)}%</span>
        </label>
        <input
          type="range" min="0.0" max="1.0" step="0.05"
          value={dspParams.noiseAttenuation}
          onChange={(e) => onChange((prev) => ({ ...prev, noiseAttenuation: parseFloat(e.target.value) }))}
        />
        <span className="param-desc">Volume reduction applied to gated background hiss.</span>
      </div>

      <div className="divider" />

      {/* AGC toggle */}
      <div className="param-group-toggle">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={dspParams.agcEnabled}
            onChange={(e) => onChange((prev) => ({ ...prev, agcEnabled: e.target.checked }))}
          />
          <span className="toggle-label-text">Enable Automatic Gain Control (AGC)</span>
        </label>
        <span className="param-desc">Boosts faint heartbeats dynamically while avoiding clipping.</span>
      </div>

      {dspParams.agcEnabled && (
        <div className="param-group">
          <label>
            <span>AGC Decay Speed</span>
            <span className="param-value">{dspParams.agcDecay.toFixed(1)}s</span>
          </label>
          <input
            type="range" min="0.5" max="3.0" step="0.1"
            value={dspParams.agcDecay}
            onChange={(e) => onChange((prev) => ({ ...prev, agcDecay: parseFloat(e.target.value) }))}
          />
          <span className="param-desc">Rate at which gain adapts back to quiet parts.</span>
        </div>
      )}
    </div>
  );
}

// ─── Detector Tab ─────────────────────────────────────────────────────────────

interface DetectorTabProps {
  pulseParams: PulseParams;
  onChange: React.Dispatch<React.SetStateAction<PulseParams>>;
}

function DetectorTab({ pulseParams, onChange }: DetectorTabProps) {
  const mode = pulseParams.mode ?? "peak";

  return (
    <div className="tab-pane">
      {/* Detection method */}
      <div className="param-group">
        <label><span>Detection Method</span></label>
        <select
          value={mode}
          onChange={(e) => onChange((prev) => ({ ...prev, mode: e.target.value as "peak" | "frequency" }))}
          className="custom-select"
        >
          <option value="peak">Peak Amplitude (Default)</option>
          <option value="frequency">Sound Frequency Resonator</option>
        </select>
        <span className="param-desc">
          Peak Amplitude scans overall volume peaks; Frequency Resonator targets specific heartbeat pitch ranges.
        </span>
      </div>

      <div className="divider" />

      {mode === "peak" ? (
        <>
        <div className="param-group">
          <label>
            <span>Peak Detection Range</span>
            <span className="param-value">
              {Math.round(pulseParams.threshold * 100)}% – {Math.round((pulseParams.maxThreshold ?? 1.0) * 100)}%
            </span>
          </label>
          <div className="double-slider-wrapper">
            <div className="double-slider-track" />
            <div
              className="double-slider-range"
              style={{
                left: `${((pulseParams.threshold - 0.05) / 0.95) * 100}%`,
                width: `${(((pulseParams.maxThreshold ?? 1.0) - pulseParams.threshold) / 0.95) * 100}%`,
              }}
            />
            <input
              type="range" min="0.05" max="1.00" step="0.01"
              value={pulseParams.threshold}
              onChange={(e) => {
                const val = Math.min((pulseParams.maxThreshold ?? 1.0) - 0.01, parseFloat(e.target.value) || 0.05);
                onChange((prev) => ({ ...prev, threshold: val }));
              }}
              className="double-slider-input"
            />
            <input
              type="range" min="0.05" max="1.00" step="0.01"
              value={pulseParams.maxThreshold ?? 1.0}
              onChange={(e) => {
                const val = Math.max(pulseParams.threshold + 0.01, parseFloat(e.target.value) || 1.0);
                onChange((prev) => ({ ...prev, maxThreshold: val }));
              }}
              className="double-slider-input"
            />
          </div>
          <span className="param-desc">Filters out spikes below the minimum or above the maximum relative height.</span>
        </div>
        </>
      ) : (
        <div className="param-group">
          <label>
            <span>Detection Frequency Range</span>
            <span className="param-value">
              {pulseParams.minFreq ?? 20} Hz – {pulseParams.maxFreq ?? 300} Hz
            </span>
          </label>
          <div className="double-slider-wrapper">
            <div className="double-slider-track" />
            <div
              className="double-slider-range"
              style={{
                left: `${(((pulseParams.minFreq ?? 20) - 20) / 280) * 100}%`,
                width: `${(((pulseParams.maxFreq ?? 300) - (pulseParams.minFreq ?? 20)) / 280) * 100}%`,
              }}
            />
            <input
              type="range" min="20" max="300"
              value={pulseParams.minFreq ?? 20}
              onChange={(e) => {
                const val = Math.min((pulseParams.maxFreq ?? 300) - 5, parseInt(e.target.value) || 20);
                onChange((prev) => ({ ...prev, minFreq: val }));
              }}
              className="double-slider-input"
            />
            <input
              type="range" min="20" max="300"
              value={pulseParams.maxFreq ?? 300}
              onChange={(e) => {
                const val = Math.max((pulseParams.minFreq ?? 20) + 5, parseInt(e.target.value) || 300);
                onChange((prev) => ({ ...prev, maxFreq: val }));
              }}
              className="double-slider-input"
            />
          </div>
          <span className="param-desc">Defines bandpass filter range to isolate heartbeats.</span>
        </div>
      )}

      <div className="divider" />

      {/* BPM search range */}
      <div className="param-group">
        <label>
          <span>Heart Rate Search Range</span>
          <span className="param-value">{pulseParams.minBpm} BPM – {pulseParams.maxBpm} BPM</span>
        </label>
        <div className="double-slider-wrapper">
          <div className="double-slider-track" />
          <div
            className="double-slider-range"
            style={{
              left: `${((pulseParams.minBpm - 40) / 200) * 100}%`,
              width: `${((pulseParams.maxBpm - pulseParams.minBpm) / 200) * 100}%`,
            }}
          />
          <input
            type="range" min="40" max="240"
            value={pulseParams.minBpm}
            onChange={(e) => {
              const val = Math.min(pulseParams.maxBpm - 10, parseInt(e.target.value) || 40);
              onChange((prev) => ({ ...prev, minBpm: val }));
            }}
            className="double-slider-input"
          />
          <input
            type="range" min="40" max="240"
            value={pulseParams.maxBpm}
            onChange={(e) => {
              const val = Math.max(pulseParams.minBpm + 10, parseInt(e.target.value) || 240);
              onChange((prev) => ({ ...prev, maxBpm: val }));
            }}
            className="double-slider-input"
          />
        </div>
        <span className="param-desc">Defines search bounds for pulse frequency verification.</span>
      </div>
    </div>
  );
}

// ─── Main ParametersCard export ───────────────────────────────────────────────

interface ParametersCardProps {
  dspParams: DSPParams;
  pulseParams: PulseParams;
  onDspChange: React.Dispatch<React.SetStateAction<DSPParams>>;
  onPulseChange: React.Dispatch<React.SetStateAction<PulseParams>>;
  presets: Record<string, { dsp: DSPParams; pulse: PulseParams }>;
  selectedPresetKey: string;
  systemPresetKeys: string[];
  isParametersChanged: boolean;
  onLoadPreset: (key: string) => void;
  onSaveAsPreset: () => void;
  onOverwritePreset: () => void;
  onDeletePreset: (key: string) => void;
}

export function ParametersCard({
  dspParams,
  pulseParams,
  onDspChange,
  onPulseChange,
  presets,
  selectedPresetKey,
  systemPresetKeys,
  isParametersChanged,
  onLoadPreset,
  onSaveAsPreset,
  onOverwritePreset,
  onDeletePreset,
}: ParametersCardProps) {
  const [activeTab, setActiveTab] = useState<"dsp" | "detector">("dsp");

  return (
    <div className="panel-card tabs-card">
      <PresetsBar
        presets={presets}
        selectedPresetKey={selectedPresetKey}
        systemPresetKeys={systemPresetKeys}
        isChanged={isParametersChanged}
        onLoad={onLoadPreset}
        onSaveAs={onSaveAsPreset}
        onOverwrite={onOverwritePreset}
        onDelete={onDeletePreset}
      />

      <div className="tab-headers">
        <button
          className={`tab-btn ${activeTab === "dsp" ? "active" : ""}`}
          onClick={() => setActiveTab("dsp")}
        >
          1. Noise &amp; Filtering
        </button>
        <button
          className={`tab-btn ${activeTab === "detector" ? "active" : ""}`}
          onClick={() => setActiveTab("detector")}
        >
          2. Pulse Detection
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "dsp" ? (
          <DspTab dspParams={dspParams} onChange={onDspChange} />
        ) : (
          <DetectorTab pulseParams={pulseParams} onChange={onPulseChange} />
        )}
      </div>
    </div>
  );
}
