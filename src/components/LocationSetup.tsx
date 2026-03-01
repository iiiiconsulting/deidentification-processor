import { useState, useRef, useCallback } from 'react';

interface LocationSetupProps {
  onCreateLocation: (name: string, salt: string) => void;
  onImportConfig: (json: string) => void;
}

export default function LocationSetup({ onCreateLocation, onImportConfig }: LocationSetupProps) {
  const [name, setName] = useState('');
  const [salt, setSalt] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateSalt = useCallback(() => {
    setSalt(crypto.randomUUID());
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !salt.trim()) return;
      onCreateLocation(name.trim(), salt.trim());
    },
    [name, salt, onCreateLocation],
  );

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
          setImportError(err instanceof Error ? err.message : 'Failed to import configuration');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [onImportConfig],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
        <h2 className="mb-1 text-xl font-semibold text-gray-900">Get Started</h2>
        <p className="mb-6 text-sm text-gray-500">
          Create a location to begin deidentifying CSV files.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="loc-name" className="block text-sm font-medium text-gray-700 mb-1">
              Location Name
            </label>
            <input
              id="loc-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Office"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="loc-salt" className="block text-sm font-medium text-gray-700 mb-1">
              Salt
            </label>
            <div className="flex gap-2">
              <input
                id="loc-salt"
                type="text"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                placeholder="Enter or generate a salt"
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={generateSalt}
                className="shrink-0 rounded bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                Generate
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim() || !salt.trim()}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Location
          </button>
        </form>

        <div className="mt-6 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={handleImportClick}
            className="w-full rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
          {importError && (
            <p className="mt-2 text-xs text-red-600">{importError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
