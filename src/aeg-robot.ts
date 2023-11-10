// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';
import { EventEmitter } from 'events';

import { AEGAccount } from './aeg-account';
import { AEGApplianceAPI } from './aegapi-appliance';
import { Activity, Appliance, ApplianceNamePatch, Battery, Capability, CleanedArea, CleaningCommand,
         Connection, DomainAppliance, Dustbin, FeedItem, Message, PowerMode, Status } from './aegapi-types';
import { PrefixLogger } from './logger';
import { logError } from './utils';
import { AEGRobotLog } from './aeg-robot-log';
import { AEGRobotCtrlActivity, AEGRobotCtrlName,
         AEGRobotCtrlPower } from './aeg-robot-ctrl';
import { Heartbeat } from './heartbeat';
import { Config } from './config-types';

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
    capabilities:       Capability[];
    battery?:           Battery;
    activity?:          Activity;
    dustbin?:           Dustbin;
    rawPower?:          PowerMode;
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
    name:               string;
    power?:             PowerMode;
}
export type StatusEvent = keyof DynamicStatus;

// Other event types
interface DataEventType {
    message:        Message;
    feed:           FeedItem;
    cleanedArea:    CleanedArea;
}
type DataEvent = keyof DataEventType;
type VoidEvent = 'info' | 'appliance' | 'preUpdate';

// A generic event listener, compatible with all prototypes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

// Maximum number of historial cleaned areas to retrieve
const MAX_CLEANED_AREAS = 5;

// An AEG RX 9 / Electrolux Pure i9 robot manager
export class AEGRobot extends EventEmitter {

    // Configuration
    readonly config: Config;

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
    readonly status: DynamicStatus = { rawName: '', firmware: '', capabilities: [], enabled: false, connected: false, name: '' };
    private emittedStatus: Partial<DynamicStatus> = {};

    // Messages about the robot
    private readonly emittedMessages    = new Set<number>();
    private readonly emittedFeed        = new Set<string>();
    private readonly emittedCleanedArea = new Set<string>();

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
        super.on('error', err => logError(this.log, 'Event', err));

        // Construct a Logger and API for this robot
        this.config = account.config;
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

        // Start polling for interesting changes
        const intervals = this.config.pollIntervals;
        const poll: [string, number, () => Promise<void>][] = [
            ['Cleaned areas',   intervals.cleanedAreasSeconds,  this.pollCleanedAreas]
        ];
        this.heartbeats = poll.map(action =>
            new Heartbeat(this.log, action[0], action[1] * 1000, action[2].bind(this),
                          (err) => this.heartbeat(err)));
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
        const { reported } = appliance.properties;
        this.updateStatus({
            // Status that is always provided
            rawName:        appliance.applianceData.applianceName,
            enabled:        appliance.status === Status.Enabled,
            connected:      appliance.connectionState === Connection.Connected,

            // Other details may be absent if the robot is not reachable
            capabilities:   Object.keys(reported.capabilities ?? {}),
            firmware:       reported.firmwareVersion || '',
            battery:        reported.batteryStatus,
            activity:       reported.robotStatus,
            dustbin:        reported.dustbinStatus,
            rawPower:       reported.powerMode
        });

        // Extract any new messages
        this.emitMessages(reported.messageList?.messages);

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

    // Update server health
    updateServerHealth(err?: unknown): void {
        this.status.isServerError = err;
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

        // Combine account and appliance errors
        const isError = this.status.isServerError ?? this.status.isRobotError;

        // Any identified problem is treated as a fault
        const isFault = isError !== undefined
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
            isError,
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

    // Emit events for any new messages
    emitMessages(messages: Message[] = []) {
        // If there are no current messages then just flush the cache
        if (!messages.length) return this.emittedMessages.clear();

        // Emit events for any new messages
        messages.forEach(message => {
            const { id } = message;
            if (!(this.emittedMessages.has(id))) {
                this.emittedMessages.add(id);
                this.emit('message', message);
            }
        });
    }

    // Update feed items
    updateFromFeed(feed: FeedItem[]) {
        // If there are no current feed items then just flush the cache
        if (!feed.length) return this.emittedFeed.clear();

        // Emit events for any new feed items
        feed.forEach(item => {
            const { id } = item;
            if (!this.emittedFeed.has(id)) {
                this.emittedFeed.add(id);
                this.emit('feed', item);
            }
        });
    }

    // Periodically check whether there are any new cleaning sessions
    async pollCleanedAreas(): Promise<void> {
        const cleanedAreas = await this.api.getApplianceCleanedAreas(MAX_CLEANED_AREAS);
        cleanedAreas.forEach(cleanedArea => {
            const {id} = cleanedArea;
            if (!this.emittedCleanedArea.has(id)) {
                this.emittedCleanedArea.add(id);
                this.emit('cleanedArea', cleanedArea);
            }
        });
    }

    // Install a handler for a robot status event
    on                           (event: VoidEvent, listener: () => void): this;
    on<Event extends DataEvent>  (event: Event, listener: (value: DataEventType[Event]) => void): this;
    on<Event extends StatusEvent>(event: Event, listener: (newValue: DynamicStatus[Event], oldValue: DynamicStatus[Event]) => void): this;
    on(event: string, listener: Listener): this {
        return super.on(event, listener);
    }

    // Install a single-shot handler for a robot status event
    once                           (event: VoidEvent, listener: () => void): this;
    once<Event extends DataEvent>  (event: Event, listener: (value: DataEventType[Event]) => void): this;
    once<Event extends StatusEvent>(event: Event, listener: (newValue: DynamicStatus[Event], oldValue: DynamicStatus[Event]) => void): this;
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
