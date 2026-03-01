import { useState, useCallback } from 'react';
import type { AppPage } from '@/core/types';
import { exportSingleLocation } from '@/config/storage';
import { useLocations } from '@/config/hooks';
import LocationSetup from '@/components/LocationSetup';
import Header from '@/components/Header';
import ProcessPage from '@/components/ProcessPage';
import SettingsPage from '@/components/SettingsPage';

export default function App() {
  const {
    locations,
    activeLocation,
    setActiveLocation,
    addLocation,
    updateLocation,
    deleteLocation,
    importLocations,
    exportLocations,
  } = useLocations();

  const [currentPage, setCurrentPage] = useState<AppPage>('process');

  const handleCreateLocation = useCallback(
    (name: string, salt: string) => {
      addLocation(name, salt);
    },
    [addLocation],
  );

  const handleImportConfig = useCallback(
    (json: string) => {
      importLocations(json);
    },
    [importLocations],
  );

  const handleExportLocation = useCallback((): string => {
    if (!activeLocation) return '[]';
    return exportSingleLocation(activeLocation);
  }, [activeLocation]);

  // No locations: show first-run setup
  if (!activeLocation) {
    return (
      <LocationSetup
        onCreateLocation={handleCreateLocation}
        onImportConfig={handleImportConfig}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        locations={locations}
        activeLocation={activeLocation}
        onLocationChange={setActiveLocation}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
      />
      <main className="mx-auto max-w-5xl px-6 py-8">
        {currentPage === 'process' && <ProcessPage location={activeLocation} />}
        {currentPage === 'settings' && (
          <SettingsPage
            location={activeLocation}
            onUpdateLocation={updateLocation}
            onDeleteLocation={deleteLocation}
            onAddLocation={(name, salt) => addLocation(name, salt)}
            onExportAll={exportLocations}
            onExportLocation={handleExportLocation}
            onImportConfig={handleImportConfig}
          />
        )}
      </main>
    </div>
  );
}
