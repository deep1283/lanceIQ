import type { NextApiRequest, NextApiResponse } from 'next';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { generateHtml } from '@/lib/generate-html';
import QRCode from 'qrcode';

export const config = {
  maxDuration: 30, // 30 seconds
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

const MAX_PAYLOAD_SIZE = 200 * 1024; // 200KB

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Safeguard: Check payload size
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr.length > MAX_PAYLOAD_SIZE) {
         return res.status(413).json({ error: 'Payload size exceeds limit.' });
    }

    const { payload, headers, timestamp, status, id, showWatermark, hash, verificationUrl } = req.body;

    if (!payload || !headers || !timestamp || !id) {
       return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate QR Code if verification URL is present
    let qrCodeDataUrl;
    if (verificationUrl) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 100 });
      } catch (e) {
        console.error('Failed to generate QR code for PDF:', e);
      }
    }

    // 2. Generate HTML
    const html = generateHtml({ 
      id, 
      payload, 
      headers, 
      timestamp, 
      status, 
      showWatermark: showWatermark ?? true,
      hash,
      verificationUrl,
      qrCodeDataUrl
    });

    // 3. Launch Puppeteer
    const isLocal = process.env.NODE_ENV === 'development';
    
    let browser;
    if (isLocal) {
        const execPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        browser = await puppeteer.launch({
            args: [], // Local chrome doesn't need sparticuz args
            defaultViewport: { width: 1920, height: 1080 },
            executablePath: execPath, 
            headless: true,
        });
    } else {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: { width: 1920, height: 1080 },
            executablePath: await chromium.executablePath(),
            headless: true,
        });
    }

    const page = await browser.newPage();
    
    // Set content and wait for full load with generous timeout
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    
    // Small delay to ensure Tailwind processes
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });


    await browser.close();

    // 4. Return PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="webhook-proof-${id}.pdf"`);
    res.status(200).end(pdfBuffer);

  } catch (error: any) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
}
