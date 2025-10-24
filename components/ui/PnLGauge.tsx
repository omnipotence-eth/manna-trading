'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface PnLGaugeProps {
  value: number; // P&L percentage
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
}

export default function PnLGauge({
  value,
  label = 'P&L',
  size = 'md',
  showPercentage = true,
}: PnLGaugeProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    // Animate value change
    const timeout = setTimeout(() => {
      setDisplayValue(value);
    }, 100);
    return () => clearTimeout(timeout);
  }, [value]);

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return { container: 'w-20 h-20', text: 'text-lg', label: 'text-xs' };
      case 'lg':
        return { container: 'w-40 h-40', text: 'text-4xl', label: 'text-base' };
      default:
        return { container: 'w-28 h-28', text: 'text-2xl', label: 'text-sm' };
    }
  };

  const sizes = getSizeClasses();
  const isPositive = displayValue >= 0;
  const clampedValue = Math.max(-100, Math.min(100, displayValue));
  const rotation = (clampedValue / 100) * 135; // -135 to +135 degrees

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${sizes.container}`}>
        {/* Background circle */}
        <svg className="absolute inset-0" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="rgba(16, 185, 129, 0.1)"
            strokeWidth="8"
          />
        </svg>

        {/* Progress arc */}
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <motion.circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={isPositive ? '#10b981' : '#ef4444'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={251.2} // 2 * PI * 40
            initial={{ strokeDashoffset: 251.2 }}
            animate={{
              strokeDashoffset: 251.2 - (Math.abs(clampedValue) / 100) * 251.2,
            }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`font-bold font-mono ${sizes.text} ${
              isPositive ? 'text-neon-green' : 'text-red-500'
            }`}
          >
            {isPositive && '+'}
            {displayValue.toFixed(1)}
            {showPercentage && '%'}
          </motion.div>
        </div>
      </div>

      {/* Label */}
      <div className={`mt-2 text-green-500/80 ${sizes.label}`}>{label}</div>
    </div>
  );
}

