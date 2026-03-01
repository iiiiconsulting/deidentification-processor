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
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        {/* Title */}
        <h1 className="text-lg font-semibold text-gray-900">Deidentification Processor</h1>

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
