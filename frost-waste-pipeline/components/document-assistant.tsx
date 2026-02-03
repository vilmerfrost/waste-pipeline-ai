"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Loader2, Sparkles, AlertCircle, FileText } from "lucide-react";

interface DocumentAssistantProps {
  documentId: string;
  className?: string;
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
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI-Assistent
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="h-6 w-6 p-0"
          >
            ✕
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick actions */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => quickAction("summarize")}
            disabled={isLoading}
          >
            <FileText className="h-3 w-3 mr-1" />
            Sammanfatta
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => quickAction("explain_errors")}
            disabled={isLoading}
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Vad gick fel?
          </Button>
        </div>

        {/* Custom question */}
        <div className="flex gap-2">
          <Textarea
            placeholder="Ställ en fråga om dokumentet..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[60px] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                askQuestion();
              }
            }}
          />
        </div>
        <Button
          onClick={() => askQuestion()}
          disabled={isLoading || !question.trim()}
          size="sm"
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Tänker...
            </>
          ) : (
            "Skicka"
          )}
        </Button>

        {/* Answer display */}
        {answer && (
          <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap">
            {answer}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
