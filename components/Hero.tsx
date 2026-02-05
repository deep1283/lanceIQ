"use client";

import React, { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import Link from "next/link";
import DarkVeil from "./DarkVeil";
import ElectricBorder from "./ElectricBorder";
import { Terminal, ShieldCheck, FileCheck, Lock } from "lucide-react";

// Coding Terminal Component to replace the dashboard image
const CodeTerminal = () => {
    const [lines, setLines] = useState<string[]>([]);
    
    // Auto-typing effect simulation
    useEffect(() => {
        const sequence = [
            "> Initializing LanceIQ Protocol...",
            "> Listening for webhook events on port 443...",
            "> [RECEIVED] POST /webhooks/stripe",
            "> Verifying signature: t=170634...,v1=4f3a...",
            "> Signature Status: [VALID] ✅",
            "> Generating Proof Certificate...",
            "> Certificate ID: cert_89234x9",
            "> [SUCCESS] PDF Generated & Stored Securely."
        ];
        
        let timeoutId: NodeJS.Timeout;
        let currentIndex = 0;

        const typeNextLine = () => {
            if (currentIndex < sequence.length) {
                const text = sequence[currentIndex];
                setLines(prev => [...prev, text]);
                currentIndex++;
                timeoutId = setTimeout(typeNextLine, 800);
            } else {
                // Wait before resetting
                timeoutId = setTimeout(() => {
                    setLines([]);
                    currentIndex = 0;
                    timeoutId = setTimeout(typeNextLine, 800);
                }, 3000);
            }
        };

        // Start the loop
        timeoutId = setTimeout(typeNextLine, 800);
        
        return () => clearTimeout(timeoutId);
    }, []);

    return (
        <div className="w-full h-full bg-[#0a0a0a] rounded-lg p-4 font-mono text-sm sm:text-base overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center gap-2 mb-4 border-b border-gray-800 pb-2">
                <div className="w-3 h-3 rounded-full bg-red-500"/>
                <div className="w-3 h-3 rounded-full bg-yellow-500"/>
                <div className="w-3 h-3 rounded-full bg-green-500"/>
                <span className="ml-2 text-gray-500 text-xs">LanceIQ-CLI — bash — 80x24</span>
            </div>
            <div className="flex-1 space-y-2 font-mono">
                {lines.map((line, i) => {
                    if (!line) return null;
                    return (
                    <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`${line.includes("[VALID]") || line.includes("[SUCCESS]") ? "text-green-400" : line.includes("[RECEIVED]") ? "text-blue-400" : "text-gray-300"}`}
                    >
                        {line}
                    </motion.div>
                    );
                })}
                <motion.div 
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="inline-block w-2 H-4 bg-gray-500 ml-1"
                >
                  _
                </motion.div>
            </div>
        </div>
    );
}

const ScrollTiltTerminal: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const rotateX = useSpring(useTransform(scrollYProgress, [0, 1], [-20, 10]), {
    stiffness: 100,
    damping: 20,
  });

  return (
    <motion.div
      ref={ref}
      className="relative w-full max-w-4xl aspect-[16/9] mx-auto"
      style={{
        transformStyle: "preserve-3d",
        transformOrigin: "center center",
        rotateX,
        perspective: "1000px",
      }}
    >
      <ElectricBorder color="#a855f7">
        <CodeTerminal />
      </ElectricBorder>
    </motion.div>
  );
};

const Hero: React.FC = () => {
  return (
    <>
      {/* Hero Section */}
      <div className="relative flex flex-col justify-center items-center overflow-hidden pt-32 pb-16 min-h-[90vh]">
        <div className="absolute inset-0">
          <DarkVeil />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/80 to-black pointer-events-none" />
        </div>

        <div className="relative z-10 text-center px-4 sm:px-10 max-w-5xl mx-auto">


          <motion.h1
            className="text-white text-5xl sm:text-7xl md:text-8xl font-bold tracking-tight mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            Proof of <br className="hidden sm:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 animate-gradient-x">
              Webhook Delivery
            </span>
          </motion.h1>

          <motion.p
            className="text-gray-400 text-lg sm:text-xl md:text-2xl max-w-2xl mx-auto font-light leading-relaxed mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Turn raw webhook payloads into clean, professional PDF certificates. Perfect for documentation, debugging, and client communication.
          </motion.p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/tool">
                <motion.button
                className="rounded-full py-4 px-8 text-base font-bold bg-white text-black hover:bg-gray-200 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] active:scale-95"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                >
                Generate Proof Now
                </motion.button>
            </Link>

          </div>
        </div>
      </div>

      {/* Terminal Demo Section */}
      <section className="relative w-full py-20 bg-black flex flex-col items-center justify-center px-4 overflow-hidden perspective-1000">
        <ScrollTiltTerminal />
        
        {/* Abstract Metrics */}
        <div className="w-full max-w-5xl mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-center text-white">
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
               className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/50 transition-colors"
             >
                <ShieldCheck className="w-10 h-10 text-purple-400 mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-2">Professional Records</h3>
                <p className="text-gray-400 text-sm">Clean, shareable PDFs that look official and are easy to understand.</p>
             </motion.div>
             
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
               transition={{ delay: 0.1 }}
               className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/50 transition-colors"
             >
                <FileCheck className="w-10 h-10 text-cyan-400 mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-2">Instant Generation</h3>
                <p className="text-gray-400 text-sm">Paste your payload, click download. Certificate ready in seconds.</p>
             </motion.div>

             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
               transition={{ delay: 0.2 }}
               className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-pink-500/50 transition-colors"
             >
                <Lock className="w-10 h-10 text-pink-400 mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-2">Zero Data Storage</h3>
                <p className="text-gray-400 text-sm">Your webhook data never touches our servers. Processing happens in your browser.</p>
             </motion.div>
        </div>
      </section>
    </>
  );
};

export default Hero;
