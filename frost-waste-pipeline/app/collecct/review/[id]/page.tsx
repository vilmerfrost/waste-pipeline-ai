'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DataRow {
  id: number;
  weight_kg: number;
  address: string;
  waste_type: string;
  date: string;
  confidence: number;
}

interface ValidationIssue {
  row: number;
  field: string;
  type: string;
  message: string;
}

interface ExtractionData {
  filename: string;
  summary: string;
  confidence: number;
  data: DataRow[];
  issues: ValidationIssue[];
  originalUrl: string;
}

export default function ReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [data, setData] = useState<ExtractionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [id, setId] = useState<string>('');

  useEffect(() => {
    params.then(p => {
      setId(p.id);
    });
  }, [params]);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/files/${id}`);
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const approve = async () => {
    if (!data) return;
    
    setProcessing(true);
    try {
      const response = await fetch(`http://localhost:8000/api/files/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: id,
          data: data.data
        })
      });

      if (response.ok) {
        router.push('/collecct');
      } else {
        alert('Kunde inte godkänna filen');
      }
    } catch (error) {
      console.error('Error approving file:', error);
      alert('Ett fel uppstod');
    } finally {
      setProcessing(false);
    }
  };

  const reject = async () => {
    const reason = prompt('Ange anledning till avvisning:');
    if (!reason) return;

    setProcessing(true);
    try {
      const response = await fetch(`http://localhost:8000/api/files/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: id,
          reason
        })
      });

      if (response.ok) {
        router.push('/collecct');
      } else {
        alert('Kunde inte avvisa filen');
      }
    } catch (error) {
      console.error('Error rejecting file:', error);
      alert('Ett fel uppstod');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Laddar...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Kunde inte ladda filen</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <button 
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-6 inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Tillbaka
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                {data.filename}
              </h1>
              <p className="text-sm text-gray-500">
                {data.summary}
              </p>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={reject}
                disabled={processing}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Avvisa
              </button>
              <button 
                onClick={approve}
                disabled={processing}
                className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processar...' : 'Godkänn & skicka'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Issues */}
        {data.issues && data.issues.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-amber-900 mb-1">
                  {data.issues.length} valideringsproblem
                </h3>
                <ul className="text-sm text-amber-700 space-y-1">
                  {data.issues.map((issue, i) => (
                    <li key={i}>Rad {issue.row}: {issue.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Data table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vikt (kg)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Adress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avfallstyp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Datum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kvalitet
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.data.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {row.weight_kg.toLocaleString('sv-SE')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {row.address || (
                      <span className="text-red-600">Saknas</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {row.waste_type}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {row.date}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`
                      inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                      ${row.confidence > 0.95 
                        ? 'bg-green-50 text-green-700' 
                        : row.confidence > 0.90
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-amber-50 text-amber-700'
                      }
                    `}>
                      {(row.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
