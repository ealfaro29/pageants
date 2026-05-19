import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const cwd = process.cwd();
const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];
for (const file of envFiles) {
  const fullPath = path.join(cwd, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missing = required.filter(name => {
  const value = process.env[name];
  return !value || value.includes('YOUR_');
});

if (missing.length > 0) {
  console.error('[deploy-check] Missing Firebase env vars:');
  for (const key of missing) console.error(`- ${key}`);
  console.error('Create .env.local from .env.example before deploy.');
  process.exit(1);
}

console.log('[deploy-check] Firebase env vars look good.');
