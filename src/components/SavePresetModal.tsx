interface SavePresetModalProps {
  presetName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function SavePresetModal({
  presetName,
  onNameChange,
  onSave,
  onCancel,
}: SavePresetModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>Save Preset Profile</h3>
        <p>
          Specify a profile name to save the current filter and detection parameters.
        </p>

        <input
          type="text"
          placeholder="Profile name (e.g. Weak Pulse)..."
          value={presetName}
          onChange={(e) => onNameChange(e.target.value)}
          className="preset-name-input"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && presetName.trim()) onSave();
          }}
        />

        <div className="modal-actions">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={onSave} disabled={!presetName.trim()} className="btn btn-primary">
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
