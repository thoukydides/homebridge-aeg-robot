// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { RX92ApplianceInfo, RX92ApplianceState, RX92CleaningCommand,
         RX92Command } from './aegapi-rx92-types.js';
import { Appliance, ApplianceId } from './aegapi-types.js';
import { AEGAuthoriseUserAgent } from './aegapi-ua-auth.js';
import { checkers } from './ti/aegapi-rx92-types.js';

// Access to the Electrolux Group API for an AEG RX9.2 robot vacuum cleaner
export class AEGAPIRX92 {

    // Create a new RX9.2 API
    constructor(
        readonly ua:          AEGAuthoriseUserAgent,
        readonly applianceId: ApplianceId
    ) {}

    // Get appliance info
    async getApplianceInfo(): Promise<RX92ApplianceInfo> {
        return this.ua.getJSON(checkers.RX92ApplianceInfo, `/api/v1/appliances/${this.applianceId}/info`);
    }

    // Get appliance state
    async getApplianceState(): Promise<RX92ApplianceState> {
        return this.ua.getJSON(checkers.RX92ApplianceState, `/api/v1/appliances/${this.applianceId}/state`);
    }

    // Send command to appliance
    async sendCleaningCommand(CleaningCommand: RX92CleaningCommand): Promise<void> {
        const body: RX92Command = { CleaningCommand };
        await this.ua.put(`/api/v1/appliances/${this.applianceId}/command`, body);
    }

    // Check whether an appliance is an AEG RX9.x robot vacuum cleaner
    static isRX92(appliance: Appliance): boolean {
        return appliance.applianceType === 'PUREi9';
    }
}