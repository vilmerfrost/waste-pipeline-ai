"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Hook to persist state in localStorage
 * Handles SSR safely by only accessing localStorage on client
 */
export function useLocalStorage<T>(
  key: string, 
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    setIsInitialized(true);
  }, [key]);

  // Return a wrapped version of useState's setter function that persists to localStorage
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      setStoredValue(valueToStore);
      
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
}

/**
 * Hook specifically for tab persistence
 */
export function usePersistedTab(
  storageKey: string,
  defaultTab: string = "active"
): [string, (tab: string) => void] {
  const [tab, setTab] = useLocalStorage(storageKey, defaultTab);
  return [tab, setTab];
}

/**
 * Hook for filter preferences
 */
interface FilterState {
  status?: string;
  dateRange?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function usePersistedFilters(
  storageKey: string,
  defaultFilters: FilterState = {}
): [FilterState, (filters: FilterState) => void, () => void] {
  const [filters, setFilters] = useLocalStorage<FilterState>(storageKey, defaultFilters);
  
  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, [defaultFilters, setFilters]);
  
  return [filters, setFilters, resetFilters];
}

/**
 * Hook to track dismissed alerts/banners
 */
export function useDismissedAlerts(storageKey: string = "dismissed-alerts") {
  const [dismissed, setDismissed] = useLocalStorage<string[]>(storageKey, []);

  const dismiss = useCallback((alertId: string) => {
    setDismissed(prev => [...prev, alertId]);
  }, [setDismissed]);

  const isDismissed = useCallback((alertId: string) => {
    return dismissed.includes(alertId);
  }, [dismissed]);

  const reset = useCallback(() => {
    setDismissed([]);
  }, [setDismissed]);

  return { dismiss, isDismissed, reset };
}

