-- Create settings table for Collecct Waste Pipeline
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT DEFAULT 'default',
  
  -- AI Automation Settings
  auto_approve_threshold INTEGER DEFAULT 80 CHECK (auto_approve_threshold >= 60 AND auto_approve_threshold <= 99),
  enterprise_auto_approve BOOLEAN DEFAULT false,
  
  -- Material Synonyms Library
  -- Structure: { "StandardName": ["synonym1", "synonym2", ...] }
  material_synonyms JSONB DEFAULT '{
    "Trä": ["Brädor", "Virke", "Lastpall", "Spont"],
    "Gips": ["Gipsskivor", "Rivningsgips", "Gipsspill"],
    "Betong": ["Armerad betong", "Betongkross"],
    "Brännbart": ["Restavfall", "Blandat brännbart"]
  }'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (user_id, auto_approve_threshold, material_synonyms)
VALUES ('default', 80, '{
  "Trä": ["Brädor", "Virke", "Lastpall", "Spont"],
  "Gips": ["Gipsskivor", "Rivningsgips", "Gipsspill"],
  "Betong": ["Armerad betong", "Betongkross"],
  "Brännbart": ["Restavfall", "Blandat brännbart"]
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Grant access
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (you can restrict later)
CREATE POLICY "Allow all operations on settings" ON settings
  FOR ALL USING (true);

