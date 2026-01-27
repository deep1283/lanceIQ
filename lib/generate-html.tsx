import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CertificateTemplate } from '@/components/CertificateTemplate';

export function generateHtml(data: { id: string, payload: string, headers: Record<string, string>, timestamp: string, status: number, showWatermark?: boolean }) {
    const componentHtml = renderToStaticMarkup(
        <CertificateTemplate 
            id={data.id}
            payload={data.payload}
            headers={data.headers}
            timestamp={data.timestamp}
            status={data.status}
            showWatermark={data.showWatermark ?? true}
        />
    );

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>LanceIQ ${data.id}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@300;400;700;900&display=swap" rel="stylesheet">
          <script>
            tailwind.config = {
              theme: {
                extend: {
                  fontFamily: {
                    serif: ['Merriweather', 'serif'],
                    sans: ['Inter', 'sans-serif'],
                  }
                }
              }
            }
          </script>
          <style>
             body { -webkit-print-color-adjust: exact; }
          </style>
        </head>
        <body>
          <div id="root">${componentHtml}</div>
        </body>
      </html>
    `;
}
