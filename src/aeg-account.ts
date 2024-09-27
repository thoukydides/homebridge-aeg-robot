// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import { AEGAPI } from './aegapi.js';
import { AEGRobot } from './aeg-robot.js';
import { formatList, plural } from './utils.js';
import { Config } from './config-types.js';
import { AEGAPIRX9 } from './aegapi-rx9.js';

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
        const incompatible: string[] = [];
        appliances.forEach(appliance => {
            if (AEGAPIRX9.isRX9(appliance)) {
                const robot = new AEGRobot(this.log, this, appliance);
                this.robots.set(appliance.applianceId, robot);
            } else {
                const { applianceName, applianceType } = appliance;
                incompatible.push(`${applianceName} (${applianceType})`);
            }
        });

        // Log details of any incompatible appliances
        if (incompatible.length) {
            this.log.info(`Ignoring ${plural(incompatible.length, 'incompatible appliance')}: `
                          + formatList(incompatible));
        }
    }
}