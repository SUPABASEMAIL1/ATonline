const fs = require('fs');
const file = 'src/components/estore/EStoreApp.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add OrderTracker import
if (!content.includes('import { OrderTracker }')) {
  content = content.replace(
    "import { StoreCheckout } from './StoreCheckout';",
    "import { StoreCheckout } from './StoreCheckout';\nimport { OrderTracker } from './OrderTracker';\nimport { useSearchParams } from 'react-router-dom';"
  );
}

// 2. Add TrackPage component inside EStoreApp.tsx (above EStoreApp or below it, let's just add it below imports)
const trackPageComp = `
function TrackPage({ settings }: { settings: AppSettings | null }) {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  if (!id) return <div className="p-8 text-center">Order ID not found</div>;
  return <OrderTracker orderId={id} settings={settings} />;
}
`;

if (!content.includes('function TrackPage')) {
  content = content.replace(
    "export function EStoreApp() {",
    trackPageComp + "\nexport function EStoreApp() {"
  );
}

// 3. Add Route
if (!content.includes('path="/store/track"')) {
  content = content.replace(
    "</Routes>",
    `  <Route path="/store/track" element={<TrackPage settings={settings} />} />\n      </Routes>`
  );
}

fs.writeFileSync(file, content);
