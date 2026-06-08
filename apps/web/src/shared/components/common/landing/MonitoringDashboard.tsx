'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface Trigger {
  id: string;
  name: string;
  category: 'proactive' | 'reactive' | 'external' | 'operational' | 'compliance';
  description: string;
}

const triggers: Trigger[] = [
  {
    id: 'hos-approaching',
    name: 'HOS Approaching',
    category: 'proactive',
    description: 'Driver approaching hours of service limits within 2 hours',
  },
  {
    id: 'hos-violation',
    name: 'HOS Violation',
    category: 'reactive',
    description: 'Driver has exceeded hours of service limits',
  },
  {
    id: 'not-moving',
    name: 'Driver Not Moving',
    category: 'reactive',
    description: 'Driver has not moved for 15+ minutes when scheduled to drive',
  },
  {
    id: 'dock-delay',
    name: 'Dock Delay',
    category: 'operational',
    description: 'Loading/unloading taking longer than estimated',
  },
  {
    id: 'weather-alert',
    name: 'Weather Alert',
    category: 'external',
    description: 'Severe weather conditions along route',
  },
  {
    id: 'traffic-delay',
    name: 'Traffic Delay',
    category: 'external',
    description: 'Significant traffic causing delays (>30 min)',
  },
  {
    id: 'fuel-low',
    name: 'Fuel Low',
    category: 'operational',
    description: 'Fuel level below threshold before next planned fuel stop',
  },
  {
    id: 'rest-skipped',
    name: 'Rest Stop Skipped',
    category: 'compliance',
    description: 'Driver skipped a planned rest stop',
  },
  {
    id: 'route-deviation',
    name: 'Route Deviation',
    category: 'operational',
    description: 'Driver has deviated significantly from planned route',
  },
  {
    id: 'eta-change',
    name: 'ETA Change',
    category: 'operational',
    description: 'Estimated arrival time has changed by >1 hour',
  },
  {
    id: 'customer-request',
    name: 'Customer Request',
    category: 'external',
    description: 'Customer requested delivery time change',
  },
  {
    id: 'vehicle-issue',
    name: 'Vehicle Issue',
    category: 'reactive',
    description: 'Vehicle malfunction or maintenance alert',
  },
  {
    id: 'appointment-risk',
    name: 'Appointment Risk',
    category: 'proactive',
    description: 'At risk of missing scheduled appointment',
  },
  {
    id: 'break-compliance',
    name: 'Break Compliance',
    category: 'compliance',
    description: 'Driver break requirements not being met',
  },
];

const categoryColors: Record<Trigger['category'], string> = {
  proactive: 'bg-white',
  reactive: 'bg-gray-300',
  external: 'bg-gray-400',
  operational: 'bg-gray-200',
  compliance: 'bg-gray-100',
};

export function MonitoringDashboard() {
  const [hoveredTrigger, setHoveredTrigger] = useState<string | null>(null);

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6 }}
        className="relative"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 text-gray-300 border border-white/20 rounded-full text-sm font-medium mb-4">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 bg-green-400 rounded-full"
            />
            <span>Monitoring every 60 seconds</span>
          </div>
          <p className="text-gray-400 max-w-2xl mx-auto">
            SALLY continuously monitors 14 trigger types across 5 categories to ensure route compliance and efficiency
          </p>
        </div>

        {/* Trigger grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {triggers.map((trigger, index) => (
            <motion.div
              key={trigger.id}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              onHoverStart={() => setHoveredTrigger(trigger.id)}
              onHoverEnd={() => setHoveredTrigger(null)}
              className="relative"
            >
              <div
                className={`h-full p-4 border rounded-lg transition-all duration-300 cursor-pointer ${
                  hoveredTrigger === trigger.id
                    ? 'shadow-card-hover border-white/40 bg-white/20'
                    : 'bg-white/10 border-white/20'
                }`}
              >
                {/* Pulse indicator */}
                <div className="relative mb-3">
                  <div className={`w-3 h-3 ${categoryColors[trigger.category]} rounded-full`} />
                  <motion.div
                    animate={{
                      scale: [1, 2, 1],
                      opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: index * 0.2,
                    }}
                    className={`absolute inset-0 w-3 h-3 ${categoryColors[trigger.category]} rounded-full`}
                  />
                </div>

                {/* Content */}
                <h4 className="text-sm font-semibold text-white mb-1 leading-tight">{trigger.name}</h4>
                <p className="text-xs text-gray-400 uppercase tracking-wide">{trigger.category}</p>

                {/* Tooltip on hover */}
                {hoveredTrigger === trigger.id && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute z-10 bottom-full left-0 right-0 mb-2 p-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs rounded-lg shadow-card-lg border border-gray-200 dark:border-gray-700"
                  >
                    {trigger.description}
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white dark:border-t-gray-900" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm">
          {Object.entries(categoryColors).map(([category, color]) => (
            <div key={category} className="flex items-center gap-2">
              <div className={`w-3 h-3 ${color} rounded-full border border-white/30`} />
              <span className="text-gray-400 capitalize">{category}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-12 grid grid-cols-3 gap-8 max-w-2xl mx-auto"
        >
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-1">14</div>
            <div className="text-sm text-gray-400">Trigger Types</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-1">60s</div>
            <div className="text-sm text-gray-400">Check Interval</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-1">24/7</div>
            <div className="text-sm text-gray-400">Monitoring</div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
