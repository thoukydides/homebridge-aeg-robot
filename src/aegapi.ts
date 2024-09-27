// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { Logger } from 'homebridge';

import { AEGAuthoriseUserAgent } from './aegapi-ua-auth.js';
import { ApplianceId, ApplianceInfo, Appliances, ApplianceState,
         Command } from './aegapi-types.js';
import { Config } from './config-types.js';
import { AEGAPITest } from './aegapi-test.js';
import { AEGAPIRX9 } from './aegapi-rx9.js';
import { checkers } from './ti/aegapi-types.js';

// Access to the Electrolux Group API
export class AEGAPI {

    // User agent used for all requests
    readonly ua: AEGAuthoriseUserAgent;

    // Create a new API
    constructor(
        readonly log:    Logger,
        readonly config: Config
    ) {
        this.ua = new AEGAuthoriseUserAgent(log, config);

        // Run API tests if enabled
        if (config.debug.includes('Run API Tests')) {
            const unsafe = config.debug.includes('Run Unsafe API Tests');
            new AEGAPITest(log, this, unsafe);
        }
    }

    // Get user appliances
    async getAppliances(): Promise<Appliances> {
        return this.ua.getJSON(checkers.Appliances, '/api/v1/appliances');
    }

    // Get appliance info
    async getApplianceInfo(applianceId: ApplianceId): Promise<ApplianceInfo> {
        return this.ua.getJSON(checkers.ApplianceInfo, `/api/v1/appliances/${applianceId}/info`);
    }

    // Get appliance state
    async getApplianceState(applianceId: ApplianceId): Promise<ApplianceState> {
        return this.ua.getJSON(checkers.ApplianceState, `/api/v1/appliances/${applianceId}/state`);
    }

    // Send command to appliance
    async sendCommand(applianceId: ApplianceId, command: Command): Promise<void> {
        await this.ua.put(`/api/v1/appliances/${applianceId}/command`, command);
    }

    // Create an API for an AEG RX9.1 or RX9.2 robot vacuum cleaner
    rx9API(applianceId: ApplianceId): AEGAPIRX9 {
        return new AEGAPIRX9(this.ua, applianceId);
    }
}