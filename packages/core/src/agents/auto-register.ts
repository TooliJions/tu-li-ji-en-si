/**
 * Agent Auto-Registration Module
 *
 * Import this module as a side-effect to ensure all agents self-register
 * with the global agentRegistry before any orchestrator calls create().
 *
 * Usage:
 *   import '@cybernovelist/core/agents/auto-register'; // or
 *   import './auto-register' from within the core package
 */

import { agentRegistry } from './registry';

// Import each agent module — their side-effect registrations will
// populate the agentRegistry singleton.
import './context-card';
import './intent-director';
import './executor';
import './scene-polisher';
import './chapter-planner';
import './quality-reviewer';
import './fact-checker';
import './surgical-rewriter';
import './memory-extractor';
import './chapter-summarizer';
import './summary-compressor';
import './audit-tier-classifier';
import './character';
import './compliance-reviewer';
import './dialogue-checker';
import './entity-auditor';
import './fatigue-analyzer';
import './hook-auditor';
import './market-injector';
import './style-auditor';
import './style-fingerprint';
import './style-refiner';
import './title-voice-auditor';
import './outline-generator';
import './detailed-outline-generator';

// Verify all expected agents are registered (development-time sanity check)
const EXPECTED_AGENTS = [
  'context-card',
  'intent-director',
  'chapter-executor',
  'scene-polisher',
  'chapter-planner',
  'quality-reviewer',
  'fact-checker',
  'surgical-rewriter',
  'memory-extractor',
  'chapter-summarizer',
  'summary-compressor',
  'audit-tier-classifier',
  'character',
  'compliance-reviewer',
  'dialogue-checker',
  'entity-auditor',
  'fatigue-analyzer',
  'hook-auditor',
  'market-injector',
  'style-auditor',
  'style-fingerprint',
  'style-refiner',
  'title-voice-auditor',
  'outline-generator',
  'detailed-outline-generator',
];

// 仅在非生产环境执行开发时校验，避免生产构建中无意义的检查开销
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const missing = EXPECTED_AGENTS.filter((name) => !agentRegistry.has(name));
  if (missing.length > 0) {
    throw new Error(`Agent registration incomplete. Missing: ${missing.join(', ')}`);
  }
}
