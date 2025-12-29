/**
 * Auto-fetcher service for Collecct
 * Checks blob storage for failed files and processes them automatically
 */

export class AutoFetcher {
  private intervalId: NodeJS.Timeout | null = null;
  private apiBase: string;
  
  constructor(apiBase: string = 'http://localhost:8000') {
    this.apiBase = apiBase;
  }
  
  async start() {
    console.log('🤖 Auto-fetcher started - checking for failed files...');
    
    // Check immediately
    await this.checkAndProcess();
    
    // Then check every 5 minutes
    this.intervalId = setInterval(() => {
      this.checkAndProcess();
    }, 5 * 60 * 1000);
  }
  
  async checkAndProcess() {
    try {
      // 1. Check blob for failed files
      const response = await fetch(`${this.apiBase}/api/blob/failed`);
      
      if (!response.ok) {
        console.log('⚠️ Could not check blob storage (API might be offline)');
        return;
      }
      
      const failedFiles = await response.json();
      
      if (!Array.isArray(failedFiles) || failedFiles.length === 0) {
        console.log('✅ No failed files - all good');
        return;
      }
      
      console.log(`📥 Found ${failedFiles.length} failed files - processing...`);
      
      // 2. Process each file
      for (const file of failedFiles.slice(0, 10)) { // Max 10 at a time
        try {
          await fetch(`${this.apiBase}/api/process/auto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name || file })
          });
          console.log(`✅ Processed: ${file.name || file}`);
        } catch (error) {
          console.error(`❌ Error processing ${file.name || file}:`, error);
        }
      }
      
      console.log('✅ All files processed and ready for review');
      
    } catch (error) {
      console.error('❌ Auto-fetch error:', error);
    }
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Auto-fetcher stopped');
    }
  }
}

// Export singleton instance
let fetcherInstance: AutoFetcher | null = null;

export function getAutoFetcher(): AutoFetcher {
  if (!fetcherInstance) {
    fetcherInstance = new AutoFetcher();
  }
  return fetcherInstance;
}
