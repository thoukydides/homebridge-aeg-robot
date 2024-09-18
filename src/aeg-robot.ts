// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';
import { EventEmitter } from 'events';

import { AEGAccount } from './aeg-account.js';
import { AEGRobotCtrlActivity } from './aeg-robot-ctrl.js';
import { AEGRobotLog } from './aeg-robot-log.js';
import { Config } from './config-types.js';
import { Heartbeat } from './heartbeat.js';
import { formatList, logError, MS } from './utils.js';
import { PrefixLogger } from './logger.js';
import { RX92ApplianceInfo, RX92ApplianceState, RX92BatteryStatus,
         RX92Capabilities, RX92CleaningCommand, RX92Dustbin, RX92Message,
         RX92PowerMode, RX92RobotStatus } from './aegapi-rx92-types.js';
import { AEGAPIRX92 } from './aegapi-rx92.js';
import { Appliance } from './aegapi-types.js';

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
    // Raw values provided by the Electrolux Group API
    name:               string;
    hardware:           string;
    firmware:           string;
    capabilities:       RX92Capabilities[];
    battery?:           RX92BatteryStatus;
    activity?:          RX92RobotStatus;
    dustbin?:           RX92Dustbin;
    rawPower?:          RX92PowerMode;
    enabled:            boolean;
    connected:          boolean;
    // API errors
    isServerError?:     unknown;
    isRobotError?:      unknown;
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
    power?:             RX92PowerMode;
}
export type StatusEvent = keyof DynamicStatus;

// Other event types
interface DataEventType {
    message:        RX92Message;
}
type DataEvent = keyof DataEventType;
type VoidEvent = 'info' | 'appliance' | 'preUpdate';
type DataEventListener  <Event extends DataEvent>   = (value: DataEventType[Event]) => void
type StatusEventListener<Event extends StatusEvent> = (newValue: DynamicStatus[Event], oldValue: DynamicStatus[Event]) => void

// A generic event listener, compatible with all prototypes
type Listener = (...args: unknown[]) => void;

// An AEG RX 9 / Electrolux Pure i9 robot manager
export class AEGRobot extends EventEmitter {

    // Configuration
    readonly config: Config;

    // A custom logger
    readonly log: Logger;

    // Electrolux Group API for an AEG RX9.2 robot vacuum cleaner
    readonly api: AEGAPIRX92;

    // Control the robot
    readonly setActivity:   (command:   RX92CleaningCommand)    => void;

    // Static information about the robot (mostly initialised asynchronously)
    readonly applianceId:   string; // Product ID
    pnc         = '';               // Product Number Code
    sn          = '';               // Serial Number
    brand       = '';
    model       = '';

    // Dynamic information about the robot
    readonly status: DynamicStatus = {
        name:           '',
        hardware:       '',
        firmware:       '',
        capabilities:   [],
        enabled:        false,
        connected:      false
    };

    private emittedStatus: Partial<DynamicStatus> = {};

    // Messages about the robot
    private readonly emittedMessages    = new Set<number>();

    // Periodic polling tasks
    private heartbeats: Heartbeat[] = [];

    // Promise that is resolved by successful initialisation
    private readonly readyPromise: Promise<void>;

    // Create a new robot manager
    constructor(
        log:                Logger,
        readonly account:   AEGAccount,
        appliance:          Appliance
    ) {
        super({ captureRejections: true });
        super.on('error', err => { logError(this.log, 'Event', err); });

        // Construct a Logger and API for this robot
        this.config = account.config;
        this.log = new PrefixLogger(log, appliance.applianceName);
        this.api = account.api.rx92API(appliance.applianceId);

        // Initialise static information that is already known
        this.applianceId    = appliance.applianceId;
        this.model          = appliance.applianceType;

        // Allow the robot to be controlled
        this.setActivity    = new AEGRobotCtrlActivity(this).makeSetter();

        // Start logging information about this robot
        new AEGRobotLog(this);

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
            this.updateFromApplianceInfo(info);
            const pollState = async (): Promise<void> => {
                const state = await this.api.getApplianceState();
                this.updateFromApplianceState(state);
            };
            await pollState();

            // Start polling the appliance state periodically
            this.heartbeats = [
                new Heartbeat(this.log, 'Appliance state',
                              this.config.pollIntervals.statusSeconds * MS,
                              pollState, (err) => { this.heartbeat(err); })
            ];
        } catch (err) {
            logError(this.log, 'Appliance info', err);
        }
    }

    // Describe this robot
    toString(): string {
        const bits = [
            this.brand,
            this.model,
            this.status.name && `"${this.status.name}"`,
            `(Product ID ${this.applianceId})`
        ];
        return bits.filter(bit => bit.length).join(' ');
    }

    // Set static robot state
    updateFromApplianceInfo(info: RX92ApplianceInfo): void {
        const { serialNumber, pnc, brand, model } = info.applianceInfo;
        this.pnc    = pnc;
        this.sn     = serialNumber;
        this.brand  = brand;
        this.model += ` (${model})`;
        this.emit('info');
    }

    // Update dynamic robot state
    updateFromApplianceState(state: RX92ApplianceState): void {
        // Extract the relevant information
        const { reported } = state.properties;
        this.updateStatus({
            name:           reported.applianceName,
            enabled:        state.status === 'enabled',
            connected:      state.connectionState === 'Connected',
            capabilities:   Object.keys(reported.capabilities) as RX92Capabilities[],
            hardware:       reported.platform,
            firmware:       reported.firmwareVersion,
            battery:        reported.batteryStatus,
            activity:       reported.robotStatus,
            dustbin:        reported.dustbinStatus,
            rawPower:       reported.powerMode
        });

        // Extract any new messages
        this.emitMessages(reported.messageList.messages);

        // Generate derived state
        this.updateDerivedAndEmit();
        this.emit('appliance');
    }

    // Periodically poll the appliance state
    async pollApplianceState(): Promise<void> {
        const state = await this.api.getApplianceState();
        this.updateFromApplianceState(state);
    }

    // Handle a status update for a periodic action
    heartbeat(err?: unknown): void {
        if (!err && this.heartbeats.some(heartbeat => heartbeat.lastError)) {
            // This heartbeat indicates success, but there is still a failure
            return;
        }

        // Update the robot health
        this.status.isRobotError = err;
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
        const activityMap: Record<RX92RobotStatus, ActivityMap> = {
            //                                          Activity                   Docked     Charging    Active
            [RX92RobotStatus.Cleaning]:                [SimpleActivity.Clean,      false,     false,      true],
            [RX92RobotStatus.PausedCleaning]:          [SimpleActivity.Pause,      false,     false,      false],
            [RX92RobotStatus.SpotCleaning]:            [SimpleActivity.Clean,      false,     false,      true],
            [RX92RobotStatus.PausedSpotCleaning]:      [SimpleActivity.Pause,      false,     false,      false],
            [RX92RobotStatus.Return]:                  [SimpleActivity.Return,     false,     false,      true],
            [RX92RobotStatus.PausedReturn]:            [SimpleActivity.Pause,      false,     false,      false],
            [RX92RobotStatus.ReturnForPitstop]:        [SimpleActivity.Pitstop,    false,     false,      true],
            [RX92RobotStatus.PausedReturnForPitstop]:  [SimpleActivity.Pause,      false,     false,      false],
            [RX92RobotStatus.Charging]:                [SimpleActivity.Other,      true,      true,       true],
            [RX92RobotStatus.Sleeping]:                [SimpleActivity.Other,      null,      false,      true],
            [RX92RobotStatus.Error]:                   [SimpleActivity.Other,      null,      false,      false],
            [RX92RobotStatus.Pitstop]:                 [SimpleActivity.Pitstop,    true,      true,       true],
            [RX92RobotStatus.ManualSteering]:          [SimpleActivity.Other,      false,     false,      false],
            [RX92RobotStatus.FirmwareUpgrade]:         [SimpleActivity.Other,      null,      false,      false]
        };
        const [activity, isDocked, isCharging, isActive] =
            this.status.activity === undefined
            ? [SimpleActivity.Other] : activityMap[this.status.activity];
        const isBusy = [SimpleActivity.Clean, SimpleActivity.Pitstop].includes(activity);

        // Combine account and appliance errors
        const isError = this.status.isRobotError;

        // Any identified problem is treated as a fault
        const isFault = isError !== undefined
                     || !this.status.enabled
                     || !this.status.connected
                     || this.status.activity === RX92RobotStatus.Error
                     || this.status.battery === RX92BatteryStatus.Dead
                     || this.status.isDustbinEmpty === false;

        // Update the status
        this.updateStatus({
            simpleActivity: activity,
            isBatteryLow:   this.status.battery !== undefined
                            && this.status.battery <= RX92BatteryStatus.Low,
            isCharging,
            isDustbinEmpty: this.status.dustbin !== undefined
                            && ![RX92Dustbin.Missing, RX92Dustbin.Full].includes(this.status.dustbin),
            isDocked:       isDocked ?? this.status.battery === RX92BatteryStatus.FullyCharged,
            isActive:       isActive && !isFault,
            isBusy,
            isError,
            isFault,
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
        const keys = Object.keys(this.status) as StatusEvent[];
        const changed = keys.filter(key => {
            const a = this.status[key], b = this.emittedStatus[key];
            if (Array.isArray(a) && Array.isArray(b)) {
                return a.length !== b.length
                    || a.some((element, index) => element !== b[index]);
            } else {
                return a !== b;
            }
        });
        if (!changed.length) return;

        // Log a summary of the changes
        const toText = (value: unknown): string => {
            if (value === undefined) return '?';
            if (typeof(value) === 'string' && /[- <>:,]/.test(value)) return `"${value}"`;
            return String(value);
        };
        const summary = changed.map(key =>
            `${key}: ${toText(this.emittedStatus[key])}->${toText(this.status[key])}`);
        this.log.debug(formatList(summary));

        // Emit events for each change
        changed.forEach(key => this.emit(key, this.status[key], this.emittedStatus[key]));

        // Store a copy of the updated values
        this.emittedStatus = {...this.status};
    }

    // Emit events for any new messages
    emitMessages(messages: RX92Message[] = []): void {
        // If there are no current messages then just flush the cache
        if (!messages.length) { this.emittedMessages.clear(); return; }

        // Emit events for any new messages
        messages.forEach(message => {
            const { id } = message;
            if (!(this.emittedMessages.has(id))) {
                this.emittedMessages.add(id);
                this.emit('message', message);
            }
        });
    }

    // Install a handler for a robot status event
    on                           (event: VoidEvent, listener: () => void): this;
    on<Event extends DataEvent>  (event: Event, dataListener: DataEventListener<Event>): this;
    on<Event extends StatusEvent>(event: Event, statusListener: StatusEventListener<Event>): this;
    on(event: string, listener: Listener): this {
        return super.on(event, listener);
    }

    // Install a single-shot handler for a robot status event
    once                           (event: VoidEvent, listener: () => void): this;
    once<Event extends DataEvent>  (event: Event, dataListener: DataEventListener<Event>): this;
    once<Event extends StatusEvent>(event: Event, statusListener: StatusEventListener<Event>): this;
    once(event: string, listener: Listener): this {
        return super.once(event, listener);
    }

    // Emit an event
    emit                           (event: VoidEvent): boolean;
    emit<Event extends DataEvent>  (event: Event, value: DataEventType[Event]): boolean;
    emit<Event extends StatusEvent>(event: Event, newValue: DynamicStatus[Event], oldValue: DynamicStatus[Event]): boolean;
    emit(event: string, ...args: unknown[]): boolean {
        return super.emit(event, ...args);
    }
}
