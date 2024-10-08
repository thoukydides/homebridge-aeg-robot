// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import { setTimeout } from 'node:timers/promises';

import { MS, logError } from './utils.js';

// Multiple of interval to treat as a failure
const TIMEOUT_MULTIPLE  = 3;
const TIMEOUT_OFFSET    = 10 * MS;

// Perform an action periodically with error reporting and timeout
export class Heartbeat {

    // Abort signal used to stop a watchdog
    abortController?: AbortController;

    // The result of the last action
    lastError: unknown;

    // Create a new periodic action
    constructor(
        readonly log:       Logger,
        readonly name:      string,
        readonly interval:  number,
        readonly action:     () => Promise<void>,
        readonly failure:   (err?: unknown) => void
    ) {
        void this.doAction();
        void this.resetWatchdog();
    }

    // Perform the action periodically indefinitely
    async doAction(): Promise<never> {
        for (;;) {
            try {
                await this.action();
                void this.resetWatchdog();
            } catch (err) {
                logError(this.log, this.name, err);
                this.lastError = err;
            }
            await setTimeout(this.interval);
        }
    }

    // Reset the timeout
    async resetWatchdog(): Promise<void> {
        try {
            // Kill any previous watchdog, indicating any previous timeout as cleared
            this.abortController?.abort();
            if (this.lastError) {
                this.failure();
                this.lastError = undefined;
            }

            // Start a new watchdog
            this.abortController = new AbortController();
            const { signal } = this.abortController;
            await setTimeout(this.interval * TIMEOUT_MULTIPLE + TIMEOUT_OFFSET, undefined, { signal });

            // The timeout has occurred, so report the failure
            this.lastError ??= new Error(`${this.name} watchdog timeout`);
            this.failure(this.lastError);
        } catch (cause) {
            if (cause instanceof Error && cause.name === 'AbortError') return;
            logError(this.log, this.name, cause);
        }
    }
}