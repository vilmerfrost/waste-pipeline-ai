"use client";

import React, { useState, useCallback } from 'react';
import { Upload, FileText, Download, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

const WebUpload = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/upload/process`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      await processFile(file);
    } else {
      setError('Please upload a PDF or Excel file');
    }
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  const downloadJSON = () => {
    if (!result) return;
    
    const jsonStr = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.filename.replace(/\.[^/.]+$/, '')}_extraction.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-black/30 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-6 mb-6">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            COLLECCT DOCUMENT PROCESSOR
          </h1>
          <p className="text-cyan-400/60 text-sm font-mono mt-2">
            Drag & Drop • Instant Extraction • AI-Powered
          </p>
        </div>

        {/* Upload Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`bg-black/30 backdrop-blur-xl border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
            isDragging
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-cyan-500/30 hover:border-cyan-500/50'
          }`}
        >
          {isProcessing ? (
            <div className="space-y-4">
              <Loader2 className="w-16 h-16 mx-auto text-cyan-400 animate-spin" />
              <p className="text-cyan-400 text-lg">Processing document...</p>
            </div>
          ) : (
            <>
              <Upload className="w-16 h-16 mx-auto text-cyan-400 mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                Drop your waste document here
              </h2>
              <p className="text-cyan-400/60 mb-6">
                PDF or Excel files supported
              </p>
              <label className="inline-block bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg cursor-pointer transition-all">
                <span>Select File</span>
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 bg-red-500/20 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Summary Card */}
            <div className="bg-black/30 backdrop-blur-xl border border-cyan-500/30 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{result.filename}</h2>
                  <p className="text-cyan-400/80">{result.summary}</p>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${
                    result.confidence >= 0.9 ? 'text-green-400' :
                    result.confidence >= 0.8 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {(result.confidence * 100).toFixed(0)}%
                  </div>
                  <p className="text-cyan-400/60 text-sm">Confidence</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <p className="text-cyan-400/60 text-sm">Total Rows</p>
                  <p className="text-white text-xl font-bold">{result.data.length + result.issues.filter((i: any) => i.type === 'error').length}</p>
                </div>
                <div>
                  <p className="text-cyan-400/60 text-sm">Valid Rows</p>
                  <p className="text-green-400 text-xl font-bold">{result.data.length}</p>
                </div>
                <div>
                  <p className="text-cyan-400/60 text-sm">Issues</p>
                  <p className="text-yellow-400 text-xl font-bold">{result.issues.length}</p>
                </div>
              </div>
            </div>

            {/* Validation Issues */}
            {result.issues.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <h3 className="text-amber-400 font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Validation Issues ({result.issues.length})
                </h3>
                <div className="space-y-2">
                  {result.issues.map((issue: any, idx: number) => (
                    <div key={idx} className="text-sm">
                      <span className={issue.type === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                        Row {issue.row} ({issue.field}):
                      </span>
                      <span className="text-white/80 ml-2">{issue.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Preview */}
            {result.data.length > 0 && (
              <div className="bg-black/30 backdrop-blur-xl border border-cyan-500/30 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-cyan-500/30 flex items-center justify-between">
                  <h3 className="text-white font-semibold">Extracted Data ({result.data.length} rows)</h3>
                  <button
                    onClick={downloadJSON}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download JSON
                  </button>
                </div>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full">
                    <thead className="bg-cyan-500/20 border-b border-cyan-500/30">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400">Weight (kg)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400">Address</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400">Waste Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.slice(0, 10).map((row: any, idx: number) => (
                        <tr key={idx} className="border-b border-cyan-500/10 hover:bg-white/5">
                          <td className="px-4 py-3 text-white text-sm">{row.weight_kg}</td>
                          <td className="px-4 py-3 text-white text-sm">{row.address || <span className="text-red-400">Missing</span>}</td>
                          <td className="px-4 py-3 text-white text-sm">{row.waste_type}</td>
                          <td className="px-4 py-3 text-white text-sm">{row.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.data.length > 10 && (
                    <div className="p-4 text-center text-cyan-400/60 text-sm">
                      ... and {result.data.length - 10} more rows
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Success Message */}
            <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400">
                ✅ Extraction complete! Download JSON to use in Power BI.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebUpload;
