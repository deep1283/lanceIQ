import React from 'react';
import './ElectricBorder.css';

interface ElectricBorderProps {
  children: React.ReactNode;
  className?: string;
  color?: string;
}

const ElectricBorder: React.FC<ElectricBorderProps> = ({ 
  children, 
  className = '',
  color = '#00f0ff'
}) => {
  return (
    <div className={`electric-border-wrapper ${className}`} style={{ '--electric-color': color } as React.CSSProperties}>
      <div className="electric-border">
        <div className="electric-border-line electric-border-line-top"></div>
        <div className="electric-border-line electric-border-line-right"></div>
        <div className="electric-border-line electric-border-line-bottom"></div>
        <div className="electric-border-line electric-border-line-left"></div>
      </div>
      <div className="electric-border-content">
        {children}
      </div>
    </div>
  );
};

export default ElectricBorder;
