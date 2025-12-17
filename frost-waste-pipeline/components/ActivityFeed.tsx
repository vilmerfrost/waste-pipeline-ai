'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, FileText, AlertTriangle, Clock } from 'lucide-react';

interface Activity {
  id: string;
  type: 'processed' | 'approved' | 'rejected' | 'found';
  message: string;
  time: string;
  filename?: string;
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    // Fallback: Poll API if SSE not available
    const fetchActivities = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/activities');
        if (res.ok) {
          const data = await res.json();
          setActivities(data.slice(0, 10));
        }
      } catch (error) {
        console.error('Error fetching activities:', error);
      }
    };

    // Try SSE first
    try {
      const eventSource = new EventSource('http://localhost:8000/api/events');
      
      eventSource.onmessage = (event) => {
        const activity = JSON.parse(event.data);
        setActivities(prev => [activity, ...prev].slice(0, 10));
      };
      
      eventSource.onerror = () => {
        // Fallback to polling if SSE fails
        eventSource.close();
        fetchActivities();
        const interval = setInterval(fetchActivities, 5000);
        return () => clearInterval(interval);
      };

      return () => eventSource.close();
    } catch (error) {
      // Fallback to polling
      fetchActivities();
      const interval = setInterval(fetchActivities, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'processed':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'found':
        return <Clock className="w-4 h-4 text-indigo-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-base font-medium text-gray-900 mb-4">
        Senaste aktivitet
      </h3>
      {activities.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-4">
          Inga aktiviteter än
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 text-sm">
              <div className="mt-0.5">
                {getIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-700">{activity.message}</span>
                {activity.filename && (
                  <span className="text-gray-500 ml-1 text-xs">({activity.filename})</span>
                )}
              </div>
              <span className="text-gray-400 text-xs whitespace-nowrap">
                {activity.time}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
