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
];

const missing = EXPECTED_AGENTS.filter((name) => !agentRegistry.has(name));
if (missing.length > 0) {
  throw new Error(`Agent registration incomplete. Missing: ${missing.join(', ')}`);
}
