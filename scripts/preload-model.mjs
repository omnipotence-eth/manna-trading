/**
 * Download and Preload DeepSeek R1 14B Model
 * ES Module version for direct execution
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the service (adjust path as needed)
const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

async function ensureModelDownloaded(model = 'deepseek-r1:14b') {
  try {
    console.log(`[INFO] Checking if ${model} is downloaded...`);
    
    // Check if model exists
    const tagsResponse = await fetch(`${baseUrl}/api/tags`);
    if (!tagsResponse.ok) {
      throw new Error('Ollama is not running. Start it with: ollama serve');
    }
    
    const models = await tagsResponse.json();
    const availableModels = models.models?.map((m) => m.name) || [];
    const hasModel = availableModels.some((m) => m === model);
    
    if (hasModel) {
      console.log(`[OK] Model ${model} is already downloaded`);
      return true;
    }
    
    // Download model
    console.log(`[DOWNLOAD] Downloading ${model} (this may take several minutes, ~8GB)...`);
    const pullResponse = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false })
    });
    
    if (!pullResponse.ok) {
      throw new Error(`Failed to download model: ${pullResponse.status}`);
    }
    
    const result = await pullResponse.json();
    console.log(`[OK] Model ${model} downloaded successfully`);
    return true;
  } catch (error) {
    console.error(`[ERROR] Error downloading model:`, error.message);
    return false;
  }
}

async function preloadModel(model = 'deepseek-r1:14b') {
  try {
    console.log(`[PRELOAD] Preloading ${model} into RAM...`);
    console.log(`   This may take 30-60 seconds on first load...\n`);
    
    const startTime = Date.now();
    
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
        options: {
          num_predict: 5 // Very short response for warm-up
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to preload: ${response.status}`);
    }
    
    const result = await response.json();
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`[OK] Model preloaded successfully in ${loadTime} seconds`);
    return true;
  } catch (error) {
    console.error(`[ERROR] Error preloading model:`, error.message);
    return false;
  }
}

async function main() {
  console.log('[START] DeepSeek R1 14B Model Download & Preload\n');
  console.log('='.repeat(50) + '\n');
  
  const model = 'deepseek-r1:14b';
  
  // Step 1: Download
  const downloaded = await ensureModelDownloaded(model);
  if (!downloaded) {
    console.error('\n[ERROR] Failed to download model. Exiting.');
    process.exit(1);
  }
  
  console.log('');
  
  // Step 2: Preload
  const preloaded = await preloadModel(model);
  
  console.log('\n' + '='.repeat(50));
  if (preloaded) {
    console.log('[SUCCESS] Model is downloaded and preloaded in RAM');
    console.log('   Ready for fast responses!\n');
  } else {
    console.log('[WARN] Model is downloaded but preload had issues');
    console.log('   Model will load on first request (30-60 seconds)\n');
  }
}

main().catch(error => {
  console.error('\n[ERROR] Fatal error:', error.message);
  console.error('\nMake sure Ollama is running: ollama serve');
  process.exit(1);
});

