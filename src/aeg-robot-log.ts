// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger, LogLevel } from 'homebridge';

import { AEGRobot } from './aeg-robot.js';
import { formatList, formatMilliseconds, MS, plural } from './utils.js';
import { RX9BatteryStatus, RX9Capabilities, RX9Dustbin, RX9Message,
         RX92PowerMode, RX9RobotStatus } from './aegapi-rx9-types.js';

// Descriptions of the robot activity
const activityNames: Record<RX9RobotStatus, string | null> = {
    [RX9RobotStatus.Cleaning]:                  'CLEANING',
    [RX9RobotStatus.PausedCleaning]:            'PAUSED during cleaning',
    [RX9RobotStatus.SpotCleaning]:              'SPOT CLEANING',
    [RX9RobotStatus.PausedSpotCleaning]:        'PAUSED during spot cleaning',
    [RX9RobotStatus.Return]:                    'returning HOME',
    [RX9RobotStatus.PausedReturn]:              'PAUSED during return home',
    [RX9RobotStatus.ReturnForPitstop]:          'returning HOME; it will resume cleaning when charged',
    [RX9RobotStatus.PausedReturnForPitstop]:    'PAUSED during return home; it will resume cleaning when charged',
    [RX9RobotStatus.Charging]:                  'CHARGING',
    [RX9RobotStatus.Sleeping]:                  'SLEEPING (either charged on dock or idle off dock)',
    [RX9RobotStatus.Error]:                     'in an ERROR state',
    [RX9RobotStatus.Pitstop]:                   'CHARGING; it will resume cleaning when charged',
    [RX9RobotStatus.ManualSteering]:            'being STEERED MANUALLY',
    [RX9RobotStatus.FirmwareUpgrade]:           'performing a FIRMWARE UPGRADE'
};

// Descriptions of the robot battery levels
const batteryNames: Record<RX9BatteryStatus, string> = {
    [RX9BatteryStatus.Dead]:                    'DEAD',
    [RX9BatteryStatus.CriticalLow]:             'CRITICALLY LOW',
    [RX9BatteryStatus.Low]:                     'LOW',
    [RX9BatteryStatus.Medium]:                  'MEDIUM',
    [RX9BatteryStatus.High]:                    'HIGH',
    [RX9BatteryStatus.FullyCharged]:            'FULLY CHARGED'
};

// Descriptions of dustbin states
const dustbinNames: Record<RX9Dustbin, string> = {
    [RX9Dustbin.Unknown]:                       'UNKNOWN',
    [RX9Dustbin.Present]:                       'PRESENT (and not full)',
    [RX9Dustbin.Missing]:                       'MISSING',
    [RX9Dustbin.Full]:                          'FULL (and requires emptying)'
};

// Descriptions of power modes
const powerModeNames: Record<RX92PowerMode, string> = {
    [RX92PowerMode.Quiet]:  'QUIET (lower energy consumption and quieter)',
    [RX92PowerMode.Smart]:  'SMART (cleans quietly on hard surfaces, uses full power on carpets)',
    [RX92PowerMode.Power]:  'POWER (optimal cleaning performance, higher energy consumption)'
};

// Logging of information about a robot
export class AEGRobotLog {

    // Logger
    readonly log: Logger;

    // Reported error messages
    private readonly loggedHealthErrors = new Set<string>();

    // Construct a robot logger
    constructor(readonly robot: AEGRobot) {
        this.log = robot.log;
        this.logOnce();
        this.logStatus();
        this.logMessages();
    }

    // Log static information about the robot once at startup
    logOnce(): void {
        const redacted = this.robot.config.debug.includes('Log Appliance IDs');
        if (!redacted) this.log.info(`Product ID ${this.robot.applianceId}`);
        this.robot.once('info', () => {
            this.log.info(`${this.robot.brand} ${this.robot.model}`);
            this.log.info(`Product number code ${this.robot.pnc}`);
            if (!redacted) this.log.info(`Serial number ${this.robot.sn}`);
            this.log.info(`My name is "${this.robot.name}"`);
        });
    }

    // Log initial values and changes for other status
    logStatus(): void {
        this.robot.on('capabilities', (capabilities: RX9Capabilities[]) => {
            this.log.info(`Supports ${plural(capabilities.length, 'capability')}: ${formatList([...capabilities].sort())}`);
        }).on('hardware', (hardware: string) => {
            this.log.info(`Hardware platform ${hardware}`);
        }).on('firmware', (firmware: string) => {
            this.log.info(`Firmware version ${firmware} installed`);
        }).on('battery', (battery?: RX9BatteryStatus) => {
            if (battery === undefined) this.log.info('Unknown battery level');
            else this.log.info(`Battery level is ${batteryNames[battery]}`);
        }).on('activity', (activity?: RX9RobotStatus) => {
            if (activity === undefined) this.log.info('Unknown robot status');
            else this.log.info(`Robot is ${activityNames[activity]}`);
        }).on('dustbin', (dustbin?: RX9Dustbin) => {
            if (dustbin === undefined) this.log.info('Unknown dustbin status');
            else this.log.info(`Dust collection bin is ${dustbinNames[dustbin]}`);
        }).on('rawPower', (power?: RX92PowerMode) => {
            if (power === undefined) this.log.info('Unknown power mode');
            else this.log.info(`Power mode is set to ${powerModeNames[power]}`);
        }).on('rawEco', (eco?: boolean) => {
            if (eco === undefined) this.log.info('Unknown ECO mode');
            else this.log.info(`ECO mode is ${eco ? 'enabled' : 'disabled'}`);
        }).on('enabled', (enabled: boolean) => {
            this.log.log(enabled ? LogLevel.INFO : LogLevel.WARN,
                         `Robot is ${enabled ? 'enabled' : 'disabled'}`);
        }).on('connected', (connected: boolean) => {
            this.log.log(connected ? LogLevel.INFO : LogLevel.WARN,
                         `Robot ${connected ? 'is' : 'is NOT'} connected to the cloud servers`);
        }).on('isError', (err?: unknown) => { this.logHealth(err); });
    }

    // Log changes to cloud server health
    logHealth(err?: unknown): void {
        if (err) {
            const message = err instanceof Error ? err.message : JSON.stringify(err);
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
        this.robot.on('message', (message: RX9Message) => {
            const age = `${formatMilliseconds(Date.now() - message.timestamp * MS)} ago`;
            const bits = [`type=${message.type}`];
            if (message.userErrorID)     bits.push(`user-error=${message.userErrorID}`);
            if (message.internalErrorID) bits.push(`internal-error=${message.internalErrorID}`);
            this.log.warn(`Message: ${message.text} (${age})`);
            this.log.debug(`Message: ${formatList(bits)}`);
        });
    }
}
