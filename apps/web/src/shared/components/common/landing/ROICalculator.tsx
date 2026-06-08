'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function ROICalculator() {
  const [fleetSize, setFleetSize] = useState(10);
  const [violations, setViolations] = useState(0.5);
  const [displayedSavings, setDisplayedSavings] = useState(0);

  // Calculate savings
  const violationCost = 12000; // Industry average penalty (FMCSA max: $19,246)
  const annualSavings = violations * violationCost * fleetSize * 12;
  const timeSavings = fleetSize * 4 * 52; // 4 hours per week per driver (conservative estimate)

  // Animate the counter
  useEffect(() => {
    let start = 0;
    const duration = 1000;
    const increment = annualSavings / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= annualSavings) {
        setDisplayedSavings(annualSavings);
        clearInterval(timer);
      } else {
        setDisplayedSavings(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [annualSavings]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6 }}
        className="bg-card border border-border rounded-lg p-8 shadow-card"
      >
        {/* Inputs */}
        <div className="space-y-6 mb-8">
          {/* Fleet size */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">Fleet Size</label>
              <span className="text-2xl font-bold text-foreground">{fleetSize}</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={fleetSize}
              onChange={(e) => setFleetSize(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1</span>
              <span>100</span>
            </div>
          </div>

          {/* Violations per driver per month */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">Current Violations/Driver/Month</label>
              <span className="text-2xl font-bold text-foreground">{violations}</span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={violations}
              onChange={(e) => setViolations(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0</span>
              <span>10</span>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {/* Annual savings */}
          <motion.div
            key={annualSavings}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-primary text-primary-foreground p-6 rounded-lg"
          >
            <div className="text-sm font-medium mb-2 text-gray-300 dark:text-gray-700">
              Annual Violation Cost Savings
            </div>
            <div className="text-4xl font-bold tracking-tight">{formatCurrency(displayedSavings)}</div>
            <div className="text-xs text-muted-foreground mt-2">Based on $12,000 per violation (industry average)</div>
          </motion.div>

          {/* Time savings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted p-4 rounded-lg border border-border">
              <div className="text-xs font-medium text-muted-foreground mb-1">Time Saved Annually</div>
              <div className="text-2xl font-bold text-foreground">{timeSavings.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">hours per year</div>
            </div>

            <div className="bg-muted p-4 rounded-lg border border-border">
              <div className="text-xs font-medium text-muted-foreground mb-1">Efficiency Gain</div>
              <div className="text-2xl font-bold text-foreground">30-50%</div>
              <div className="text-xs text-muted-foreground">admin time reduction</div>
            </div>
          </div>

          {/* Visual bar chart */}
          <div className="space-y-3 pt-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Impact Breakdown</div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Violation Prevention</span>
                <span className="text-sm font-medium text-foreground">85%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: '85%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className="h-full bg-primary"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Time Efficiency</span>
                <span className="text-sm font-medium text-foreground">92%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: '92%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.4 }}
                  className="h-full bg-gray-700 dark:bg-gray-300"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Driver Satisfaction</span>
                <span className="text-sm font-medium text-foreground">78%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: '78%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.6 }}
                  className="h-full bg-gray-500 dark:bg-gray-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Fine print */}
        <p className="text-xs text-muted-foreground mt-6 text-center">
          Calculations based on industry-average violation costs and documented automation benefits. FMCSA penalties
          range up to $19,246 per violation. Actual savings vary by fleet size, current compliance rates, and
          implementation.
        </p>
      </motion.div>
    </div>
  );
}
