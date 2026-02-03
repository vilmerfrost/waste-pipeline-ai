"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  MessageSquare, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  FileText, 
  CheckCircle2, 
  Info,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface DocumentAssistantProps {
  documentId: string;
  className?: string;
}

// Simple Markdown Formatter Component
function FormattedAnswer({ text }: { text: string }) {
  if (!text) return null;

  // Split by headers (lines starting with #)
  const sections = text.split(/(?=^#{1,3}\s)/m);

  return (
    <div className="space-y-4 text-sm">
      {sections.map((section, idx) => {
        const lines = section.trim().split('\n');
        const headerMatch = lines[0].match(/^(#{1,3})\s+(.+)$/);
        
        let content = lines;
        let HeaderComponent = null;

        if (headerMatch) {
          const level = headerMatch[1].length;
          const title = headerMatch[2];
          content = lines.slice(1);
          
          if (level === 1) {
            HeaderComponent = <h3 className="text-lg font-bold text-gray-900 mb-2 border-b pb-1">{title}</h3>;
          } else if (level === 2) {
            HeaderComponent = <h4 className="text-base font-semibold text-gray-800 mt-3 mb-1">{title}</h4>;
          } else {
            HeaderComponent = <h5 className="text-sm font-semibold text-gray-700 mt-2 mb-1">{title}</h5>;
          }
        }

        if (content.length === 0 && !HeaderComponent) return null;

        return (
          <div key={idx} className="bg-white/50 rounded-lg">
            {HeaderComponent}
            <div className="space-y-1 text-gray-700 leading-relaxed">
              {content.map((line, lineIdx) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={lineIdx} className="h-1"></div>;
                
                // Lists
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                  return (
                    <div key={lineIdx} className="flex items-start gap-2 ml-1">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      <span>{parseBold(trimmed.substring(2))}</span>
                    </div>
                  );
                }
                
                // Status checks (manual parsing of common patterns)
                if (trimmed.startsWith('✅')) {
                  return (
                    <div key={lineIdx} className="flex items-start gap-2 bg-green-50 p-2 rounded border border-green-100 text-green-800">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{parseBold(trimmed.substring(1))}</span>
                    </div>
                  );
                }

                if (trimmed.startsWith('⚠️')) {
                  return (
                    <div key={lineIdx} className="flex items-start gap-2 bg-yellow-50 p-2 rounded border border-yellow-100 text-yellow-800">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{parseBold(trimmed.substring(2))}</span>
                    </div>
                  );
                }

                return <p key={lineIdx}>{parseBold(trimmed)}</p>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper to parse **bold** text
function parseBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function DocumentAssistant({ documentId, className }: DocumentAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askQuestion = async (customQuestion?: string) => {
    const q = customQuestion || question;
    if (!q.trim() && !customQuestion) return;

    setIsLoading(true);
    setError(null);
    setAnswer("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          question: q,
          action: "ask",
        }),
      });

      if (!response.ok) {
        throw new Error("Kunde inte få svar från assistenten");
      }

      const data = await response.json();
      setAnswer(data.answer);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const quickAction = async (action: "summarize" | "explain_errors") => {
    setIsLoading(true);
    setError(null);
    setAnswer("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          action,
        }),
      });

      if (!response.ok) {
        throw new Error("Kunde inte få svar från assistenten");
      }

      const data = await response.json();
      setAnswer(data.answer);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={className}
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        Fråga AI
      </Button>
    );
  }

  return (
    <Card className={`${className} shadow-lg border-blue-100`}>
      <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-white rounded-t-lg border-b border-blue-100">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2 text-blue-900">
            <Sparkles className="h-4 w-4 text-blue-500" />
            AI-Assistent
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="h-6 w-6 p-0 hover:bg-blue-100 rounded-full"
          >
            ✕
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Quick actions */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => quickAction("summarize")}
            disabled={isLoading}
            className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100"
          >
            <FileText className="h-3 w-3 mr-1.5" />
            Sammanfatta
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => quickAction("explain_errors")}
            disabled={isLoading}
            className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100"
          >
            <AlertCircle className="h-3 w-3 mr-1.5" />
            Vad gick fel?
          </Button>
        </div>

        {/* Answer display */}
        {answer && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <FormattedAnswer text={answer} />
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Input area */}
        <div className="space-y-2">
          <Textarea
            placeholder="Ställ en följdfråga..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[80px] text-sm resize-none bg-white focus-visible:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                askQuestion();
              }
            }}
          />
          <Button
            onClick={() => askQuestion()}
            disabled={isLoading || !question.trim()}
            size="sm"
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyserar dokument...
              </>
            ) : (
              "Skicka fråga"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
