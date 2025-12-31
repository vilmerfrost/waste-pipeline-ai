-- Migration: Add Azure filename tracking columns
-- Purpose: Track original Azure filenames and source containers for safe cleanup
-- Date: 2025-01-28

-- Add columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS azure_original_filename TEXT,
ADD COLUMN IF NOT EXISTS source_container TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_azure_original_filename ON documents(azure_original_filename);
CREATE INDEX IF NOT EXISTS idx_documents_source_container ON documents(source_container);

-- Migrate existing documents
-- Set azure_original_filename to current filename
-- Infer source_container from filename pattern or extracted_data
UPDATE documents
SET 
  azure_original_filename = COALESCE(
    azure_original_filename,
    filename
  ),
  source_container = COALESCE(
    source_container,
    CASE 
      WHEN extracted_data->>'source_folder' IS NOT NULL 
        THEN extracted_data->>'source_folder'
      WHEN filename LIKE '%.pdf' 
        THEN 'unsupported-file-format'
      ELSE 'unable-to-process'
    END
  )
WHERE azure_original_filename IS NULL OR source_container IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN documents.azure_original_filename IS 'Original filename in Azure Blob Storage (for safe cleanup)';
COMMENT ON COLUMN documents.source_container IS 'Azure container name where file was originally stored (unable-to-process or unsupported-file-format)';

