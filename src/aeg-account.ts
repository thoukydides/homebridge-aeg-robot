// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import { AEGAPI } from './aegapi.js';
import { AEGRobot } from './aeg-robot.js';
import { formatList, formatSeconds, plural } from './utils.js';
import { Config } from './config-types.js';
import { AEGAPIRX9 } from './aegapi-rx9.js';
import { API_DAILY_LIMIT, API_DAILY_POLL_LIMIT } from './settings.js';

// An AEG user account manager
export class AEGAccount {

    // Electrolux Group API
    readonly api: AEGAPI;

    // AEG RX 9 / Electrolux Pure i9 robot managers
    readonly robots = new Map<string, AEGRobot>();

    // Promise that is resolved by successful initialisation
    private readonly readyPromise: Promise<void>;

    // Create a new AEG user account manager
    constructor(
        readonly log:    Logger,
        readonly config: Config
    ) {
        // Create a new API instance
        this.api = new AEGAPI(log, config);

        // Start asynchronous initialisation
        this.readyPromise = this.init();
    }

    // Return a list of AEG RX9.1 and RX9.2 robot vacuum cleaners in the account
    async getRobots(): Promise<Promise<AEGRobot>[]> {
        await this.readyPromise;
        return [...this.robots.values()].map(robot => robot.waitUntilReady());
    }

    // One-off asynchronous initialisation
    async init(): Promise<void> {
        // Read the list of appliances, and initialise any robots
        const appliances = await this.api.getAppliances();
        const robots       = appliances.filter(appliance =>  AEGAPIRX9.isRX9(appliance));
        const incompatible = appliances.filter(appliance => !AEGAPIRX9.isRX9(appliance));

        // Ensure that the polling interval is under the daily API limit
        this.checkPollingInterval(robots.length);

        // Initial all robot appliances
        robots.forEach(appliance => {
            const robot = new AEGRobot(this.log, this, appliance);
            this.robots.set(appliance.applianceId, robot);
        });

        // Log details of any incompatible appliances
        if (incompatible.length) {
            this.log.info(`Ignoring ${plural(incompatible.length, 'incompatible appliance')}: `
                          + formatList(incompatible.map(a => `${a.applianceName} (${a.applianceType})`)));
        }
    }

    // Ensure that the polling interval is under the daily API limit
    checkPollingInterval(robots: number): void {
        // Check whether the daily rate limit will be exceeded
        const { statusSeconds } = this.config.pollIntervals;
        const dailyCalls = (seconds: number): number => Math.ceil(robots * 24 * 60 * 60 / seconds);
        if (dailyCalls(statusSeconds) < API_DAILY_LIMIT) return;

        // Pick a more suitable polling interval
        const newStatusSeconds = Math.ceil(robots * 24 * 60 * 60 / API_DAILY_POLL_LIMIT);
        this.config.pollIntervals.statusSeconds = newStatusSeconds;

        // Log details of the increased poll interval
        this.log.warn(`Increasing polling interval from ${formatSeconds(statusSeconds)} to ${formatSeconds(newStatusSeconds)} `
                    + `due to Electrolux Group API rate limit of ${API_DAILY_LIMIT} calls/day`);
        this.log.warn(`With ${plural(robots, 'robot vacuum cleaner')} this reduces the polling rate from `
                    + `${dailyCalls(statusSeconds)} to ${dailyCalls(newStatusSeconds)} calls/day`);
        this.log.warn('Increase the value of pollIntervals.statusSeconds in the homebridge config.json file');
    }
}