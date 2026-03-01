import { useState, useEffect, useCallback } from 'react';
import type { LocationConfig } from '../core/types';
import {
  getLocations as loadLocations,
  saveLocation,
  deleteLocation as removeLocation,
  createDefaultLocation,
  importConfig,
  exportConfig,
} from './storage';

const ACTIVE_LOCATION_KEY = 'deid-active-location-id';

function getStoredActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_LOCATION_KEY);
  } catch {
    return null;
  }
}

function setStoredActiveId(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(ACTIVE_LOCATION_KEY);
    } else {
      localStorage.setItem(ACTIVE_LOCATION_KEY, id);
    }
  } catch {
    // localStorage may be full or disabled; silently ignore
  }
}

function resolveActiveLocation(
  locations: LocationConfig[],
  preferredId: string | null
): LocationConfig | null {
  if (locations.length === 0) return null;
  if (preferredId) {
    const found = locations.find((loc) => loc.id === preferredId);
    if (found) return found;
  }
  return locations[0];
}

export function useLocations() {
  const [locations, setLocations] = useState<LocationConfig[]>(() => loadLocations());
  const [activeLocationId, setActiveLocationId] = useState<string | null>(() =>
    getStoredActiveId()
  );

  const activeLocation = resolveActiveLocation(locations, activeLocationId);

  // Keep the stored active ID in sync with the resolved active location
  useEffect(() => {
    const resolvedId = activeLocation?.id ?? null;
    if (resolvedId !== activeLocationId) {
      setActiveLocationId(resolvedId);
      setStoredActiveId(resolvedId);
    }
  }, [activeLocation, activeLocationId]);

  const setActiveLocation = useCallback((id: string | null) => {
    setActiveLocationId(id);
    setStoredActiveId(id);
  }, []);

  const addLocation = useCallback(
    (name: string, salt: string): LocationConfig => {
      const newLoc = createDefaultLocation(name, salt);
      saveLocation(newLoc);
      setLocations(prev => [...prev, newLoc]);
      setActiveLocation(newLoc.id);
      return newLoc;
    },
    [setActiveLocation]
  );

  const updateLocation = useCallback(
    (config: LocationConfig): void => {
      const updated = { ...config, updatedAt: new Date().toISOString() };
      saveLocation(updated);
      setLocations((prev) => prev.map((loc) => (loc.id === updated.id ? updated : loc)));
    },
    []
  );

  const deleteLocation = useCallback(
    (id: string): void => {
      removeLocation(id);
      setLocations((prev) => {
        const remaining = prev.filter((loc) => loc.id !== id);
        if (activeLocationId === id) {
          const next = remaining.length > 0 ? remaining[0].id : null;
          setActiveLocation(next);
        }
        return remaining;
      });
    },
    [activeLocationId, setActiveLocation]
  );

  const importLocations = useCallback(
    (json: string): LocationConfig[] => {
      const imported = importConfig(json);
      for (const loc of imported) {
        saveLocation(loc);
      }
      setLocations((prev) => {
        const updated = [...prev, ...imported];
        if (prev.length === 0 && imported.length > 0) {
          setActiveLocation(imported[0].id);
        }
        return updated;
      });
      return imported;
    },
    [setActiveLocation]
  );

  const exportLocations = useCallback((): string => {
    return exportConfig(locations);
  }, [locations]);

  return {
    locations,
    activeLocation,
    setActiveLocation,
    addLocation,
    updateLocation,
    deleteLocation,
    importLocations,
    exportLocations,
  };
}
