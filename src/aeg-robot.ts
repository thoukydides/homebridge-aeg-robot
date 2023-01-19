// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';
import { EventEmitter } from 'events';

import { AEGAccount } from './aeg-account';
import { AEGApplianceAPI } from './aegapi-appliance';
import { Activity, Appliance, ApplianceNamePatch, Battery, CleaningCommand,
         Connection, DomainAppliance, Dustbin, PowerMode, Status } from './aegapi-types';
import { PrefixLogger } from './logger';
import { logError } from './utils';
import { AEGRobotLog } from './aeg-robot-log';
import { AEGRobotCtrlActivity, AEGRobotCtrlName,
         AEGRobotCtrlPower } from './aeg-robot-ctrl';

// Simplified robot activities
export enum SimpleActivity {
    Other   = 'Other',
    Clean   = 'Clean',
    Pitstop = 'Pitstop',
    Pause   = 'Pause',
    Return  = 'Return'
}

// Dynamic information about a robot
export interface DynamicStatus {
    // Raw values provided by the AEG API
    rawName:            string;
    firmware:           string;
    timezone?:          string | null;
    battery?:           Battery;
    activity?:          Activity;
    dustbin?:           Dustbin;
    rawPower?:          PowerMode;
    enabled:            boolean;
    connected:          boolean;
    // Derived values
    simpleActivity?:    SimpleActivity;
    isBatteryLow?:      boolean;
    isCharging?:        boolean;
    isDustbinEmpty?:    boolean;
    isDocked?:          boolean;
    isActive?:          boolean;
    isBusy?:            boolean;
    isFault?:           boolean;
    isError?:           unknown;
    name:               string;
    power?:             PowerMode;
}
export type DynamicStatusKey = keyof DynamicStatus;
export type EventName = 'info' | 'appliance' | 'preUpdate';

// An AEG RX 9 / Electrolux Pure i9 robot manager
export class AEGRobot extends EventEmitter {

    // A custom logger
    readonly log: Logger;

    // AEG appliance API
    readonly api: AEGApplianceAPI;

    // Control the robot
    readonly setName:       (name:      string)            => Promise<void>;
    readonly setPower:      (power:     PowerMode)         => Promise<void>;
    readonly setActivity:   (command:   CleaningCommand)   => Promise<void>;

    // Static information about the robot (mostly initialised asynchronously)
    readonly applianceId:   string; // Product ID
    readonly hardware:      string; // Hardware version
    pnc         = '';               // Product Number Code
    sn          = '';               // Serial Number
    brand       = '';
    model       = '';

    // Dynamic information about the robot
    readonly status: DynamicStatus = { rawName: '', firmware: '', enabled: false, connected: false, name: '' };
    private emittedStatus: Partial<DynamicStatus> = {};

    // Promise that is resolved by successful initialisation
    private readonly readyPromise: Promise<void>;

    // Create a new robot manager
    constructor(
        log:                Logger,
        readonly account:   AEGAccount,
        appliance:          Appliance
    ) {
        super({ captureRejections: true });
        super.on('error', err => logError(this.log, 'Event', err));

        // Construct a Logger and API for this robot
        this.log = new PrefixLogger(log, appliance.applianceData.applianceName);
        this.api = account.api.applianceAPI(appliance.applianceId);

        // Initialise static information that is already known
        this.applianceId    = appliance.applianceId;
        this.model          = appliance.applianceData.modelName;
        this.hardware       = appliance.properties.reported.platform || '';

        // Allow the robot to be controlled
        this.setName        = new AEGRobotCtrlName    (this).makeSetter();
        this.setPower       = new AEGRobotCtrlPower   (this).makeSetter();
        this.setActivity    = new AEGRobotCtrlActivity(this).makeSetter();

        // Start logging information about this robot
        new AEGRobotLog(this);

        // Initialise dynamic information
        this.updateFromAppliances(appliance);

        // Start asynchronous initialisation
        this.readyPromise = this.init();
    }

    // Wait for the robot manager to initialise
    async waitUntilReady(): Promise<this> {
        await this.readyPromise;
        return this;
    }

    // Read the full static appliance details to complete initialisation
    async init(): Promise<void> {
        try {
            // Read the full appliance details
            const info = await this.api.getApplianceInfo();
            this.pnc    = info.pnc;
            this.sn     = info.serialNumber;
            this.brand  = info.brand;
            this.model += ` (${info.model})`;
            this.emit('info');
        } catch (err) {
            logError(this.log, 'Appliance info', err);
        }
    }

    // Describe this robot
    toString(): string {
        const bits = [
            this.brand,
            this.model,
            this.status.rawName && `"${this.status.rawName}"`,
            `(Product ID ${this.applianceId})`
        ];
        return bits.filter(bit => bit?.length).join(' ');
    }

    // Update dynamic robot state
    updateFromAppliances(appliance: Appliance): void {
        // Extract the relevant information
        const reported = appliance.properties.reported;
        this.updateStatus({
            // Status that is always provided
            rawName:        appliance.applianceData.applianceName,
            enabled:        appliance.status === Status.Enabled,
            connected:      appliance.connectionState === Connection.Connected,

            // Other details may be absent if the robot is not reachable
            firmware:       reported.firmwareVersion || '',
            battery:        reported.batteryStatus,
            activity:       reported.robotStatus,
            dustbin:        reported.dustbinStatus,
            rawPower:       reported.powerMode
        });

        // Generate derived state
        this.updateDerivedAndEmit();
        this.emit('appliance');
    }

    // Update the name and timezone
    updateFromDomains(appliance: DomainAppliance | ApplianceNamePatch) {
        this.updateStatus({
            rawName:    appliance.applianceName,
            timezone:   appliance.timeZoneStandardName
        });
        this.updateDerivedAndEmit();
    }

    // Update server health
    updateServerHealth(err?: unknown): void {
        this.status.isError = err;
        this.updateDerivedAndEmit();
    }

    // Update robot status that is derived from other information sources
    updateDerivedAndEmit(): void {
        this.updateDerived();
        this.emit('preUpdate');
        this.emitChangeEvents();
    }

    // Update derived values
    updateDerived(): void {
        // Mapping of robot activities
        type ActivityMap =                      [SimpleActivity,       boolean | null, boolean,    boolean];
        const activityMap: Record<Activity, ActivityMap> = {
            //                                   Activity                   Docked     Charging    Active
            [Activity.Cleaning]:                [SimpleActivity.Clean,      false,     false,      true],
            [Activity.PausedCleaning]:          [SimpleActivity.Pause,      false,     false,      false],
            [Activity.SpotCleaning]:            [SimpleActivity.Clean,      false,     false,      true],
            [Activity.PausedSpotCleaning]:      [SimpleActivity.Pause,      false,     false,      false],
            [Activity.Return]:                  [SimpleActivity.Return,     false,     false,      true],
            [Activity.PausedReturn]:            [SimpleActivity.Pause,      false,     false,      false],
            [Activity.ReturnForPitstop]:        [SimpleActivity.Pitstop,    false,     false,      true],
            [Activity.PausedReturnForPitstop]:  [SimpleActivity.Pause,      false,     false,      false],
            [Activity.Charging]:                [SimpleActivity.Other,      true,      true,       true],
            [Activity.Sleeping]:                [SimpleActivity.Other,      null,      false,      true],
            [Activity.Error]:                   [SimpleActivity.Other,      null,      false,      false],
            [Activity.Pitstop]:                 [SimpleActivity.Pitstop,    true,      true,       true],
            [Activity.ManualSteering]:          [SimpleActivity.Other,      false,     false,      false],
            [Activity.FirmwareUpgrade]:         [SimpleActivity.Other,      null,      false,      false]
        };
        const [activity, isDocked, isCharging, isActive] =
            this.status.activity === undefined
            ? [SimpleActivity.Other] : activityMap[this.status.activity];
        const isBusy = [SimpleActivity.Clean, SimpleActivity.Pitstop].includes(activity);

        // Any identified problem is treated as a fault
        const isFault = this.status.isError !== undefined
                     || !this.status.enabled
                     || !this.status.connected
                     || this.status.activity === Activity.Error
                     || this.status.battery === Battery.Dead
                     || this.status.isDustbinEmpty === false;

        // Update the status
        this.updateStatus({
            simpleActivity: activity,
            isBatteryLow:   this.status.battery !== undefined
                            && this.status.battery <= Battery.Low,
            isCharging,
            isDustbinEmpty: this.status.dustbin !== undefined
                            && ![Dustbin.Missing, Dustbin.Full].includes(this.status.dustbin),
            isDocked:       isDocked ?? this.status.battery === Battery.FullyCharged,
            isActive:       isActive && !isFault,
            isBusy,
            isFault,
            name:           this.status.rawName,
            power:          isBusy ? this.status.rawPower : undefined
        });
    }

    // Apply a partial update to the robot status
    updateStatus(update: Partial<DynamicStatus>): void {
        Object.assign(this.status, update);
    }

    // Apply updates to the robot status and emit events for changes
    emitChangeEvents(): void {
        // Identify the values that have changed
        const keys = Object.keys(this.status) as DynamicStatusKey[];
        const changed = keys.filter(key => this.status[key] !== this.emittedStatus[key]);
        if (!changed.length) return;

        // Log a summary of the changes
        const toText = (value: unknown) => {
            if (value === undefined) return '?';
            if (typeof(value) === 'string' && /[- <>:,]/.test(value)) return `"${value}"`;
            return `${value}`;
        };
        const summary = changed.map(key =>
            `${key}: ${toText(this.emittedStatus[key])}->${toText(this.status[key])}`);
        this.log.debug(summary.join(', '));

        // Emit events for each change
        changed.forEach(key => this.emit(key, this.status[key], this.emittedStatus[key]));

        // Store a copy of the updated values
        this.emittedStatus = {...this.status};
    }

    // Install a handler for a robot status event
    on(event: EventName, listener: () => void): this;
    on<Key extends DynamicStatusKey>(event: Key, listener: (newValue: DynamicStatus[Key], oldValue: DynamicStatus[Key]) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this {
        return super.on(event, listener);
    }

    // Install a single-shot handler for a robot status event
    once(event: EventName, listener: () => void): this;
    once<Key extends DynamicStatusKey>(event: Key, listener: (newValue: DynamicStatus[Key], oldValue: DynamicStatus[Key]) => void): this;
    once(event: string, listener: (...args: unknown[]) => void): this {
        return super.once(event, listener);
    }

    // Emit an event
    emit(event: EventName): boolean;
    emit<Key extends keyof DynamicStatus>(event: Key, newValue: DynamicStatus[Key], oldValue: DynamicStatus[Key]): boolean;
    emit(event: string, ...args: unknown[]): boolean {
        return super.emit(event, ...args);
    }
}