-- Add trigger to auto-update updated_at on documents table
-- Reuses the existing update_updated_at_column() function from settings-migration.sql

-- Create trigger for documents table
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;

CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Verify: Update all documents to set correct updated_at based on their current state
-- This fixes the current situation where all docs have the same timestamp
UPDATE documents 
SET updated_at = COALESCE(
  (extracted_data->>'_processedAt')::timestamptz,
  created_at
)
WHERE updated_at = '2026-02-03T15:25:46.261251+00:00';
