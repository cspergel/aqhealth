import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import { mockGroups, mockProviders } from "./mockData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterOption {
  id: number;
  name: string;
}

interface GlobalFilterState {
  selectedGroup: FilterOption | null;
  selectedProvider: FilterOption | null;
  setGroup: (group: FilterOption | null) => void;
  setProvider: (provider: FilterOption | null) => void;
  clearFilters: () => void;
  /** Providers available given the current group selection */
  availableProviders: FilterOption[];
  /** All groups */
  availableGroups: FilterOption[];
}

// ---------------------------------------------------------------------------
// Derive filter-option lists from existing mock data
// ---------------------------------------------------------------------------

const groupOptions: FilterOption[] = mockGroups.map((g) => ({ id: g.id, name: g.name }));

const providerOptions: FilterOption[] = mockProviders.map((p) => ({ id: p.id, name: p.name }));

/** Map provider id -> group ids (a provider can appear in multiple groups) */
const providerToGroupIds: Record<number, number[]> = {};
mockGroups.forEach((g) => {
  g.provider_ids.forEach((pid) => {
    if (!providerToGroupIds[pid]) providerToGroupIds[pid] = [];
    providerToGroupIds[pid].push(g.id);
  });
});

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FilterContext = createContext<GlobalFilterState | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [selectedGroup, setSelectedGroup] = useState<FilterOption | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<FilterOption | null>(null);

  const setGroup = useCallback(
    (group: FilterOption | null) => {
      setSelectedGroup(group);
      // If a provider is currently selected and doesn't belong to the new group, clear it
      if (group && selectedProvider) {
        const providerGroupIds = providerToGroupIds[selectedProvider.id] || [];
        if (!providerGroupIds.includes(group.id)) {
          setSelectedProvider(null);
        }
      }
    },
    [selectedProvider],
  );

  const setProvider = useCallback((provider: FilterOption | null) => {
    setSelectedProvider(provider);
    // Auto-select the provider's primary group (first group they belong to)
    if (provider) {
      const gids = providerToGroupIds[provider.id];
      if (gids && gids.length > 0) {
        const g = groupOptions.find((go) => go.id === gids[0]);
        if (g) setSelectedGroup(g);
      }
    }
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedGroup(null);
    setSelectedProvider(null);
  }, []);

  const availableProviders = useMemo(() => {
    if (!selectedGroup) return providerOptions;
    const group = mockGroups.find((g) => g.id === selectedGroup.id);
    if (!group) return providerOptions;
    return providerOptions.filter((p) => group.provider_ids.includes(p.id));
  }, [selectedGroup]);

  const value = useMemo<GlobalFilterState>(
    () => ({
      selectedGroup,
      selectedProvider,
      setGroup,
      setProvider,
      clearFilters,
      availableProviders,
      availableGroups: groupOptions,
    }),
    [selectedGroup, selectedProvider, setGroup, setProvider, clearFilters, availableProviders],
  );

  // Sync to localStorage so the axios interceptor in api.ts can read the values
  useEffect(() => {
    if (selectedGroup) {
      localStorage.setItem("global_filter_group_id", String(selectedGroup.id));
    } else {
      localStorage.removeItem("global_filter_group_id");
    }
    if (selectedProvider) {
      localStorage.setItem("global_filter_provider_id", String(selectedProvider.id));
    } else {
      localStorage.removeItem("global_filter_provider_id");
    }
  }, [selectedGroup, selectedProvider]);

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useGlobalFilter(): GlobalFilterState {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useGlobalFilter must be used inside <FilterProvider>");
  return ctx;
}
