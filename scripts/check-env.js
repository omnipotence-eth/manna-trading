#!/usr/bin/env node

/**
 * Environment Variables Checker
 * This script helps verify that your .env.local file is being loaded correctly
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking environment variables...\n');

// Check if .env.local exists
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  console.log('✅ .env.local file found');
  
  // Read and parse .env.local
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  
  console.log(`📄 Found ${Object.keys(envVars).length} environment variables in .env.local\n`);
  
  // Check required variables
  const requiredVars = [
    'ASTER_API_KEY',
    'ASTER_SECRET_KEY', 
    'NEXT_PUBLIC_ASTER_API_KEY',
    'DATABASE_URL'
  ];
  
  console.log('🔑 Required Variables Status:');
  requiredVars.forEach(varName => {
    const hasVar = envVars[varName] && envVars[varName].length > 0;
    console.log(`  ${hasVar ? '✅' : '❌'} ${varName}: ${hasVar ? 'Set' : 'Missing'}`);
  });
  
  console.log('\n📋 All Variables in .env.local:');
  Object.keys(envVars).forEach(key => {
    const value = envVars[key];
    const displayValue = key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD') 
      ? '*'.repeat(Math.min(value.length, 8)) 
      : value;
    console.log(`  ${key}=${displayValue}`);
  });
  
} else {
  console.log('❌ .env.local file not found');
  console.log('📝 Please create a .env.local file with your environment variables');
}

console.log('\n🌍 Current Process Environment Variables:');
const processEnvVars = [
  'NODE_ENV',
  'ASTER_API_KEY',
  'ASTER_SECRET_KEY',
  'NEXT_PUBLIC_ASTER_API_KEY',
  'DATABASE_URL',
  'VERCEL_URL'
];

processEnvVars.forEach(varName => {
  const value = process.env[varName];
  const hasVar = value && value.length > 0;
  const displayValue = varName.includes('KEY') || varName.includes('SECRET') 
    ? (hasVar ? '*'.repeat(Math.min(value.length, 8)) : 'Not set')
    : (hasVar ? value : 'Not set');
  console.log(`  ${hasVar ? '✅' : '❌'} ${varName}: ${displayValue}`);
});

console.log('\n💡 Tips:');
console.log('  - Make sure .env.local is in your project root directory');
console.log('  - Restart your development server after changing .env.local');
console.log('  - Never commit .env.local to version control');
console.log('  - Use .env.example as a template for required variables');
