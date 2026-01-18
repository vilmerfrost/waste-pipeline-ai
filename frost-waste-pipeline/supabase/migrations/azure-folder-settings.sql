-- Add Azure folder settings to the settings table
-- Run this in Supabase SQL Editor

-- Add new columns for Azure folder configuration
ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS azure_input_folders JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS azure_output_folder TEXT DEFAULT 'completed';

-- Update comment for clarity
COMMENT ON COLUMN settings.azure_input_folders IS 'Array of input folder paths: [{"container": "unsupported-file-format", "folder": ""}]';
COMMENT ON COLUMN settings.azure_output_folder IS 'Output folder path for processed files, e.g., "completed" or "arrivalwastedata/completed"';

-- Set default values for existing rows
UPDATE settings 
SET 
  azure_input_folders = '[{"container": "unsupported-file-format", "folder": "", "enabled": true}]'::jsonb,
  azure_output_folder = 'completed'
WHERE azure_input_folders IS NULL OR azure_input_folders = '[]'::jsonb;

