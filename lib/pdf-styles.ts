// Minimal inline CSS for PDF generation
// This replaces the Tailwind CDN dependency for more reliable PDF rendering

export const pdfStyles = `
/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; border-width: 0; border-style: solid; border-color: currentColor; }

:root {
  --slate-50: #f8fafc;
  --slate-100: #f1f5f9;
  --slate-200: #e2e8f0;
  --slate-300: #cbd5e1;
  --slate-400: #94a3b8;
  --slate-500: #64748b;
  --slate-600: #475569;
  --slate-700: #334155;
  --slate-800: #1e293b;
  --slate-900: #0f172a;
  --red-600: #dc2626;
}

body { 
  -webkit-print-color-adjust: exact; 
  print-color-adjust: exact;
  font-family: 'Merriweather', Georgia, serif;
  color: var(--slate-800);
}

.font-serif { font-family: 'Merriweather', Georgia, serif; }
.font-sans { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
.font-mono { font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace; }

/* Layout */
.w-full { width: 100%; }
.min-h-screen { min-height: 100vh; }
.mx-auto { margin-left: auto; margin-right: auto; }
.relative { position: relative; }
.absolute { position: absolute; }
.inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
.inset-4 { top: 1rem; right: 1rem; bottom: 1rem; left: 1rem; }
.inset-5 { top: 1.25rem; right: 1.25rem; bottom: 1.25rem; left: 1.25rem; }
.top-12 { top: 3rem; }
.right-12 { right: 3rem; }
.bottom-12 { bottom: 3rem; }
.left-12 { left: 3rem; }
.z-10 { z-index: 10; }

/* Flexbox & Grid */
.flex { display: flex; }
.grid { display: grid; }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.gap-2 { gap: 0.5rem; }
.gap-4 { gap: 1rem; }
.gap-8 { gap: 2rem; }
.items-start { align-items: flex-start; }
.items-center { align-items: center; }
.items-end { align-items: flex-end; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.shrink-0 { flex-shrink: 0; }

/* Spacing */
.p-1 { padding: 0.25rem; }
.p-2 { padding: 0.5rem; }
.p-4 { padding: 1rem; }
.p-6 { padding: 1.5rem; }
.p-12 { padding: 3rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.pt-6 { padding-top: 1.5rem; }
.pb-2 { padding-bottom: 0.5rem; }
.pb-4 { padding-bottom: 1rem; }
.mt-2 { margin-top: 0.5rem; }
.mt-8 { margin-top: 2rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-10 { margin-bottom: 2.5rem; }
.mb-12 { margin-bottom: 3rem; }
.space-y-6 > * + * { margin-top: 1.5rem; }

/* Typography */
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-4xl { font-size: 2.25rem; line-height: 2.5rem; }
.text-\\[8px\\] { font-size: 8px; }
.text-\\[10px\\] { font-size: 10px; }
.font-light { font-weight: 300; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.italic { font-style: italic; }
.uppercase { text-transform: uppercase; }
.tracking-tight { letter-spacing: -0.025em; }
.tracking-wider { letter-spacing: 0.05em; }
.tracking-widest { letter-spacing: 0.1em; }
.leading-tight { line-height: 1.25; }
.leading-relaxed { line-height: 1.625; }
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.break-all { word-break: break-all; }
.whitespace-pre-wrap { white-space: pre-wrap; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inline-block { display: inline-block; }

/* Colors */
.bg-white { background-color: white; }
.bg-slate-50 { background-color: var(--slate-50); }
.bg-slate-100 { background-color: var(--slate-100); }
.bg-slate-100\\/50 { background-color: rgba(241, 245, 249, 0.5); }
.text-slate-300 { color: var(--slate-300); }
.text-slate-400 { color: var(--slate-400); }
.text-slate-500 { color: var(--slate-500); }
.text-slate-600 { color: var(--slate-600); }
.text-slate-700 { color: var(--slate-700); }
.text-slate-800 { color: var(--slate-800); }
.text-slate-900 { color: var(--slate-900); }
.text-red-600 { color: var(--red-600); }

/* Borders */
.border { border-width: 1px; border-style: solid; }
.border-2 { border-width: 2px; }
.border-4 { border-width: 4px; }
.border-b { border-bottom-width: 1px; border-bottom-style: solid; }
.border-b-2 { border-bottom-width: 2px; }
.border-t { border-top-width: 1px; border-top-style: solid; }
.border-l-4 { border-left-width: 4px; }
.border-slate-100 { border-color: var(--slate-100); }
.border-slate-200 { border-color: var(--slate-200); }
.border-slate-300 { border-color: var(--slate-300); }
.border-slate-900 { border-color: var(--slate-900); }
.border-l-slate-300 { border-left-color: var(--slate-300); }
.rounded-lg { border-radius: 0.5rem; }
.rounded-full { border-radius: 9999px; }
.double-border { border-style: double; }

/* Effects */
.overflow-hidden { overflow: hidden; }
.pointer-events-none { pointer-events: none; }
.opacity-30 { opacity: 0.3; }

/* Sizing */
.w-4 { width: 1rem; }
.w-5 { width: 1.25rem; }
.w-24 { width: 6rem; }
.w-1\\/3 { width: 33.333333%; }
.w-\\[210mm\\] { width: 210mm; }
.h-4 { height: 1rem; }
.h-5 { height: 1.25rem; }
.h-24 { height: 6rem; }
.min-h-\\[297mm\\] { min-height: 297mm; }
.max-w-sm { max-width: 24rem; }
.max-w-\\[200px\\] { max-width: 200px; }
.max-w-\\[300px\\] { max-width: 300px; }

/* Table */
table { border-collapse: collapse; }
`;

export default pdfStyles;
