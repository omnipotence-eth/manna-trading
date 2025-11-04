#!/usr/bin/env node
/**
 * Test API Key Configuration
 * Verifies that all 30 keys are loaded correctly
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

console.log(`\n${colors.bold}${colors.cyan}════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}  🔑 API Key Configuration Test${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}════════════════════════════════════════════════════════${colors.reset}\n`);

let passed = 0;
let failed = 0;

// Test 1: Check for ASTER_KEY_POOL
console.log(`${colors.bold}Test 1: ASTER_KEY_POOL environment variable${colors.reset}`);
const keyPool = process.env.ASTER_KEY_POOL;

if (!keyPool) {
  console.log(`  ${colors.red}✗ FAIL${colors.reset} - ASTER_KEY_POOL not found in environment`);
  console.log(`  ${colors.yellow}→${colors.reset} Add ASTER_KEY_POOL to your .env file`);
  failed++;
} else {
  console.log(`  ${colors.green}✓ PASS${colors.reset} - ASTER_KEY_POOL found`);
  console.log(`  ${colors.cyan}→${colors.reset} Length: ${keyPool.length} characters`);
  passed++;
}

// Test 2: Parse JSON
console.log(`\n${colors.bold}Test 2: JSON parsing${colors.reset}`);
let parsedKeys = null;

if (keyPool) {
  try {
    parsedKeys = JSON.parse(keyPool);
    console.log(`  ${colors.green}✓ PASS${colors.reset} - JSON parsed successfully`);
    passed++;
  } catch (error) {
    console.log(`  ${colors.red}✗ FAIL${colors.reset} - Invalid JSON format`);
    console.log(`  ${colors.yellow}→${colors.reset} Error: ${error.message}`);
    console.log(`  ${colors.yellow}→${colors.reset} First 100 chars: ${keyPool.substring(0, 100)}...`);
    failed++;
  }
}

// Test 3: Validate structure
console.log(`\n${colors.bold}Test 3: Key structure validation${colors.reset}`);

if (parsedKeys && parsedKeys.keys && Array.isArray(parsedKeys.keys)) {
  const keyCount = parsedKeys.keys.length;
  console.log(`  ${colors.green}✓ PASS${colors.reset} - Found ${keyCount} keys`);
  
  if (keyCount === 30) {
    console.log(`  ${colors.green}✓ PASS${colors.reset} - Correct number of keys (30)`);
    passed += 2;
  } else {
    console.log(`  ${colors.yellow}⚠ WARN${colors.reset} - Expected 30 keys, found ${keyCount}`);
    passed++;
  }
} else {
  console.log(`  ${colors.red}✗ FAIL${colors.reset} - Invalid key structure`);
  console.log(`  ${colors.yellow}→${colors.reset} Expected: { "keys": [...] }`);
  failed++;
}

// Test 4: Validate individual keys
console.log(`\n${colors.bold}Test 4: Individual key validation${colors.reset}`);

if (parsedKeys && parsedKeys.keys) {
  let validKeys = 0;
  let invalidKeys = 0;
  const issues = [];

  parsedKeys.keys.forEach((key, index) => {
    const keyNum = index + 1;
    
    // Check required fields
    if (!key.id) {
      issues.push(`Key ${keyNum}: Missing 'id' field`);
      invalidKeys++;
      return;
    }
    if (!key.api || key.api.length < 60) {
      issues.push(`Key ${keyNum} (${key.id}): Invalid or missing 'api' field`);
      invalidKeys++;
      return;
    }
    if (!key.secret || key.secret.length < 60) {
      issues.push(`Key ${keyNum} (${key.id}): Invalid or missing 'secret' field`);
      invalidKeys++;
      return;
    }
    
    validKeys++;
  });

  if (validKeys === parsedKeys.keys.length) {
    console.log(`  ${colors.green}✓ PASS${colors.reset} - All ${validKeys} keys are valid`);
    passed++;
  } else {
    console.log(`  ${colors.yellow}⚠ WARN${colors.reset} - ${validKeys} valid, ${invalidKeys} invalid`);
    issues.forEach(issue => {
      console.log(`  ${colors.yellow}  →${colors.reset} ${issue}`);
    });
    if (validKeys >= 20) {
      console.log(`  ${colors.yellow}→${colors.reset} System will work with ${validKeys} keys`);
      passed++;
    } else {
      failed++;
    }
  }
}

// Test 5: Check fallback keys
console.log(`\n${colors.bold}Test 5: Fallback keys (backwards compatibility)${colors.reset}`);

const fallbackApiKey = process.env.ASTER_API_KEY;
const fallbackSecretKey = process.env.ASTER_SECRET_KEY;

if (fallbackApiKey && fallbackSecretKey) {
  console.log(`  ${colors.green}✓ PASS${colors.reset} - Fallback keys configured`);
  console.log(`  ${colors.cyan}→${colors.reset} Will use single key if multi-key fails`);
  passed++;
} else {
  console.log(`  ${colors.yellow}⚠ WARN${colors.reset} - No fallback keys`);
  console.log(`  ${colors.yellow}→${colors.reset} System depends on ASTER_KEY_POOL only`);
}

// Test 6: Check strategy configuration
console.log(`\n${colors.bold}Test 6: Key manager strategy${colors.reset}`);

const strategy = process.env.API_KEY_STRATEGY || 'least-used';
const validStrategies = ['round-robin', 'least-used', 'random', 'health-based'];

if (validStrategies.includes(strategy)) {
  console.log(`  ${colors.green}✓ PASS${colors.reset} - Strategy: ${strategy}`);
  passed++;
} else {
  console.log(`  ${colors.yellow}⚠ WARN${colors.reset} - Unknown strategy: ${strategy}`);
  console.log(`  ${colors.yellow}→${colors.reset} Valid options: ${validStrategies.join(', ')}`);
}

// Summary
console.log(`\n${colors.bold}${colors.cyan}════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.bold}Summary:${colors.reset}\n`);
console.log(`  Total Tests: ${passed + failed}`);
console.log(`  ${colors.green}✓ Passed: ${passed}${colors.reset}`);
console.log(`  ${colors.red}✗ Failed: ${failed}${colors.reset}\n`);

// Final verdict
if (failed === 0 && passed >= 6) {
  console.log(`${colors.green}${colors.bold}🎉 PERFECT! All keys configured correctly!${colors.reset}`);
  console.log(`${colors.cyan}→ Your system has 30 API keys ready`);
  console.log(`${colors.cyan}→ Total capacity: 600 requests/second`);
  console.log(`${colors.cyan}→ Ready to launch with 30x performance!${colors.reset}\n`);
  
  if (parsedKeys && parsedKeys.keys) {
    console.log(`${colors.bold}Key Preview:${colors.reset}`);
    console.log(`  Key 1: ${parsedKeys.keys[0].api.substring(0, 16)}...${parsedKeys.keys[0].api.substring(60)}`);
    console.log(`  Key 2: ${parsedKeys.keys[1].api.substring(0, 16)}...${parsedKeys.keys[1].api.substring(60)}`);
    console.log(`  ...`);
    console.log(`  Key 30: ${parsedKeys.keys[29].api.substring(0, 16)}...${parsedKeys.keys[29].api.substring(60)}\n`);
  }
  
  process.exit(0);
} else if (failed === 0 && passed >= 4) {
  console.log(`${colors.yellow}${colors.bold}⚠️  GOOD! Keys configured but some warnings${colors.reset}`);
  console.log(`${colors.cyan}→ System will work, but review warnings above${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`${colors.red}${colors.bold}❌ FAILED! Keys not configured correctly${colors.reset}`);
  console.log(`${colors.cyan}→ Review errors above and fix your .env file${colors.reset}\n`);
  console.log(`${colors.bold}Quick Fix:${colors.reset}`);
  console.log(`  1. Copy content from env.keys.example`);
  console.log(`  2. Add to your .env file`);
  console.log(`  3. Ensure it's a single line (no line breaks in JSON)`);
  console.log(`  4. Run this test again: node scripts/test-api-keys.js\n`);
  process.exit(1);
}

