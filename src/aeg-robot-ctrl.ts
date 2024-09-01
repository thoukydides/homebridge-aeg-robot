// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import { setTimeout } from 'node:timers/promises';

import { Activity, Appliance, CleaningCommand, PowerMode } from './aegapi-types.js';
import { AEGApplianceAPI } from './aegapi-appliance.js';
import { AEGRobot, SimpleActivity } from './aeg-robot.js';
import { Config } from './config-types.js';
import { MS, logError } from './utils.js';

// Timezone to use when changing name if unable to determine
const DEFAULT_TIMEZONE = 'London/Europe';

// Timeout waiting for status to reflect a requested change
const TIMEOUT_MIN_MS        = 20 * MS;
const TIMEOUT_POLL_MULTIPLE = 3;

// An abstract AEG RX 9 / Electrolux Pure i9 robot controller
abstract class AEGRobotCtrl<Type extends number | string> {

    // Plugin configuration
    readonly config: Config;

    // Logger
    readonly log: Logger;

    // AEG appliance API
    readonly api: AEGApplianceAPI;

    // The target value
    private target?: Type;

    // Abort waiting for a previous target to be applied
    private abort?: () => void;

    // Timeout waiting for status to reflect a requested change
    private readonly timeout: number;

    // Optional mapping of enum target values to text
    readonly toText?: Record<Type, string>;

    // Create a new robot controller
    constructor(readonly robot: AEGRobot, readonly name: string) {
        this.config = robot.account.config;
        this.log = robot.log;
        this.api = robot.api;
        this.timeout = Math.max(TIMEOUT_MIN_MS,
                                this.config.pollIntervals.statusSeconds
                                * MS * TIMEOUT_POLL_MULTIPLE);
        robot.on('preUpdate', () => {
            if (this.target !== undefined) this.overrideStatus(this.target);
        });
    }

    // Return a set method bound to this instance
    makeSetter(): (target: Type) => void {
        return (target) => void (async () => { await this.set(target); })();
    }

    // Request a change to the robot
    async set(target: Type): Promise<void> {
        // No new action required if already setting the requested state
        const description = this.description(target);
        if (target === this.target) { this.log.debug(`Ignoring duplicate request to ${description}`); return; }

        // No action required if already in the required state
        let done = this.isTargetSet(target);
        if (done === true) { this.log.debug(`Ignoring unnecessary request to ${description}`); return; }

        // Temporarily override the reported status
        this.target = target;
        this.robot.updateDerivedAndEmit();

        // Replace any previous unfinished request
        if (this.abort) {
            this.abort();
            this.log.debug(`Changing pending request to ${description}`); return;
        }

        // Start a new request
        this.log.debug(`New request to ${description}`);
        try {
            do {
                // Create mechanism to abort waiting for a status update
                const abort = new Promise<'abort'>(resolve =>
                    this.abort = () => { resolve('abort'); });

                // Attempt to apply the requested change
                target = this.target;
                done = await this.trySet(target, abort);

            } while (target !== this.target);

        } catch (err) {
            // Failed to apply the update
            logError(this.log, `Setting ${this.name}`, err);
        } finally {
            // Clear the status override
            delete this.abort;
            delete this.target;
            this.robot.updateDerivedAndEmit();
        }
    }

    // Attempt to apply a single change
    async trySet(target: Type, abort: Promise<'abort'>): Promise<boolean | null> {
        // Apply the change
        const description = this.description(target);
        this.log.info(`Attempting to ${description}`);
        await this.setTarget(target);

        // Timeout waiting for status to reflect the requested change
        const timeout = setTimeout(this.timeout);

        // Wait for status update, change of target state, or timeout
        let done: boolean | null, reason;
        do {
            const status = new Promise(resolve =>
                this.robot.once('appliance', () => { resolve('status'); }));
            reason = await Promise.race([status, timeout, abort]) ?? 'timeout';
            done = this.isTargetSet(target);
        } while (!done && reason === 'status');

        // Log the result
        if (done === true)           this.log.info(`Successfully ${description}`);
        else if (reason === 'abort') this.log.info(`Aborted ${description}`);
        else if (done === false)     this.log.info(`Failed to ${description}`);
        return done;
    }

    // Describe setting the target value
    description(target: Type): string {
        const value = this.toText ? this.toText[target] : `"${target}"`;
        return `set ${this.name} to ${value}`;
    }

    // Check whether the robot is already in the requested state
    abstract isTargetSet(target: Type): boolean | null;

    // Attempt to set the requested state
    abstract setTarget(target: Type): Promise<void>;

    // Override the status while a requested change is pending
    abstract overrideStatus(target: Type): void;
}

// Robot controller for changing the name
export class AEGRobotCtrlName extends AEGRobotCtrl<string> {

    // Create a new robot controller for changing the name
    constructor(readonly robot: AEGRobot) {
        super(robot, 'name');
    }

    // Check whether the robot has the requested name
    isTargetSet(name: string): boolean {
        return this.robot.status.rawName === name;
    }

    // Attempt to set the requested name
    async setTarget(name: string): Promise<void> {
        const timezone = this.robot.status.timezone ?? DEFAULT_TIMEZONE;
        const appliance = await this.api.setApplianceName(name, timezone);
        this.robot.updateFromDomains(appliance);
    }

    // Override the status while a requested name change is pending
    overrideStatus(name: string): void {
        this.robot.status.name = name;
    }
}

// Robot controller for changing the cleaning power mode
export class AEGRobotCtrlPower extends AEGRobotCtrl<PowerMode> {

    // Mapping of enum target values to text
    readonly toText = {
        [PowerMode.Quiet]: 'QUIET',
        [PowerMode.Smart]: 'SMART',
        [PowerMode.Power]: 'POWER'
    };

    // Create a new robot controller for changing the power mode
    constructor(readonly robot: AEGRobot) {
        super(robot, 'power mode');
    }

    // Check whether the robot is set to the requested power mode
    isTargetSet(target: PowerMode): boolean {
        return this.robot.status.rawPower === target;
    }

    // Attempt to set the requested state
    async setTarget(power: PowerMode): Promise<void> {
        const appliancePut = await this.api.setPowerMode(power);
        const appliance: Appliance = {
            ...appliancePut.twin,
            applianceData:  appliancePut.applianceData,
            applianceId:    appliancePut.pncId
        };
        this.robot.updateFromAppliances(appliance);
    }

    // Override the status while a requested change is pending
    overrideStatus(power: PowerMode): void {
        this.robot.status.power = power;
    }
}

// Robot controller for changing the activity
export class AEGRobotCtrlActivity extends AEGRobotCtrl<CleaningCommand> {

    // Create a new robot controller for changing the name
    constructor(readonly robot: AEGRobot) {
        super(robot, 'activity');
    }

    // Check whether the robot is performing the required activity
    isTargetSet(command: CleaningCommand): boolean | null {
        if (this.robot.status.activity === undefined) return null;
        const commandIndex =                   [CleaningCommand.Play
            ,                                           CleaningCommand.Pause
            ,                                                   CleaningCommand.Spot
            ,                                                           CleaningCommand.Home
            ,                                                                   CleaningCommand.Stop];
        const commandSet: Record<Activity, (boolean | null)[]> = {
            [Activity.Cleaning]:               [true,   false,  false,  false,  false],
            [Activity.PausedCleaning]:         [false,  true,   false,  false,  false],
            [Activity.SpotCleaning]:           [true,   false,  true,   false,  false],
            [Activity.PausedSpotCleaning]:     [false,  true,   false,  false,  false],
            [Activity.Return]:                 [true,   false,  false,  true,   false],
            [Activity.PausedReturn]:           [false,  true,   false,  false,  false],
            [Activity.ReturnForPitstop]:       [true,   false,  false,  true,   false],
            [Activity.PausedReturnForPitstop]: [false,  true,   false,  false,  false],
            [Activity.Charging]:               [false,  true,   false,  true,   true],
            [Activity.Sleeping]:               [false,  true,   false,  null,   true],
            [Activity.Error]:                  [false,  true,   false,  null,   true],
            [Activity.Pitstop]:                [true,   true,   false,  true,   false],
            [Activity.ManualSteering]:         [false,  true,   false,  false,  false],
            [Activity.FirmwareUpgrade]:        [false,  true,   false,  false,  true]
        };
        const index = commandIndex.indexOf(command);
        let isSet = commandSet[this.robot.status.activity][index];
        if (isSet === null && command === CleaningCommand.Home
            && this.robot.status.isDocked !== undefined) {
            isSet = this.robot.status.isDocked;
        }
        return isSet;
    }

    // Attempt to set the requested state
    async setTarget(command: CleaningCommand): Promise<void> {
        await this.api.cleaningCommand(command);
    }

    // Override the status while a requested change is pending
    overrideStatus(command: CleaningCommand): void {
        const commandToActivity: Record<CleaningCommand, SimpleActivity> = {
            [CleaningCommand.Play]:     SimpleActivity.Clean,
            [CleaningCommand.Pause]:    SimpleActivity.Pause,
            [CleaningCommand.Spot]:     SimpleActivity.Clean,
            [CleaningCommand.Home]:     SimpleActivity.Return,
            [CleaningCommand.Stop]:     SimpleActivity.Other
        };
        this.robot.status.simpleActivity = commandToActivity[command];
    }
}