#!/usr/bin/env node

/**
 * TinyCoder CLI Entry Point.
 * All core logic lives under src/; this file is just the global executable wrapper.
 */

import { runCli } from '../src/index.js';

// Gracefully handle unexpected crashes to avoid dumping messy stack traces.
process.on('unhandledRejection', (err) => {
    const message = err && err.message ? err.message : String(err);
    console.error(`\n[TinyCoder Fatal Error]: ${message}`);
    process.exit(1);
});

runCli();
