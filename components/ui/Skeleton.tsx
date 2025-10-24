'use client';

import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width = '100%',
  height = variant === 'text' ? '1rem' : '100%',
  animation = 'pulse',
}: SkeletonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full';
      case 'text':
        return 'rounded';
      default:
        return 'rounded-lg';
    }
  };

  const getAnimationStyles = () => {
    if (animation === 'none') return '';
    if (animation === 'wave') {
      return 'animate-shimmer bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 bg-[length:200%_100%]';
    }
    return 'animate-pulse bg-gray-800';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`${getVariantStyles()} ${getAnimationStyles()} ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-effect p-6 rounded-lg space-y-4">
      <Skeleton height="2rem" width="60%" />
      <Skeleton height="4rem" />
      <div className="flex gap-4">
        <Skeleton height="3rem" width="30%" />
        <Skeleton height="3rem" width="30%" />
        <Skeleton height="3rem" width="30%" />
      </div>
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="glass-effect p-6 rounded-lg">
      <Skeleton height="2rem" width="40%" className="mb-4" />
      <Skeleton height="300px" animation="wave" />
    </div>
  );
}

export function SkeletonPosition() {
  return (
    <div className="glass-effect p-4 rounded-lg flex items-center gap-4">
      <Skeleton variant="circular" width="48px" height="48px" />
      <div className="flex-1 space-y-2">
        <Skeleton height="1.5rem" width="40%" />
        <Skeleton height="1rem" width="60%" />
      </div>
      <Skeleton height="2rem" width="80px" />
    </div>
  );
}

