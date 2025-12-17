'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { SystemStatus } from '@/components/SystemStatus';
import { ActivityFeed } from '@/components/ActivityFeed';
import { CostSavingsCalculator } from '@/components/CostSavingsCalculator';
import { getAutoFetcher } from '@/lib/auto-fetcher';

interface FileInfo {
  id: string;
  filename: string;
  status: string;
  uploaded: string;
  totalRows: number;
  validRows: number;
  confidence: number;
  processingTime: number;
}

interface Stats {
  pending: number;
  processed: number;
  totalKg: number;
  documents: number;
}

function StatCard({ label, value, trend, info }: { label: string; value: string | number; trend?: string; info?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        {info && (
          <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      <div className="text-2xl font-semibold text-gray-900 mb-1">
        {value}
      </div>
      {trend && (
        <div className="text-xs text-green-600">
          ↗ {trend}
        </div>
      )}
    </div>
  );
}

function FileRow({ 
  file, 
  isSelected, 
  onSelect 
}: { 
  file: FileInfo; 
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(file.id)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-medium text-gray-900 truncate">
              {file.filename}
            </span>
            <span className={`
              inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
              ${file.confidence > 0.95 
                ? 'bg-green-50 text-green-700' 
                : file.confidence > 0.90
                ? 'bg-blue-50 text-blue-700'
                : 'bg-amber-50 text-amber-700'
              }
            `}>
              {(file.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{file.validRows} rader</span>
            <span>•</span>
            <span>{new Date(file.uploaded).toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <Link
          href={`/collecct/review/${file.id}`}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Granska
        </Link>
      </div>
    </div>
  );
}

export default function CollecctReview() {
  const [queue, setQueue] = useState<FileInfo[]>([]);
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    processed: 0,
    totalKg: 0,
    documents: 0
  });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'high' | 'needs-review'>('all');

  // Start auto-fetcher for background processing
  useEffect(() => {
    const fetcher = getAutoFetcher();
    fetcher.start();
    
    return () => {
      fetcher.stop();
    };
  }, []);

  // Auto-fetch från API varje 30 sek
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [queueRes, statsRes] = await Promise.all([
          fetch('http://localhost:8000/api/files/pending'),
          fetch('http://localhost:8000/api/stats')
        ]);

        if (queueRes.ok) {
          const queueData = await queueRes.json();
          setQueue(queueData);
          setStats(prev => ({ ...prev, pending: queueData.length }));
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(prev => ({
            ...prev,
            processed: statsData.approved || 0,
            documents: statsData.total_processed || 0
          }));
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calculate total weight from queue
  useEffect(() => {
    const totalKg = queue.reduce((sum, file) => {
      return sum + (file.validRows * 100);
    }, 0);
    setStats(prev => ({ ...prev, totalKg }));
  }, [queue]);

  const approveHighConfidence = async () => {
    const highConfidenceFiles = queue.filter(f => f.confidence > 0.95);
    if (highConfidenceFiles.length === 0) {
      alert('Inga filer med hög konfidensgrad (>95%)');
      return;
    }

    if (!confirm(`Godkänna ${highConfidenceFiles.length} filer med hög konfidensgrad?`)) {
      return;
    }

    for (const file of highConfidenceFiles) {
      try {
        await fetch(`http://localhost:8000/api/files/${file.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: file.id, data: [] })
        });
      } catch (error) {
        console.error(`Error approving ${file.id}:`, error);
      }
    }

    window.location.reload();
  };

  const approveSelected = async () => {
    if (selected.size === 0) return;

    for (const fileId of selected) {
      try {
        await fetch(`http://localhost:8000/api/files/${fileId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, data: [] })
        });
      } catch (error) {
        console.error(`Error approving ${fileId}:`, error);
      }
    }

    setSelected(new Set());
    window.location.reload();
  };

  const toggleSelect = (fileId: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelected(newSelected);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'a' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        approveHighConfidence();
      }
      
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        window.location.reload();
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [queue]);

  const filteredQueue = queue.filter(file => {
    if (filter === 'high') return file.confidence > 0.95;
    if (filter === 'needs-review') return file.confidence < 0.90;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - EXAKT som Screenshot 1 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-12">
          {/* System status */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              SYSTEM ONLINE
            </span>
            <span className="text-xs text-gray-400 ml-2">
              I väntan • Uppdaterad {new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Title - samma serif font som "Analysera fakturor" */}
          <h1 className="font-serif text-[2.5rem] text-gray-900 font-normal mb-3">
            Granska dokument
          </h1>
          <p className="text-gray-400 text-lg font-light max-w-2xl">
            Automatiskt extraherade från Simplitics. Granska och godkänn innan Power BI.
          </p>

          {/* Tabs */}
          <div className="flex gap-8 mt-8 border-b border-gray-200">
            <button className="pb-4 border-b-2 border-blue-600 text-sm font-medium text-gray-900">
              Collecct Review
            </button>
            <Link 
              href="/"
              className="pb-4 text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              Arkiv
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Stats - EXAKT samma grid som Screenshot 1 */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <StatCard 
            label="VÄNTANDE"
            value={stats.pending}
            info
          />
          <StatCard 
            label="TOTAL VIKT"
            value={`${(stats.totalKg / 1000).toFixed(1)} ton`}
            trend="Analyserat värde"
          />
          <StatCard 
            label="DOKUMENT"
            value={stats.documents}
          />
          <StatCard 
            label="GODKÄNDA"
            value={stats.processed}
          />
        </div>

        {/* Filter buttons - minimal design */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Alla
          </button>
          <button
            onClick={() => setFilter('high')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'high'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Hög kvalitet (&gt;95%)
          </button>
          <button
            onClick={() => setFilter('needs-review')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'needs-review'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Behöver granskning (&lt;90%)
          </button>

          {selected.size > 0 && (
            <button
              onClick={approveSelected}
              className="ml-auto px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Godkänn {selected.size} filer
            </button>
          )}
        </div>

        {/* Cost Savings & Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <CostSavingsCalculator />
          <ActivityFeed />
        </div>

        {/* File list - samma table style */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-medium text-gray-900">
              Senaste filer ({filteredQueue.length})
            </h2>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
              <p className="text-sm text-gray-500 mt-4">Laddar filer...</p>
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
                <FileText className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">
                Inga filer i kön just nu
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Nya filer från Simplitics dyker upp här automatiskt
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredQueue.map(file => (
                <FileRow 
                  key={file.id} 
                  file={file}
                  isSelected={selected.has(file.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Keyboard shortcuts hint - subtle */}
        <div className="mt-6 text-xs text-gray-400">
          Tangentbordsgenvägar: 
          <kbd className="ml-2 px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600">A</kbd> godkänn hög kvalitet • 
          <kbd className="ml-2 px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600">R</kbd> uppdatera
        </div>
      </div>
    </div>
  );
}
