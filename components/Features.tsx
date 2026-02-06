"use client";
import React from "react";
import { motion } from "framer-motion";
import Particles from "./Particles";
import { Scale, Zap, FileText, Globe, Code2, Shield } from "lucide-react";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
  delay?: number;
}

const FeatureCard = ({ title, description, icon, className = "", delay = 0 }: FeatureCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay }}
    className={`p-8 rounded-3xl bg-zinc-900/50 border border-white/10 backdrop-blur-sm hover:bg-zinc-800/50 hover:border-purple-500/30 transition-all duration-300 group flex flex-col ${className}`}
  >
    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-white group-hover:scale-110 group-hover:bg-purple-500/20 group-hover:text-purple-300 transition-all duration-300 shadow-lg">
      {icon}
    </div>
    <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">{title}</h3>
    <p className="text-gray-400 font-light leading-relaxed">{description}</p>
  </motion.div>
);

const Features: React.FC = () => {
  return (
    <div className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-black overflow-hidden" id="features">
      {/* Background Particles */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <Particles
          particleColors={["#a855f7", "#3b82f6"]}
          particleCount={150}
          particleSpread={15}
          speed={0.2}
          particleBaseSize={80}
          moveParticlesOnHover={false}
          alphaParticles={true}
          disableRotation={false}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold text-white mb-6"
          >
            Documentation that <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Actually Looks Good</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-400 font-light"
          >
            Transform messy API logs into clean, shareable records your team and clients can understand.
          </motion.p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[minmax(250px,auto)]">
          {/* Large Card 1 */}
          <FeatureCard
            title="Documentation Ready"
            description="Create professional records for internal tracking, client communication, or dispute resolution. Better than a raw server log."
            icon={<Scale size={28} />}
            className="md:col-span-2 bg-gradient-to-br from-zinc-900/80 to-purple-900/10"
            delay={0.1}
          />

          {/* Regular Card */}
          <FeatureCard
            title="Header Display"
            description="See your webhook headers formatted clearly. Signatures, timestamps, and content types—all in one view."
            icon={<Zap size={28} />}
            delay={0.2}
          />

           {/* Regular Card */}
           <FeatureCard
            title="Professional PDF"
            description="Clean, well-structured PDFs that look official. Custom headers, timestamps, and formatted payloads."
            icon={<FileText size={28} />}
            delay={0.3}
          />

           {/* Large Card 2 */}
           <FeatureCard
            title="Works With Any Provider"
            description="Stripe, PayPal, GitHub, Shopify, Twilio, or your custom tools. If it sends JSON, we can format it."
            icon={<Globe size={28} />}
            className="md:col-span-2 bg-gradient-to-br from-zinc-900/80 to-blue-900/10"
            delay={0.4}
          />

          {/* Regular Card */}
          <FeatureCard
            title="Developer Friendly"
            description="Copy-paste your payload and headers. We handle the formatting, parsing, and certificate generation."
            icon={<Code2 size={28} />}
            delay={0.5}
          />
          
          {/* Regular Card */}
          <FeatureCard
            title="Verification Ready"
            description="Designed to support optional server-side signature checks and store verification metadata with each certificate."
            icon={<Shield size={28} />}
            delay={0.6}
          />
        </div>
      </div>
    </div>
  );
};

export default Features;
