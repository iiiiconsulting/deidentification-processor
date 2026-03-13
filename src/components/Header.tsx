import { useState } from 'react';
import type { LocationConfig, AppPage } from '@/core/types';

interface HeaderProps {
  locations: LocationConfig[];
  activeLocation: LocationConfig;
  onLocationChange: (id: string) => void;
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
}

export default function Header({
  locations,
  activeLocation,
  onLocationChange,
  currentPage,
  onPageChange,
}: HeaderProps) {
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        {/* Title + privacy badge */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Deidentification Processor</h1>
          <button
            onClick={() => setShowPrivacyDetail(!showPrivacyDetail)}
            className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
            title="Click for details"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            Runs offline
          </button>
        </div>
      {showPrivacyDetail && (
        <div className="absolute top-14 left-6 right-6 mx-auto max-w-5xl z-50">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 shadow-lg">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium mb-1">Your data never leaves this browser.</p>
                <ul className="list-disc ml-4 space-y-0.5 text-green-700">
                  <li>All CSV processing and hashing happens locally in your browser</li>
                  <li>No servers, APIs, or network requests are made</li>
                  <li>A Content-Security-Policy blocks all outbound connections</li>
                  <li>Verify: open DevTools &gt; Network tab — you'll see zero requests after page load</li>
                </ul>
              </div>
              <button onClick={() => setShowPrivacyDetail(false)} className="text-green-600 hover:text-green-800 ml-4">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Location selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="location-select" className="text-sm text-gray-500">
            Location:
          </label>
          <select
            id="location-select"
            value={activeLocation.id}
            onChange={(e) => onLocationChange(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Navigation tabs */}
        <nav className="flex gap-1">
          <TabButton
            label="Process"
            isActive={currentPage === 'process'}
            onClick={() => onPageChange('process')}
          />
          <TabButton
            label="Settings"
            isActive={currentPage === 'settings'}
            onClick={() => onPageChange('settings')}
          />
        </nav>
      </div>
    </header>
  );
}

function TabButton({
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
