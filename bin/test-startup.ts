// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2024 Alexander Thoukydides

import { spawn } from 'child_process';
import assert from 'node:assert';

// Command to use to launch Homebridge
const SPAWN_COMMAND = 'homebridge';
const SPAWN_ARGS = '-D -I -P .. --strict-plugin-resolution'.split(' ');

// Log messages indicating success
const SUCCESS_OUTPUT_REGEX = /\[Homebridge AEG Robot Vacuum\] (Starting new authorisation|Using saved access token)/;

// Length of time to wait for the message
const TIMEOUT_MS = 15 * 1000; // (15 seconds)

// Run the test
void (async (): Promise<void> => {
    // Attempt to launch Homebridge
    const homebridge = spawn(SPAWN_COMMAND, SPAWN_ARGS, { stdio: 'pipe', timeout: TIMEOUT_MS });

    // Log any error output
    //homebridge.stderr.on('data', (data) => { console.error(`stderr: ${data.trim()}`); });

    // Collect stdout and check for success message(s)
    let output = '';
    homebridge.stdout.setEncoding('utf8');
    for await (const chunk of homebridge.stdout) {
        assert(typeof chunk === 'string');
        output += chunk.toString();
        if (SUCCESS_OUTPUT_REGEX.test(output)) {
            // Test completed successfully
            homebridge.kill('SIGTERM');
            console.log('Success');
            return;
        }
    }

    // Homebridge did not start successfully
    switch (homebridge.exitCode) {
    case null:  throw new Error('Unexpected stdout termination');
    case 0:     throw new Error('Unexpected successful process termination');
    default:    throw new Error(`Homebridge exited with code ${homebridge.exitCode}`);
    }
})();