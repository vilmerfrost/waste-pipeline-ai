"use client";

import { useState, useEffect, useRef } from "react";
import { Terminal, ChevronDown, ChevronUp, Play, CheckCircle, XCircle, AlertTriangle, Loader2 } from "lucide-react";

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

interface ProcessingResult {
  status: string;
  extractedRows: number;
  totalWeight: number;
  confidence: number;
  completeness: number;
  uniqueAddresses: number;
  uniqueMaterials: number;
  processingLog?: string[];
}

interface ProcessingLogViewerProps {
  documentId: string;
  filename?: string;
  onComplete?: (result: ProcessingResult) => void;
  autoStart?: boolean;
  showStoredLogs?: string[];  // Show previously stored logs
}

export function ProcessingLogViewer({ 
  documentId, 
  filename,
  onComplete,
  autoStart = false,
  showStoredLogs
}: ProcessingLogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);
  
  // Show stored logs if provided
  useEffect(() => {
    if (showStoredLogs && showStoredLogs.length > 0) {
      const storedEntries = showStoredLogs.map(msg => ({
        message: msg.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, ''), // Remove timestamp prefix if present
        level: msg.includes('✓') || msg.includes('✅') ? 'success' as const :
               msg.includes('⚠') ? 'warning' as const :
               msg.includes('❌') ? 'error' as const : 'info' as const,
        timestamp: new Date().toISOString()
      }));
      setLogs(storedEntries);
    }
  }, [showStoredLogs]);
  
  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && !isProcessing && logs.length === 0) {
      startProcessing();
    }
  }, [autoStart]);
  
  const startProcessing = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setLogs([]);
    setIsExpanded(true);
    
    try {
      const response = await fetch(`/api/process-stream?id=${documentId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete message in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case 'start':
                  setLogs(prev => [...prev, {
                    message: `🚀 Starting processing: ${data.filename}`,
                    level: 'info',
                    timestamp: new Date().toISOString()
                  }]);
                  break;
                  
                case 'log':
                  setLogs(prev => [...prev, {
                    message: data.message,
                    level: data.level || 'info',
                    timestamp: data.timestamp
                  }]);
                  break;
                  
                case 'complete':
                  setResult(data);
                  setLogs(prev => [...prev, {
                    message: `🎉 Processing complete! ${data.extractedRows} rows extracted`,
                    level: 'success',
                    timestamp: new Date().toISOString()
                  }]);
                  if (onComplete) onComplete(data);
                  break;
                  
                case 'error':
                  setError(data.message);
                  setLogs(prev => [...prev, {
                    message: `❌ Error: ${data.message}`,
                    level: 'error',
                    timestamp: new Date().toISOString()
                  }]);
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE message:", e);
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Processing failed");
      setLogs(prev => [...prev, {
        message: `❌ Connection error: ${err.message}`,
        level: 'error',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <Terminal className="w-4 h-4 text-gray-400" />;
    }
  };
  
  const getLevelClass = (level: string) => {
    switch (level) {
      case 'success': return 'text-green-300';
      case 'warning': return 'text-yellow-300';
      case 'error': return 'text-red-300';
      default: return 'text-gray-300';
    }
  };
  
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-gray-800 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-green-400" />
          <span className="font-medium text-white">Processing Log</span>
          {isProcessing && (
            <span className="flex items-center gap-2 text-sm text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </span>
          )}
          {result && (
            <span className="text-sm text-green-400">
              ✓ Complete ({result.extractedRows} rows)
            </span>
          )}
          {error && !isProcessing && (
            <span className="text-sm text-red-400">
              ✗ Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isProcessing && !showStoredLogs && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                startProcessing();
              }}
              className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              {result ? 'Reprocess' : 'Start'}
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
      
      {/* Log content */}
      {isExpanded && (
        <div 
          ref={logContainerRef}
          className="p-4 max-h-96 overflow-y-auto font-mono text-sm"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          {logs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              {showStoredLogs ? 'No processing logs available' : 'Click "Start" to begin processing'}
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2">
                  {getLevelIcon(log.level)}
                  <span className={getLevelClass(log.level)}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Result summary */}
      {result && isExpanded && (
        <div className="px-4 py-3 bg-gray-800 border-t border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Rows:</span>
              <span className="ml-2 text-white font-medium">{result.extractedRows}</span>
            </div>
            <div>
              <span className="text-gray-400">Weight:</span>
              <span className="ml-2 text-white font-medium">{(result.totalWeight / 1000).toFixed(2)} ton</span>
            </div>
            <div>
              <span className="text-gray-400">Confidence:</span>
              <span className={`ml-2 font-medium ${result.confidence >= 90 ? 'text-green-400' : 'text-yellow-400'}`}>
                {result.confidence.toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-gray-400">Status:</span>
              <span className={`ml-2 font-medium ${result.status === 'approved' ? 'text-green-400' : 'text-yellow-400'}`}>
                {result.status === 'approved' ? 'Approved' : 'Needs Review'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
