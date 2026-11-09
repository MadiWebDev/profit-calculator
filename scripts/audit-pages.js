const fs = require('fs');
const path = require('path');

const sidebarPaths = [
  'orders', 'product-intel', 'profit', 'pnl', 'revenue-by-date', 'countries',
  'conversion', 'ltv', 'customers', 'report-guide', 'cogs-hub', 'products',
  'monthly-expenses', 'ad-platforms', 'ad-spend', 'other-fees', 'risk', 'alerts',
  'leaks', 'couriers', 'shipments', 'goals', 'simulator', 'bundles', 'copilot',
  'saved-views', 'scheduled-reports', 'reports', 'general', 'stores',
  'gateways', 'currency', 'tax', 'notifications', 'team', 'settings/api-keys',
  'settings/audit-log', 'security', 'settings/jobs', 'settings'
];

for (const p of sidebarPaths) {
  const dir = path.join('src/app/(dashboard)/dashboard', p);
  const pageFile = path.join(dir, 'page.tsx');
  if (!fs.existsSync(pageFile)) {
    console.error('Page missing:', pageFile);
    continue;
  }
  const content = fs.readFileSync(pageFile, 'utf8');

  // Check if it redirects on missing session/user
  const hasAuth = content.includes('auth()') || content.includes('use client');
  const hasUserCheck = content.includes('redirect("/auth/login")') || content.includes('redirect(') || content.includes('use client');

  // Check if client components exist
  const clientMatch = content.match(/from ["']\.\/(\w+Client)["']/);
  if (clientMatch) {
    const clientFile = path.join(dir, clientMatch[1] + '.tsx');
    if (!fs.existsSync(clientFile)) {
      console.log(p, 'Client file missing:', clientFile);
    }
  }

  // Look for unsafe array access like [0].something without checking length
  const unsafeIndex = content.match(/\w+\[0\]\.\w+/g);
  if (unsafeIndex) {
    console.log(p, 'Potential unsafe index access:', unsafeIndex);
  }
}
console.log('Finished checking client components and routes.');
