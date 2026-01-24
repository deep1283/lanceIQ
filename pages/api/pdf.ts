import type { NextApiRequest, NextApiResponse } from 'next';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { generateHtml } from '@/lib/generate-html';

export const config = {
  maxDuration: 30, // 30 seconds
  api: {
    bodyParser: {
      sizeLimit: '4mb', // Handle slightly larger payloads if needed, though we check manually
    },
  },
};

const MAX_PAYLOAD_SIZE = 200 * 1024; // 200KB

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Safeguard: Check payload size (Approximate via Content-Length or JSON string length)
    // Note: req.body is already parsed by Next.js default body parser unless disabled. 
    // We can check JSON string length.
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr.length > MAX_PAYLOAD_SIZE) {
         return res.status(413).json({ error: 'Payload size exceeds limit.' });
    }

    const { payload, headers, timestamp, status, id } = req.body;

    if (!payload || !headers || !timestamp || !id) {
       return res.status(400).json({ error: 'Missing required fields' });
    }

    // 2. Generate HTML
    const html = generateHtml({ id, payload, headers, timestamp, status });

    // 3. Launch Puppeteer
    const isLocal = process.env.NODE_ENV === 'development';
    
    let browser;
    if (isLocal) {
        const execPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        browser = await puppeteer.launch({
            args: chromium.args,
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
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 10000 });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await browser.close();

    // 4. Return PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="webhook-proof-${id}.pdf"`);
    res.status(200).send(pdfBuffer);

  } catch (error: any) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
}
