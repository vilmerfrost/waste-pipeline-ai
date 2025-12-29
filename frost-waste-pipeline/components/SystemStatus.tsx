'use client';

import { useEffect, useState } from 'react';

interface Status {
  api: boolean;
  processing: number;
  lastCheck: Date | null;
}

export function SystemStatus() {
  const [status, setStatus] = useState<Status>({
    api: false,
    processing: 0,
    lastCheck: null
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStatus({
            api: true,
            processing: data.pending || 0,
            lastCheck: new Date()
          });
        } else {
          setStatus(prev => ({ ...prev, api: false }));
        }
      } catch {
        setStatus(prev => ({ ...prev, api: false }));
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-green-500 rounded-full" />
      <span className="text-xs text-gray-500 uppercase tracking-wider">
        SYSTEM ONLINE
      </span>
      {status.processing > 0 && (
        <>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-400">
            {status.processing} väntar
          </span>
        </>
      )}
      {status.lastCheck && (
        <>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-400">
            Uppdaterad {status.lastCheck.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </>
      )}
    </div>
  );
}
