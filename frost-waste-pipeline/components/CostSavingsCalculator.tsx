'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Clock, DollarSign, FileText } from 'lucide-react';

interface Savings {
  savedHours: number;
  savedCost: number;
  processedFiles: number;
  roiMonths: number;
}

export function CostSavingsCalculator() {
  const [savings, setSavings] = useState<Savings>({
    savedHours: 0,
    savedCost: 0,
    processedFiles: 0,
    roiMonths: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/stats');
        if (res.ok) {
          const data = await res.json();
          
          // Calculate savings
          const processedFiles = data.total_processed || 0;
          const avgTimePerFile = 0.5; // hours (30 min manual vs 1 min automated)
          const hourlyRate = 1000; // SEK per hour
          
          const savedHours = processedFiles * avgTimePerFile;
          const savedCost = savedHours * hourlyRate;
          const monthlyCost = 4000; // Frost monthly cost
          const roiMonths = monthlyCost > 0 ? savedCost / monthlyCost : 0;
          
          setSavings({
            savedHours: Math.round(savedHours * 10) / 10,
            savedCost: Math.round(savedCost),
            processedFiles,
            roiMonths: Math.round(roiMonths * 10) / 10
          });
        }
      } catch (error) {
        console.error('Error fetching savings:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-base font-medium text-gray-900 mb-4">
        Besparingar denna månad
      </h3>
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="text-2xl font-semibold text-gray-900 mb-1">
            {savings.savedHours}h
          </div>
          <div className="text-xs text-gray-500">Tid sparad</div>
        </div>
        
        <div>
          <div className="text-2xl font-semibold text-gray-900 mb-1">
            {savings.savedCost.toLocaleString('sv-SE')} kr
          </div>
          <div className="text-xs text-gray-500">Kostnadsbesparing</div>
        </div>
        
        <div>
          <div className="text-2xl font-semibold text-gray-900 mb-1">
            {savings.processedFiles}
          </div>
          <div className="text-xs text-gray-500">Filer processade</div>
        </div>
      </div>
      
      <div className="text-xs text-gray-600 pt-4 border-t border-gray-200">
        På nuvarande takt når ni ROI på <span className="font-medium">{savings.roiMonths} månader</span>
      </div>
    </div>
  );
}
