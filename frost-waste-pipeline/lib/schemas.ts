import { z } from "zod";

// --- HJÄLPFUNKTIONER FÖR ATT TOLKA SVENSKA FORMAT ---

const parseSwedishWeight = (val: unknown): number => {
  if (typeof val === "number") return val;
  if (!val || typeof val !== 'string') return 0;
  
  let str = val.toLowerCase().replace(/\s/g, "");
  // Hantera "1.500" som 1500 och "1,5" som 1.5
  str = str.replace(".", "").replace(",", ".");

  const match = str.match(/^([\d.]+)(kilo|kg|g|ton|t)?$/);
  if (!match) return 0; 

  const value = parseFloat(match[1]);
  const unit = match[2] || "kg";

  if (unit === "ton" || unit === "t") return value * 1000;
  if (unit === "g") return value / 1000;
  return value;
};

// --- NYA SMARTA FÄLT MED CONFIDENCE ---

// En hjälptyp som skapar ett objekt med { value, confidence }
// Den är smart nog att hantera om AI:n råkar skicka gamla platta formatet också.
const createSmartField = <T extends z.ZodTypeAny>(schema: T) => {
  return z.preprocess(
    (input) => {
      // Om input redan är ett objekt med value/confidence, låt det vara
      if (typeof input === 'object' && input !== null && 'value' in input && 'confidence' in input) {
        return input;
      }
      // Annars, om det är gammalt platt data, konvertera det till nya strukturen med 0 confidence
      return { value: input, confidence: 0 };
    },
    z.object({
      value: schema,
      confidence: z.number().min(0).max(1).default(0).catch(0), // Defaulta till 0 om det saknas eller är fel
    })
  );
};

// NYTT SCHEMA FÖR EN RAD I TABELLEN
const LineItemSchema = z.object({
  material: createSmartField(z.string().catch("")),
  handling: createSmartField(z.string().catch("")), // T.ex. "Energiåtervinning"
  weightKg: createSmartField(z.preprocess(parseSwedishWeight, z.number().catch(0))),
  percentage: createSmartField(z.string().catch("")), // T.ex. "32.80%"
  
  // --- NYTT FÄLT: CO2 BESPARING ---
  co2Saved: createSmartField(z.number().catch(0)), 
  
  // NYTT: Farligt avfall flagga
  isHazardous: createSmartField(z.boolean().default(false)), 
  
  // --- NYTT: ADRESS & MOTTAGARE PÅ RAD-NIVÅ ---
  address: createSmartField(z.string().catch("")), 
  receiver: createSmartField(z.string().catch("")),
});

// --- DET NYA SCHEMAT ---
export const WasteRecordSchema = z.object({
  // Grunddata
  date: createSmartField(
    z.preprocess((val) => {
        if (!val) return new Date().toISOString().split("T")[0];
        return String(val).trim();
    }, z.string())
  ),
  
  supplier: createSmartField(z.string().catch("")),
  
  // TOTALER (Summering)
  cost: createSmartField(
    z.preprocess((val) => {
      if (typeof val === "number") return val;
      if (!val || typeof val !== 'string') return 0;
      // Rensa bort "kr", "SEK" och mellanslag. Byt komma mot punkt.
      const clean = val.replace(/[^\d,.-]/g, "").replace(",", ".");
      return parseFloat(clean) || 0;
    }, z.number().catch(0))
  ),
  
  weightKg: createSmartField(
    z.preprocess(parseSwedishWeight, z.number().min(0).catch(0))
  ), // Totalvikt
  
  // Plats
  address: createSmartField(z.string().catch("")),
  receiver: createSmartField(z.string().catch("")),

  // --- NYTT: LISTA MED RADER ---
  // Vi behåller "material" som "Huvudmaterial" (t.ex. Blandat) för bakåtkompatibilitet
  material: createSmartField(
    z.string()
      .transform(s => s.trim())
      .transform(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .catch("Blandat")
  ), 
  
  // Total CO2 för hela dokumentet (bra att ha)
  totalCo2Saved: createSmartField(z.number().catch(0)),

  lineItems: z.array(LineItemSchema).default([]), // <-- HÄR SPARAR VI SORTERA-LISTAN
});

// Typen för TypeScript
export type WasteRecord = z.infer<typeof WasteRecordSchema>;

// En hjälptyp för att enkelt komma åt värdet i UI:t
export type SmartFieldValue<T> = { value: T; confidence: number } | undefined;
