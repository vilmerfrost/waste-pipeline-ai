// Document Assistant using Claude Haiku
// Post-extraction assistant for answering questions about processed documents

import { anthropic } from "./ai-clients";

interface AssistantResponse {
  answer: string;
  suggestedActions?: string[];
}

export async function askDocumentAssistant(
  question: string,
  documentContext: {
    filename: string;
    extractedData: any;
    processingLog: string[];
    status: string;
  }
): Promise<AssistantResponse> {
  const { filename, extractedData, processingLog, status } = documentContext;

  const prompt = `You are an AI assistant for Collecct AB's document processing system.
You help users understand their processed waste management documents.

DOCUMENT: ${filename}
STATUS: ${status}

EXTRACTED DATA:
${JSON.stringify(extractedData, null, 2).substring(0, 8000)}

PROCESSING LOG (last 30 lines):
${processingLog.slice(-30).join("\n")}

USER QUESTION: ${question}

Answer concisely in Swedish unless the user writes in English. 
If something went wrong, explain clearly what and why.
Suggest fixes if applicable.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });

    const answer = response.content[0].type === "text" 
      ? response.content[0].text 
      : "Jag kunde inte besvara din fråga.";

    // Extract suggested actions if any
    const suggestedActions: string[] = [];
    const actionMatches = answer.match(/[-•]\s*(.+)/g);
    if (actionMatches) {
      suggestedActions.push(...actionMatches.map((a) => a.replace(/^[-•]\s*/, "")));
    }

    return {
      answer,
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
    };
  } catch (error: any) {
    return {
      answer: `Ett fel uppstod: ${error.message}`,
    };
  }
}

// Quick action helpers
export async function summarizeDocument(documentContext: any): Promise<string> {
  const result = await askDocumentAssistant(
    "Ge mig en kort sammanfattning av detta dokument och extraktionsresultatet.",
    documentContext
  );
  return result.answer;
}

export async function explainErrors(documentContext: any): Promise<string> {
  const result = await askDocumentAssistant(
    "Vad gick fel med extraktionen? Förklara eventuella problem och hur de kan åtgärdas.",
    documentContext
  );
  return result.answer;
}

export async function compareWithPrevious(
  currentDoc: any,
  previousDoc: any
): Promise<string> {
  const combinedContext = {
    filename: currentDoc.filename,
    extractedData: {
      current: currentDoc.extractedData,
      previous: previousDoc?.extractedData || null,
    },
    processingLog: currentDoc.processingLog,
    status: currentDoc.status,
  };

  const result = await askDocumentAssistant(
    "Jämför detta dokument med föregående. Finns det några anmärkningsvärda skillnader?",
    combinedContext
  );
  return result.answer;
}
