"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

interface UseUnsavedChangesOptions {
  hasUnsavedChanges: boolean;
  message?: string;
}

/**
 * Hook to warn users before leaving a page with unsaved changes
 * Handles both browser navigation (back/forward/close) and Next.js navigation
 */
export function useUnsavedChanges({ 
  hasUnsavedChanges, 
  message = "Du har osparade ändringar. Är du säker på att du vill lämna sidan?" 
}: UseUnsavedChangesOptions) {
  const router = useRouter();

  // Handle browser back/forward/close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges, message]);

  // Function to safely navigate with confirmation
  const safeNavigate = useCallback((href: string) => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(message);
      if (confirmed) {
        router.push(href);
      }
    } else {
      router.push(href);
    }
  }, [hasUnsavedChanges, message, router]);

  return { safeNavigate };
}

/**
 * Hook to track form changes
 * Returns hasChanges boolean and functions to mark clean/dirty
 */
export function useFormChanges<T>(initialData: T) {
  const [originalData, setOriginalData] = useState<string>(JSON.stringify(initialData));
  const [currentData, setCurrentData] = useState<T>(initialData);
  const [hasChanges, setHasChanges] = useState(false);

  // Update current data and check for changes
  const updateData = useCallback((newData: T) => {
    setCurrentData(newData);
    setHasChanges(JSON.stringify(newData) !== originalData);
  }, [originalData]);

  // Mark form as clean (after save)
  const markClean = useCallback(() => {
    setOriginalData(JSON.stringify(currentData));
    setHasChanges(false);
  }, [currentData]);

  // Reset to original data
  const reset = useCallback(() => {
    const original = JSON.parse(originalData) as T;
    setCurrentData(original);
    setHasChanges(false);
  }, [originalData]);

  // Update original data (when loading new document)
  const setInitialData = useCallback((data: T) => {
    setOriginalData(JSON.stringify(data));
    setCurrentData(data);
    setHasChanges(false);
  }, []);

  return {
    data: currentData,
    hasChanges,
    updateData,
    markClean,
    reset,
    setInitialData
  };
}

