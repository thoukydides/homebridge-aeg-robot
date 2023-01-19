// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { LogLevel } from 'homebridge';
import { AEGRobot } from './aeg-robot';
import { Activity, Battery, Dustbin, PowerMode } from './aegapi-types';

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
}