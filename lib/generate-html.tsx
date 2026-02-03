import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CertificateTemplate } from '@/components/CertificateTemplate';
import { pdfStyles } from '@/lib/pdf-styles';

export function generateHtml(data: { 
  id: string, 
  payload: string, 
  headers: Record<string, string>, 
  timestamp: string, 
  status: number, 
  showWatermark?: boolean,
  hash?: string,
  verificationUrl?: string,
  qrCodeDataUrl?: string
}) {
    const componentHtml = renderToStaticMarkup(
        <CertificateTemplate 
            id={data.id}
            payload={data.payload}
            headers={data.headers}
            timestamp={data.timestamp}
            status={data.status}
            showWatermark={data.showWatermark ?? true}
            hash={data.hash}
            verificationUrl={data.verificationUrl}
            qrCodeDataUrl={data.qrCodeDataUrl}
        />
    );

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>LanceIQ ${data.id}</title>
          <style>
            ${pdfStyles}
          </style>
        </head>
        <body>
          <div id="root">${componentHtml}</div>
        </body>
      </html>
    `;
}
