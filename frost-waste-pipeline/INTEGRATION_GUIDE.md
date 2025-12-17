# 🚀 COLLECCT DEMO INTEGRATION - STEG FÖR STEG

## ✅ VAD DU HAR NU:

1. **Python API** körs på http://localhost:8000 ✅
2. **Next.js app** körs på http://localhost:3000 ✅
3. **Ny demo-page komponent** i denna fil ✅

---

## 📋 INTEGRATION STEG:

### **STEG 1: Kopiera demo-komponenten**

```bash
# Från frost-waste-pipeline katalogen
cp collecct-demo-page.tsx ../app/collecct-demo/page.tsx
```

**ELLER manuellt:**
1. Skapa ny mapp: `app/collecct-demo/`
2. Skapa fil: `app/collecct-demo/page.tsx`
3. Kopiera innehållet från `collecct-demo-page.tsx`

---

### **STEG 2: Lägg till länk i din navbar/homepage**

I din befintliga `app/page.tsx` eller navbar, lägg till:

```tsx
<Link 
  href="/collecct-demo"
  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
>
  Collecct Demo
</Link>
```

---

### **STEG 3: Testa!**

1. Gå till: http://localhost:3000/collecct-demo
2. Dra och släpp en PDF eller Excel fil
3. Se hur den processas i realtid!
4. Ladda ner JSON-resultatet

---

## 🎯 VAD SIDAN GÖR:

✅ **Drag & drop upload** - Ladda upp waste dokument  
✅ **Real-time processing** - Se status live  
✅ **Validation results** - Visa confidence + issues  
✅ **Download JSON** - Spara resultatet  
✅ **View results** - Öppna i nytt fönster  
✅ **ROI breakdown** - Visa värdet för Collecct  

---

## 💰 DEMO TILL MARTIN:

**URL:** http://localhost:3000/collecct-demo

**Script:**
1. "Här är vår lösning för era failed files"
2. Dra och släpp waste invoice PDF
3. "Se - 30 sekunder istället för 8 timmar"
4. Visa resultat: vikt i kg, adresser, confidence
5. "Detta sparar 36,000 SEK/månad för er"

---

## 🔧 OM DET INTE FUNGERAR:

### **Problem: "fetch failed"**
**Lösning:** Kontrollera att Python API körs:
```bash
python api/server_demo.py
```

### **Problem: "CORS error"**
**Lösning:** API:t har redan CORS aktiverat, men om problem:
```python
# I api/server_demo.py, kolla att denna finns:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    ...
)
```

### **Problem: "Sidan hittas inte"**
**Lösning:** Se till att filen ligger i `app/collecct-demo/page.tsx`

---

## 🎨 ANPASSA DIN SIDA:

### **Ändra färger:**
```tsx
// Byt från-till färger:
className="from-gray-900 via-blue-900 to-gray-900"
// Till dina brand colors
```

### **Lägg till logo:**
```tsx
<div className="flex items-center gap-4">
  <img src="/frost-logo.png" alt="Frost" className="h-12" />
  <h1>COLLECCT PROCESSOR</h1>
</div>
```

### **Lägg till fler stats:**
```tsx
<div className="bg-black/30 rounded-xl p-4">
  <p>Processing time</p>
  <p>{file.result.processing_time}s</p>
</div>
```

---

## 🚀 NÄR DET ÄR KLART:

Du har då:
- ✅ Fungerande demo på /collecct-demo
- ✅ Kan visa Martin IMORGON
- ✅ Drag & drop processing
- ✅ Real-time results
- ✅ Download JSON
- ✅ ROI breakdown

**STÄNG DEN PILOTEN! 💰**

---

## 📞 SUPPORT:

**Problem?** Kolla:
1. Python API körs: http://localhost:8000
2. Next.js körs: http://localhost:3000
3. Filen ligger i rätt mapp: `app/collecct-demo/page.tsx`

**Funkar det?** GÅ OCH DEMO TILL MARTIN! 🔥
