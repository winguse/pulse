import { useState, useEffect } from "react";
import type { DSPParams } from "../dsp/dspWrapper";
import { DEFAULT_DSP_PARAMS, DEFAULT_PULSE_PARAMS } from "./useAudioEngine";
import type { PulseParams } from "./useAudioEngine";

const SYSTEM_PRESET_KEYS = ["Default Settings", "Weak Pulse", "High Heart Rate"];

type PresetMap = Record<string, { dsp: DSPParams; pulse: PulseParams }>;

export function usePresets() {
  const [presets, setPresets] = useState<PresetMap>(() => {
    const saved = localStorage.getItem("pulse_presets");
    if (saved) return JSON.parse(saved);
    return {
      "Default Settings": { dsp: DEFAULT_DSP_PARAMS, pulse: DEFAULT_PULSE_PARAMS },
    };
  });
  const [selectedPresetKey, setSelectedPresetKey] = useState("Default Settings");
  const [newPresetName, setNewPresetName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);

  useEffect(() => {
    localStorage.setItem("pulse_presets", JSON.stringify(presets));
  }, [presets]);

  const handleSavePreset = () => {
    // Caller must pass dsp & pulse via handleSavePresetWith
    // This is a no-op placeholder; use handleSavePresetWith instead
  };

  const handleSavePresetWith = (name: string, dsp: DSPParams, pulse: PulseParams) => {
    if (!name.trim()) return;
    setPresets((prev) => ({ ...prev, [name.trim()]: { dsp, pulse } }));
    setSelectedPresetKey(name.trim());
    setNewPresetName("");
    setShowSaveModal(false);
  };

  const handleLoadPreset = (
    key: string,
    applyFn: (dsp: DSPParams, pulse: PulseParams) => void,
  ) => {
    const p = presets[key];
    if (p) {
      applyFn(p.dsp, p.pulse);
      setSelectedPresetKey(key);
    }
  };

  const handleDeletePreset = (key: string) => {
    if (SYSTEM_PRESET_KEYS.includes(key)) return;
    setPresets((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSelectedPresetKey("Default Settings");
  };

  const handleOverwritePreset = (currentDsp: DSPParams, currentPulse: PulseParams) => {
    if (SYSTEM_PRESET_KEYS.includes(selectedPresetKey)) return;
    setPresets((prev) => ({
      ...prev,
      [selectedPresetKey]: { dsp: currentDsp, pulse: currentPulse },
    }));
  };

  const isParametersChanged = (currentDsp: DSPParams, currentPulse: PulseParams): boolean => {
    const currentPreset = presets[selectedPresetKey];
    if (!currentPreset) return true;

    const dspKeys: (keyof DSPParams)[] = [
      "lowpassFreq", "highpassFreq", "notchFreq",
      "noiseThreshold", "noiseAttenuation", "agcEnabled", "agcDecay",
    ];
    if (dspKeys.some((k) => currentDsp[k] !== currentPreset.dsp[k])) return true;

    const pulseKeys = ["threshold", "maxThreshold", "minBpm", "maxBpm"] as (keyof PulseParams)[];
    return pulseKeys.some((k) => currentPulse[k] !== currentPreset.pulse[k]);
  };

  return {
    presets,
    selectedPresetKey,
    newPresetName,
    showSaveModal,
    showSaveDropdown,
    SYSTEM_PRESET_KEYS,
    setNewPresetName,
    setShowSaveModal,
    setShowSaveDropdown,
    // Expose save-with-params as the real save function
    handleSavePreset: handleSavePreset as any,
    handleSavePresetWith,
    handleLoadPreset,
    handleDeletePreset,
    handleOverwritePreset,
    isParametersChanged,
  };
}
