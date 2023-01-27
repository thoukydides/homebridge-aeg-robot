// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { LogLevel } from 'homebridge';
import { AEGRobot } from './aeg-robot';
import { Activity, Battery, Capability, Dustbin, FeedItem, Message, PowerMode } from './aegapi-types';
import { formatDuration } from './utils';

// Descriptions of the robot activity
const activityNames: Record<Activity, string | null> = {
    [Activity.Cleaning]:                'CLEANING',
    [Activity.PausedCleaning]:          'PAUSED during cleaning',
    [Activity.SpotCleaning]:            'SPOT CLEANING',
    [Activity.PausedSpotCleaning]:      'PAUSED during spot cleaning',
    [Activity.Return]:                  'returning HOME',
    [Activity.PausedReturn]:            'PAUSED during return home',
    [Activity.ReturnForPitstop]:        'returning HOME; it will resume cleaning when charged',
    [Activity.PausedReturnForPitstop]:  'PAUSED during return home; it will resume cleaning when charged',
    [Activity.Charging]:                'CHARGING',
    [Activity.Sleeping]:                'SLEEPING (either charged on dock or idle off dock)',
    [Activity.Error]:                   'in an ERROR state',
    [Activity.Pitstop]:                 'CHARGING; it will resume cleaning when charged',
    [Activity.ManualSteering]:          'being STEERED MANUALLY',
    [Activity.FirmwareUpgrade]:         'performing a FIRMWARE UPGRADE'
};

// Descriptions of the robot battery levels
const batteryNames: Record<Battery, string> = {
    [Battery.Dead]:         'DEAD',
    [Battery.CriticalLow]:  'CRITICALLY LOW',
    [Battery.Low]:          'LOW',
    [Battery.Medium]:       'MEDIUM',
    [Battery.High]:         'HIGH',
    [Battery.FullyCharged]: 'FULLY CHARGED'
};

// Descriptions of dustbin states
const dustbinNames: Record<Dustbin, string> = {
    [Dustbin.Unknown]:      'UNKNOWN',
    [Dustbin.Present]:      'PRESENT (and not full)',
    [Dustbin.Missing]:      'MISSING',
    [Dustbin.Full]:         'FULL (and requires emptying)'
};

// Descriptions of power modes
const powerModeNames: Record<PowerMode, string> = {
    [PowerMode.Quiet]:  'QUIET (lower energy consumption and quieter)',
    [PowerMode.Smart]:  'SMART (cleans quietly on hard surfaces, uses full power on carpets)',
    [PowerMode.Power]:  'POWER (optimal cleaning performance, higher energy consumption)'
};

// Robot tick duration
const TICK_MS = 1e-4;

// Logging of information about a robot
export class AEGRobotLog {

    // Logger
    readonly log = this.robot.log;

    // Reported error messages
    private readonly loggedHealthErrors = new Set<string>();

    // Construct a robot logger
    constructor(readonly robot: AEGRobot) {
        this.logOnce();
        this.logStatus();
        this.logMessages();
    }

    // Log static information about the robot once at startup
    logOnce(): void {
        this.log.info(`Product ID ${this.robot.applianceId}`);
        this.log.info(`Hardware platform ${this.robot.hardware}`);
        this.robot.once('info', () => {
            this.log.info(`${this.robot.brand} ${this.robot.model}`);
            this.log.info(`Product number code ${this.robot.pnc}`);
            this.log.info(`Serial number ${this.robot.sn}`);
        });
    }

    // Log initial values and changes for other status
    logStatus(): void {
        this.robot.on('rawName', (name: string) => {
            this.log.info(`My name is "${name}"`);
        }).on('capabilities', (capabilities: Capability[]) => {
            this.log.info(`Supported capabilities: ${capabilities.join(', ')}`);
        }).on('firmware', (firmware: string) => {
            this.log.info(`Firmware version ${firmware} installed`);
        }).on('battery', (battery?: Battery) => {
            if (battery === undefined) this.log.info('Unknown battery level');
            else this.log.info(`Battery level is ${batteryNames[battery]}`);
        }).on('activity', (activity?: Activity) => {
            if (activity === undefined) this.log.info('Unknown robot status');
            else this.log.info(`Robot is ${activityNames[activity]}`);
        }).on('dustbin', (dustbin?: Dustbin) => {
            if (dustbin === undefined) this.log.info('Unknown dustbin status');
            else this.log.info(`Dust collection bin is ${dustbinNames[dustbin]}`);
        }).on('rawPower', (power?: PowerMode) => {
            if (power === undefined) this.log.info('Unknown power mode');
            else this.log.info(`Power mode is set to ${powerModeNames[power]}`);
        }).on('enabled', (enabled: boolean) => {
            this.log.log(enabled ? LogLevel.INFO : LogLevel.WARN,
                         `Robot is ${enabled ? 'enabled' : 'disabled'}`);
        }).on('connected', (connected: boolean) => {
            this.log.log(connected ? LogLevel.INFO : LogLevel.WARN,
                         `Robot ${connected ? 'is' : 'is NOT'} connected to the cloud servers`);
        }).on('isError', (err?: unknown) => this.logHealth(err));
    }

    // Log changes to cloud server health
    logHealth(err?: unknown): void {
        if (err) {
            const message = `${err}`;
            if (!this.loggedHealthErrors.has(message)) {
                this.loggedHealthErrors.add(message);
                this.log.error(`Lost connection to cloud servers: ${message}`);
            }
        } else {
            this.loggedHealthErrors.clear();
            this.log.info('Successfully connected to cloud servers');
        }
    }

    // Log messages from the robot
    logMessages(): void {
        this.robot.on('message', (message: Message) => {
            const age = `${formatDuration(Date.now() - message.timestamp * 1000)} ago`;
            const bits = [`type=${message.type}`];
            if (message.userErrorID)     bits.push(`user-error=${message.userErrorID}`);
            if (message.internalErrorID) bits.push(`internal-error=${message.internalErrorID}`);
            this.log.warn(`Message: ${message.text} (${age})`);
            this.log.debug(`Message: ${bits.join(', ')}`);
        }).on('feed', (item: FeedItem) => {
            const age = `${formatDuration(Date.now() - Date.parse(item.createdAtUTC))} ago`;
            switch (item.feedDataType) {
            case 'RVCLastWeekCleanedArea':
                this.log.info(`Weekly insight (${age}):`);
                this.log.info(`    Worked for ${formatDuration(item.data.cleaningDurationTicks * TICK_MS)}`);
                this.log.info(`    Worked for ${item.data.cleaningDurationTicks} ticks`);
                this.log.info(`    ${item.data.cleanedAreaSquareMeter} m² cleaned`);
                this.log.info(`    Cleaned ${item.data.sessionCount} times`);
                this.log.info(`    Recharged ${item.data.pitstopCount} times while cleaning`);
                break;
            case 'RVCSurfaceFilterMaintenance':
            case 'RVCBrushRollMaintenance':
            case 'RVCSideBrushMaintenance':
                this.log.info(`${item.data.cardTitle} (${age})`);
                if (item.data.cardDescription.length) this.log.info(`    ${item.data.cardDescription}`);
                break;
            default:
                this.log.warn(`Unrecognised feed item type "${item['feedDataType']}" (${age})`);
                this.log.warn(JSON.stringify(item, null, 4));
            }
        });
    }
}
