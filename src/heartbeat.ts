// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';
import { logError, sleep } from './utils';

// Multiple of interval to treat as a failure
const TIMEOUT_MULTIPLE  = 3;
const TIMEOUT_OFFSET    = 10 * 1000;

// Perform an action periodically with error reporting and timeout
export class Heartbeat {

    // Abort signal used to stop a watchdog
    private killWatchdog?: () => void;

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
        this.doAction();
        this.resetWatchdog();
    }

    // Perform the action periodically indefinitely
    async doAction(): Promise<never> {
        for (;;) {
            try {
                await this.action();
                this.resetWatchdog();
            } catch (err) {
                logError(this.log, this.name, err);
                this.lastError = err;
            }
            await sleep(this.interval);
        }
    }

    // Reset the timeout
    async resetWatchdog(): Promise<void> {
        try {
            // Kill any previous watchdog
            this.killWatchdog?.();
            if (this.lastError) {
                this.failure();
                this.lastError = undefined;
            }

            // Start a new watchdog
            const abort: Promise<never> = new Promise((_, reject) => {
                this.killWatchdog = () => reject('kill');
            });
            await sleep(this.interval * TIMEOUT_MULTIPLE + TIMEOUT_OFFSET, abort);

            // Report the timeout
            this.lastError ??= new Error(`${this.name} watchdog timeout`);
            this.failure(this.lastError);
        } catch (cause) {
            if (cause !== 'kill') logError(this.log, this.name, cause);
        }
    }
}