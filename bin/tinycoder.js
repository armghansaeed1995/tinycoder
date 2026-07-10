#!/usr/bin/env node

/**
 * TinyCoder CLI Entry Point
 * This file is purely the global executable wrapper.
 * All core logic is delegated to the src/ directory to keep the architecture clean.
 */

import { runCli } from '../src/index.js';

// Gracefully handle unexpected crashes to avoid dumping messy stack traces on the user
process.on('unhandledRejection', (err) => {
    console.error('\n[TinyCoder Fatal Error]:', err.message || err);
    process.exit(1);
});

// Start the application loop
runCli();