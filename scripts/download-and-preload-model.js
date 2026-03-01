/**
 * Download and Preload DeepSeek R1 14B Model
 * This script downloads the model if needed and preloads it into RAM
 */

const { DeepSeekService } = require('../services/ai/deepseekService');

async function main() {
  console.log('[START] Starting DeepSeek R1 14B model download and preload...\n');
  
  const deepseekService = new DeepSeekService();
  
  try {
    console.log('[STEP 1] Ensuring model is downloaded...');
    const downloaded = await deepseekService.ensureModelDownloaded();
    
    if (!downloaded) {
      console.error('[ERROR] Failed to download model. Please check Ollama is running: ollama serve');
      process.exit(1);
    }
    
    console.log('[OK] Model download check complete\n');
    
    console.log('[STEP 2] Preloading model into RAM...');
    console.log('   This may take 30-60 seconds on first load...\n');
    
    const preloaded = await deepseekService.preloadModel();
    
    if (preloaded) {
      console.log('\n[SUCCESS] DeepSeek R1 14B model is downloaded and preloaded in RAM');
      console.log('   The model is now ready for fast responses!\n');
      process.exit(0);
    } else {
      console.log('\n[WARN] Model is downloaded but preload had issues');
      console.log('   The model will load on first request (may take 30-60 seconds)\n');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n[ERROR] Error:', error.message);
    console.error('\nMake sure Ollama is running: ollama serve');
    process.exit(1);
  }
}

main();

