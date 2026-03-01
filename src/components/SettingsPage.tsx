import { useState, useCallback, useRef } from 'react';
import type { LocationConfig, ExportType } from '@/core/types';
import { ALL_SCHEMAS } from '@/core/schemas';
import RulesEditor from './RulesEditor';

interface SettingsPageProps {
  location: LocationConfig;
  onUpdateLocation: (config: LocationConfig) => void;
  onDeleteLocation: (id: string) => void;
  onAddLocation: (name: string, salt: string) => void;
  onExportAll: () => string;
  onExportLocation: () => string;
  onImportConfig: (json: string) => void;
}

type SettingsTab = 'location' | 'rules' | 'config';

const EXPORT_TYPES: ExportType[] = ['customers', 'payments', 'invoices', 'product_sales', 'contracts'];

function getExportDisplayName(exportType: ExportType): string {
  return ALL_SCHEMAS.find((s) => s.exportType === exportType)?.displayName ?? exportType;
}

// --- Location Settings ---

function LocationSettings({
  location,
  onUpdateLocation,
  onDeleteLocation,
  onAddLocation,
}: {
  location: LocationConfig;
  onUpdateLocation: (config: LocationConfig) => void;
  onDeleteLocation: (id: string) => void;
  onAddLocation: (name: string, salt: string) => void;
}) {
  const [name, setName] = useState(location.name);
  const [showSalt, setShowSalt] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSalt, setNewSalt] = useState('');

  const handleSaveName = useCallback(() => {
    if (name.trim() && name.trim() !== location.name) {
      onUpdateLocation({ ...location, name: name.trim() });
    }
  }, [name, location, onUpdateLocation]);

  const [copied, setCopied] = useState(false);
  const handleCopySalt = useCallback(() => {
    navigator.clipboard.writeText(location.salt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [location.salt]);

  const handleCreateNew = useCallback(() => {
    if (!newName.trim() || !newSalt.trim()) return;
    onAddLocation(newName.trim(), newSalt.trim());
    setShowNewForm(false);
    setNewName('');
    setNewSalt('');
  }, [newName, newSalt, onAddLocation]);

  return (
    <div className="space-y-6">
      {/* Location name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Location Name</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSaveName}
            disabled={!name.trim() || name.trim() === location.name}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>

      {/* Salt */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Salt</label>
        <div className="flex gap-2 items-center">
          <input
            type={showSalt ? 'text' : 'password'}
            value={location.salt}
            readOnly
            className="flex-1 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600"
          />
          <button
            onClick={() => setShowSalt((s) => !s)}
            className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
          >
            {showSalt ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={handleCopySalt}
            className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 border-t border-gray-200">
        {!showNewForm ? (
          <button
            onClick={() => setShowNewForm(true)}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            New Location
          </button>
        ) : (
          <div className="flex-1 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Location name"
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Salt</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSalt}
                  onChange={(e) => setNewSalt(e.target.value)}
                  placeholder="Salt"
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setNewSalt(crypto.randomUUID())}
                  className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300"
                >
                  Generate
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateNew}
                disabled={!newName.trim() || !newSalt.trim()}
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewForm(false);
                  setNewName('');
                  setNewSalt('');
                }}
                className="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Delete Location
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-600">Delete this location?</span>
            <button
              onClick={() => onDeleteLocation(location.id)}
              className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Rules Settings ---

function RulesSettings({
  location,
  onUpdateLocation,
}: {
  location: LocationConfig;
  onUpdateLocation: (config: LocationConfig) => void;
}) {
  const [activeType, setActiveType] = useState<ExportType>('customers');

  const handleRulesChange = useCallback(
    (rules: typeof location.preprocessingRules[ExportType]) => {
      onUpdateLocation({
        ...location,
        preprocessingRules: {
          ...location.preprocessingRules,
          [activeType]: rules,
        },
      });
    },
    [location, activeType, onUpdateLocation],
  );

  return (
    <div className="space-y-4">
      {/* Export type tabs */}
      <div className="flex gap-1 border-b border-gray-200 pb-0">
        {EXPORT_TYPES.map((et) => (
          <button
            key={et}
            onClick={() => setActiveType(et)}
            className={`rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors -mb-px border ${
              activeType === et
                ? 'border-gray-200 border-b-white bg-white text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {getExportDisplayName(et)}
            {location.preprocessingRules[et].length > 0 && (
              <span className="ml-1 inline-block rounded-full bg-blue-100 px-1.5 text-xs text-blue-600">
                {location.preprocessingRules[et].length}
              </span>
            )}
          </button>
        ))}
      </div>

      <RulesEditor
        key={activeType}
        rules={location.preprocessingRules[activeType]}
        onChange={handleRulesChange}
        exportType={activeType}
      />
    </div>
  );
}

// --- Config Management ---

function ConfigManagement({
  onExportAll,
  onExportLocation,
  onImportConfig,
}: {
  onExportAll: () => string;
  onExportLocation: () => string;
  onImportConfig: (json: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExportAll = useCallback(() => {
    const json = onExportAll();
    downloadJson(json, 'deid-config-all.json');
  }, [onExportAll]);

  const handleExportLocation = useCallback(() => {
    const json = onExportLocation();
    downloadJson(json, 'deid-config-location.json');
  }, [onExportLocation]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImportError(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          onImportConfig(reader.result as string);
        } catch (err) {
          setImportError(err instanceof Error ? err.message : 'Failed to import');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [onImportConfig],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
        <p className="text-sm text-amber-800">
          Exported config files contain your salt. Treat them as sensitive — do not share publicly.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExportAll}
          className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Export All Config
        </button>
        <button
          onClick={handleExportLocation}
          className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Export This Location
        </button>
        <button
          onClick={handleImportClick}
          className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Import Config
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {importError && <p className="text-xs text-red-600">{importError}</p>}
    </div>
  );
}

function downloadJson(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Main Component ---

export default function SettingsPage({
  location,
  onUpdateLocation,
  onDeleteLocation,
  onAddLocation,
  onExportAll,
  onExportLocation,
  onImportConfig,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('location');

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <div className="flex gap-1">
        <SettingsTabButton
          label="Location"
          isActive={activeTab === 'location'}
          onClick={() => setActiveTab('location')}
        />
        <SettingsTabButton
          label="Preprocessing Rules"
          isActive={activeTab === 'rules'}
          onClick={() => setActiveTab('rules')}
        />
        <SettingsTabButton
          label="Config Management"
          isActive={activeTab === 'config'}
          onClick={() => setActiveTab('config')}
        />
      </div>

      {/* Tab content */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {activeTab === 'location' && (
          <LocationSettings
            key={location.id}
            location={location}
            onUpdateLocation={onUpdateLocation}
            onDeleteLocation={onDeleteLocation}
            onAddLocation={onAddLocation}
          />
        )}
        {activeTab === 'rules' && (
          <RulesSettings
            key={location.id}
            location={location}
            onUpdateLocation={onUpdateLocation}
          />
        )}
        {activeTab === 'config' && (
          <ConfigManagement
            onExportAll={onExportAll}
            onExportLocation={onExportLocation}
            onImportConfig={onImportConfig}
          />
        )}
      </div>
    </div>
  );
}

function SettingsTabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  );
}
