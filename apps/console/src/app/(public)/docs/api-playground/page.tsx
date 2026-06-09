'use client';

import { useEffect, useRef } from 'react';

export default function ApiPlaygroundPage() {
  const containerRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = containerRef.current;
    if (!iframe) return;

    const specUrl = `${window.location.origin}/openapi.json`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Platform API Playground</title>
  <style>body { margin: 0; background: #1a1a2e; }</style>
</head>
<body>
  <script id="api-reference" data-url="${specUrl}" data-configuration='${JSON.stringify({
    darkMode: true,
    hideDownloadButton: false,
    hideModels: false,
    defaultHttpClient: { targetKey: 'node', clientKey: 'fetch' },
    metaData: { title: 'Platform API Playground' },
  })}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

    iframe.srcdoc = html;
  }, []);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] -mx-6 -my-8">
      <iframe
        ref={containerRef}
        className="w-full border-0"
        style={{ height: 'calc(100vh - 3.5rem)' }}
        title="Platform API Playground"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
