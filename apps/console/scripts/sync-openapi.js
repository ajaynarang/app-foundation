const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const OPENAPI_URL = process.env.OPENAPI_URL || 'https://app-api-staging.appshore.in/api/openapi.json';
const OUTPUT_PATH = path.join(__dirname, '../public/openapi.json');

async function syncOpenAPI() {
  console.log('🔄 Syncing OpenAPI spec from backend...');
  console.log(`   URL: ${OPENAPI_URL}`);

  // Check if file already exists (use cached version)
  if (fs.existsSync(OUTPUT_PATH)) {
    console.log('ℹ️  Using existing OpenAPI spec (already cached)');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const protocol = OPENAPI_URL.startsWith('https') ? https : require('http');

    protocol
      .get(OPENAPI_URL, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const spec = JSON.parse(data);

            // Validate spec has required fields
            if (!spec.openapi && !spec.swagger) {
              throw new Error('Invalid OpenAPI spec (missing openapi/swagger field)');
            }

            if (!spec.paths) {
              throw new Error('Invalid OpenAPI spec (missing paths)');
            }

            fs.writeFileSync(OUTPUT_PATH, JSON.stringify(spec, null, 2));

            const endpointCount = Object.keys(spec.paths || {}).length;
            console.log('✅ OpenAPI spec synced successfully!');
            console.log(`   Version: ${spec.info?.version || 'unknown'}`);
            console.log(`   Endpoints: ${endpointCount}`);

            resolve();
          } catch (error) {
            console.error('❌ Failed to parse OpenAPI spec:', error.message);
            // Don't reject - allow build to continue
            console.warn('⚠️  Continuing without OpenAPI spec sync');
            resolve();
          }
        });
      })
      .on('error', (error) => {
        console.error('❌ Failed to fetch OpenAPI spec:', error.message);
        console.warn('⚠️  Continuing without OpenAPI spec sync (backend may not be running)');
        // Don't reject - allow build to continue
        resolve();
      });
  });
}

// Run if called directly
if (require.main === module) {
  syncOpenAPI()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { syncOpenAPI };
