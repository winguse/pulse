import { useState, useCallback } from "react";
import {
  saveSession,
  getSession,
  getSessionsList,
  deleteSession,
} from "../utils/db";
import type { PulsePeak } from "../dsp/PulseDetector";

export interface SessionEntry {
  id: number;
  name: string;
  averageBpm: number;
  duration: number;
  peaksCount: number;
}

export interface SessionsState {
  sessions: SessionEntry[];
}

export interface SessionsActions {
  loadSessionsList: () => Promise<void>;
  handleSaveSession: (params: {
    fileName: string;
    sampleRate: number;
    duration: number;
    originalAudio: Float32Array;
    filteredAudio: Float32Array;
    envelope: Float32Array;
    peaks: PulsePeak[];
    averageBpm: number;
  }) => Promise<void>;
  handleLoadSession: (
    id: number,
    onLoad: (data: {
      name: string;
      sampleRate: number;
      duration: number;
      originalAudio: Float32Array;
      filteredAudio: Float32Array;
      envelope: Float32Array;
      peaks: PulsePeak[];
      averageBpm: number;
    }) => void,
    onError: (msg: string) => void,
  ) => Promise<void>;
  handleDeleteSession: (id: number, e: React.MouseEvent) => Promise<void>;
}

export function useSessions(): SessionsState & SessionsActions {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);

  const loadSessionsList = useCallback(async () => {
    try {
      const list = await getSessionsList();
      setSessions(list);
    } catch (err: any) {
      console.error("Failed to load sessions list:", err);
    }
  }, []);

  const handleSaveSession = async (params: {
    fileName: string;
    sampleRate: number;
    duration: number;
    originalAudio: Float32Array;
    filteredAudio: Float32Array;
    envelope: Float32Array;
    peaks: PulsePeak[];
    averageBpm: number;
  }) => {
    try {
      await saveSession({
        name: params.fileName,
        timestamp: Date.now(),
        sampleRate: params.sampleRate,
        duration: params.duration,
        originalAudio: params.originalAudio,
        filteredAudio: params.filteredAudio,
        envelope: params.envelope,
        peaks: params.peaks,
        averageBpm: params.averageBpm,
      });
      alert("Session saved successfully to browser storage!");
      await loadSessionsList();
    } catch (err: any) {
      alert(`Error saving session: ${err.message}`);
    }
  };

  const handleLoadSession = async (
    id: number,
    onLoad: (data: any) => void,
    onError: (msg: string) => void,
  ) => {
    try {
      const sess = await getSession(id);
      onLoad(sess);
    } catch (err: any) {
      onError(`Failed to load session: ${err.message}`);
    }
  };

  const handleDeleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this saved session?")) return;
    try {
      await deleteSession(id);
      await loadSessionsList();
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  return {
    sessions,
    loadSessionsList,
    handleSaveSession,
    handleLoadSession,
    handleDeleteSession,
  };
}
