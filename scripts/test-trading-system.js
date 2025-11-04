#!/usr/bin/env node
/**
 * Comprehensive Trading System Test Suite
 * Tests all critical components without risking real money
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USE_HTTPS = BASE_URL.startsWith('https');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Utility: Make HTTP request
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = USE_HTTPS ? https : http;
    
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = client.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Utility: Log test result
function logTest(name, passed, message = '', data = null) {
  const status = passed ? `${colors.green}✓ PASS${colors.reset}` : `${colors.red}✗ FAIL${colors.reset}`;
  console.log(`  ${status} ${name}`);
  
  if (message) {
    console.log(`    ${colors.cyan}→${colors.reset} ${message}`);
  }
  
  if (data && !passed) {
    console.log(`    ${colors.yellow}Data:${colors.reset} ${JSON.stringify(data).substring(0, 200)}`);
  }
  
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

// Utility: Log warning
function logWarning(message) {
  console.log(`  ${colors.yellow}⚠ WARNING${colors.reset} ${message}`);
  results.warnings++;
}

// Utility: Section header
function logSection(title) {
  console.log(`\n${colors.bold}${colors.magenta}━━━ ${title} ━━━${colors.reset}\n`);
}

// Test 1: Health Check
async function testHealthCheck() {
  logSection('🏥 System Health Check');
  
  try {
    const response = await makeRequest('/api/health');
    logTest(
      'Health endpoint responds',
      response.status === 200,
      `Status: ${response.status}`,
      response.data
    );
    
    if (response.data.status === 'healthy') {
      logTest('System is healthy', true);
    } else {
      logTest('System is healthy', false, `Status: ${response.data.status}`);
    }
  } catch (error) {
    logTest('Health endpoint responds', false, error.message);
  }
}

// Test 2: Database Connection
async function testDatabase() {
  logSection('🗄️  Database Connection');
  
  try {
    const response = await makeRequest('/api/setup/database');
    logTest(
      'Database initializes',
      response.status === 200 || response.data?.success === true,
      response.data?.message || 'Database ready',
      response.data
    );
  } catch (error) {
    logTest('Database initializes', false, error.message);
  }
  
  // Test trade retrieval
  try {
    const response = await makeRequest('/api/trades');
    logTest(
      'Can query trades',
      response.status === 200,
      `Found ${response.data?.data?.length || 0} trades`,
      response.data
    );
  } catch (error) {
    logTest('Can query trades', false, error.message);
  }
}

// Test 3: Aster DEX API Connection
async function testAsterAPI() {
  logSection('🔗 Aster DEX API Connection');
  
  try {
    const response = await makeRequest('/api/aster/account');
    logTest(
      'Aster API responds',
      response.status === 200 || response.data?.success === true,
      response.data?.message || 'Connected',
      response.data
    );
    
    if (response.data?.data?.availableBalance !== undefined) {
      const balance = response.data.data.availableBalance;
      logTest(
        'Account balance retrieved',
        true,
        `Balance: $${balance.toFixed(2)}`
      );
      
      if (balance < 5) {
        logWarning('Balance below minimum trading amount ($5)');
      }
    }
  } catch (error) {
    logTest('Aster API responds', false, error.message);
  }
  
  // Test exchange info
  try {
    const response = await makeRequest('/api/aster/exchange-info');
    logTest(
      'Exchange info available',
      response.status === 200 && response.data?.symbols?.length > 0,
      `Found ${response.data?.symbols?.length || 0} trading pairs`,
      response.data
    );
  } catch (error) {
    logTest('Exchange info available', false, error.message);
  }
}

// Test 4: AI/Ollama Connection
async function testAIConnection() {
  logSection('🤖 AI/Ollama Connection');
  
  try {
    const response = await makeRequest('/api/multi-agent?action=test-deepseek');
    const isSuccess = response.status === 200 && response.data?.success === true;
    
    logTest(
      'Ollama/DeepSeek connection',
      isSuccess,
      response.data?.message || 'Connection test',
      response.data
    );
    
    if (isSuccess && response.data?.model) {
      logTest(
        'DeepSeek model available',
        true,
        `Model: ${response.data.model}`
      );
    }
  } catch (error) {
    logTest('Ollama/DeepSeek connection', false, error.message);
    logWarning('AI agents will not work without Ollama. System will use fallback logic.');
  }
}

// Test 5: Market Scanner
async function testMarketScanner() {
  logSection('📊 Market Scanner');
  
  try {
    const response = await makeRequest('/api/market-scan-diagnostic');
    const isSuccess = response.status === 200 && response.data?.success === true;
    
    logTest(
      'Market scanner runs',
      isSuccess,
      response.data?.message || 'Scanner executed',
      response.data
    );
    
    if (response.data?.data) {
      const { totalSymbols, opportunities, volumeSpikes } = response.data.data;
      
      logTest(
        'Market data retrieved',
        totalSymbols > 0,
        `Scanned ${totalSymbols} symbols, found ${opportunities?.length || 0} opportunities`
      );
      
      if (volumeSpikes?.length > 0) {
        logTest(
          'Volume spikes detected',
          true,
          `Found ${volumeSpikes.length} volume spikes`
        );
      }
    }
  } catch (error) {
    logTest('Market scanner runs', false, error.message);
  }
}

// Test 6: Agent System
async function testAgentSystem() {
  logSection('🤖 Multi-Agent System');
  
  try {
    const response = await makeRequest('/api/agent-insights');
    const isSuccess = response.status === 200;
    
    logTest(
      'Agent insights available',
      isSuccess,
      `Status: ${response.status}`,
      response.data
    );
    
    if (response.data?.data?.length > 0) {
      logTest(
        'Agents have generated insights',
        true,
        `Found ${response.data.data.length} insights`
      );
    } else {
      logWarning('No agent insights yet (system may need time to generate them)');
    }
  } catch (error) {
    logTest('Agent insights available', false, error.message);
  }
  
  // Test agent runner status
  try {
    const response = await makeRequest('/api/agent-runner');
    const isRunning = response.data?.isRunning === true;
    
    logTest(
      'Agent runner status',
      response.status === 200,
      isRunning ? 'Running' : 'Stopped',
      response.data
    );
    
    if (isRunning && response.data?.activeWorkflows !== undefined) {
      logTest(
        'Active workflows tracked',
        true,
        `${response.data.activeWorkflows} active workflows`
      );
    }
  } catch (error) {
    logTest('Agent runner status', false, error.message);
  }
}

// Test 7: Position Monitoring
async function testPositionMonitoring() {
  logSection('📈 Position Monitoring');
  
  try {
    const response = await makeRequest('/api/positions');
    logTest(
      'Position endpoint responds',
      response.status === 200,
      `Status: ${response.status}`,
      response.data
    );
    
    if (response.data?.data) {
      const positions = Array.isArray(response.data.data) ? response.data.data : [];
      logTest(
        'Positions retrieved',
        true,
        `Found ${positions.length} open positions`
      );
      
      if (positions.length > 0) {
        const totalPnL = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
        console.log(`    ${colors.cyan}→${colors.reset} Total P&L: $${totalPnL.toFixed(2)}`);
      }
    }
  } catch (error) {
    logTest('Position endpoint responds', false, error.message);
  }
}

// Test 8: Risk Management
async function testRiskManagement() {
  logSection('🛡️  Risk Management');
  
  try {
    const response = await makeRequest('/api/aster/account');
    
    if (response.data?.data?.availableBalance !== undefined) {
      const balance = response.data.data.availableBalance;
      
      // Check balance thresholds
      logTest(
        'Account balance check',
        balance >= 5,
        balance >= 5 
          ? `Balance sufficient: $${balance.toFixed(2)}` 
          : `Balance too low: $${balance.toFixed(2)} (minimum $5)`,
        { balance }
      );
      
      // Check risk settings
      if (balance < 100) {
        console.log(`    ${colors.cyan}→${colors.reset} Micro account mode (<$100): Max 1 position, 3% risk, 4:1 R:R`);
      } else if (balance < 500) {
        console.log(`    ${colors.cyan}→${colors.reset} Small account mode (<$500): Max 2 positions, 5% risk, 3:1 R:R`);
      } else {
        console.log(`    ${colors.cyan}→${colors.reset} Standard account mode: Max 2 positions, 10% risk, 2.5:1 R:R`);
      }
    }
  } catch (error) {
    logTest('Account balance check', false, error.message);
  }
  
  // Test problematic coin detection
  try {
    const response = await makeRequest('/api/problematic-coins');
    logTest(
      'Problematic coin filter',
      response.status === 200,
      `Blacklist active`,
      response.data
    );
    
    if (response.data?.data?.blacklistedSymbols) {
      console.log(`    ${colors.cyan}→${colors.reset} Blacklisted: ${response.data.data.blacklistedSymbols.join(', ')}`);
    }
  } catch (error) {
    logTest('Problematic coin filter', false, error.message);
  }
}

// Test 9: Performance Tracking
async function testPerformanceTracking() {
  logSection('📊 Performance Tracking');
  
  try {
    const response = await makeRequest('/api/performance');
    logTest(
      'Performance endpoint responds',
      response.status === 200,
      `Status: ${response.status}`,
      response.data
    );
    
    if (response.data?.data) {
      const { totalTrades, winRate, totalPnL } = response.data.data;
      
      if (totalTrades !== undefined) {
        logTest(
          'Trade statistics available',
          true,
          `${totalTrades} trades, ${winRate?.toFixed(1) || 0}% win rate, $${totalPnL?.toFixed(2) || 0} total P&L`
        );
      }
    }
  } catch (error) {
    logTest('Performance endpoint responds', false, error.message);
  }
}

// Test 10: System Configuration
async function testSystemConfiguration() {
  logSection('⚙️  System Configuration');
  
  try {
    const response = await makeRequest('/api/system-audit');
    logTest(
      'System audit available',
      response.status === 200,
      `Status: ${response.status}`,
      response.data
    );
    
    if (response.data?.config) {
      const { confidenceThreshold, stopLossPercent, takeProfitPercent } = response.data.config;
      
      console.log(`    ${colors.cyan}→${colors.reset} Confidence threshold: ${(confidenceThreshold * 100).toFixed(0)}%`);
      console.log(`    ${colors.cyan}→${colors.reset} Stop loss: ${stopLossPercent}%`);
      console.log(`    ${colors.cyan}→${colors.reset} Take profit: ${takeProfitPercent}%`);
      
      if (confidenceThreshold < 0.5) {
        logWarning('Confidence threshold below 50% - may generate many false positives');
      }
    }
  } catch (error) {
    logTest('System audit available', false, error.message);
  }
}

// Generate final report
function generateReport() {
  logSection('📋 Test Summary');
  
  const total = results.passed + results.failed;
  const passRate = total > 0 ? (results.passed / total * 100).toFixed(1) : 0;
  
  console.log(`\n  Total Tests: ${total}`);
  console.log(`  ${colors.green}✓ Passed: ${results.passed}${colors.reset}`);
  console.log(`  ${colors.red}✗ Failed: ${results.failed}${colors.reset}`);
  console.log(`  ${colors.yellow}⚠ Warnings: ${results.warnings}${colors.reset}`);
  console.log(`  ${colors.bold}Pass Rate: ${passRate}%${colors.reset}\n`);
  
  // Overall status
  if (results.failed === 0) {
    console.log(`  ${colors.green}${colors.bold}🎉 ALL TESTS PASSED! System is ready for trading.${colors.reset}\n`);
    return 0;
  } else if (results.failed <= 2) {
    console.log(`  ${colors.yellow}${colors.bold}⚠️  SOME TESTS FAILED. Review failed tests before trading.${colors.reset}\n`);
    return 1;
  } else {
    console.log(`  ${colors.red}${colors.bold}❌ MULTIPLE FAILURES. System not ready for trading.${colors.reset}\n`);
    return 1;
  }
}

// Main test runner
async function runTests() {
  console.log(`\n${colors.bold}${colors.cyan}════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  🧪 Manna Trading System - Comprehensive Test Suite${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}════════════════════════════════════════════════════════${colors.reset}\n`);
  console.log(`  Testing: ${colors.bold}${BASE_URL}${colors.reset}\n`);
  
  try {
    await testHealthCheck();
    await testDatabase();
    await testAsterAPI();
    await testAIConnection();
    await testMarketScanner();
    await testAgentSystem();
    await testPositionMonitoring();
    await testRiskManagement();
    await testPerformanceTracking();
    await testSystemConfiguration();
    
    const exitCode = generateReport();
    process.exit(exitCode);
  } catch (error) {
    console.error(`\n${colors.red}Fatal error running tests:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Run tests
runTests();

