/**
 * Test the Hybrid AI API
 */

const testHybridAPI = async () => {
  try {
    console.log('🧪 Testing Hybrid AI API...');
    
    // Test GET endpoint
    const getResponse = await fetch('http://localhost:3000/api/trading/hybrid');
    const getData = await getResponse.json();
    console.log('✅ GET endpoint working:', getData.message);
    
    // Test POST analyze endpoint
    const postResponse = await fetch('http://localhost:3000/api/trading/hybrid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'analyze',
        symbol: 'BTC/USDT'
      }),
    });
    
    const postData = await postResponse.json();
    console.log('✅ POST analyze working:', postData.message);
    console.log('🤖 AI Analysis:', postData.analysis?.aiResponse);
    
    return true;
  } catch (error) {
    console.error('❌ Hybrid API test failed:', error.message);
    return false;
  }
};

testHybridAPI().catch(console.error);
