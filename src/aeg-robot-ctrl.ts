// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import { setTimeout } from 'node:timers/promises';

import { AEGRobot, SimpleActivity } from './aeg-robot.js';
import { Config } from './config-types.js';
import { MS, assertIsNotUndefined, logError } from './utils.js';
import { AEGAPIRX92 } from './aegapi-rx92.js';
import { RX92CleaningCommand, RX92RobotStatus } from './aegapi-rx92-types.js';

// Timeout waiting for status to reflect a requested change
const TIMEOUT_MIN_MS        = 20 * MS;
const TIMEOUT_POLL_MULTIPLE = 3;

// An abstract AEG RX 9 / Electrolux Pure i9 robot controller
abstract class AEGRobotCtrl<Type extends number | string> {

    // Plugin configuration
    readonly config: Config;

    // Logger
    readonly log: Logger;

    // Electrolux Group API for an AEG RX9.2 robot vacuum cleaner
    readonly api: AEGAPIRX92;

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
        return (target) => void (async (): Promise<void> => { await this.set(target); })();
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
                    this.abort = (): void => { resolve('abort'); });

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

// Robot controller for changing the activity
export class AEGRobotCtrlActivity extends AEGRobotCtrl<RX92CleaningCommand> {

    // Create a new robot controller for changing the name
    constructor(readonly robot: AEGRobot) {
        super(robot, 'activity');
    }

    // Check whether the robot is performing the required activity
    isTargetSet(command: RX92CleaningCommand): boolean | null {
        if (this.robot.status.activity === undefined) return null;
        const commandIndex =                           ['play', 'pause', 'home', 'stop'];
        const commandSet: Record<RX92RobotStatus, (boolean | null)[]> = {
            [RX92RobotStatus.Cleaning]:                 [true,   false,  false,  false],
            [RX92RobotStatus.PausedCleaning]:           [false,  true,   false,  false],
            [RX92RobotStatus.SpotCleaning]:             [true,   false,  false,  false],
            [RX92RobotStatus.PausedSpotCleaning]:       [false,  true,   false,  false],
            [RX92RobotStatus.Return]:                   [true,   false,  true,   false],
            [RX92RobotStatus.PausedReturn]:             [false,  true,   false,  false],
            [RX92RobotStatus.ReturnForPitstop]:         [true,   false,  true,   false],
            [RX92RobotStatus.PausedReturnForPitstop]:   [false,  true,   false,  false],
            [RX92RobotStatus.Charging]:                 [false,  true,   true,   true],
            [RX92RobotStatus.Sleeping]:                 [false,  true,   null,   true],
            [RX92RobotStatus.Error]:                    [false,  true,   null,   true],
            [RX92RobotStatus.Pitstop]:                  [true,   true,   true,   false],
            [RX92RobotStatus.ManualSteering]:           [false,  true,   false,  false],
            [RX92RobotStatus.FirmwareUpgrade]:          [false,  true,   false,  true]
        };
        const index = commandIndex.indexOf(command);
        let isSet = commandSet[this.robot.status.activity][index];
        if (isSet === null && command === 'home'
            && this.robot.status.isDocked !== undefined) {
            isSet = this.robot.status.isDocked;
        }
        assertIsNotUndefined(isSet);
        return isSet;
    }

    // Attempt to set the requested state
    async setTarget(command: RX92CleaningCommand): Promise<void> {
        await this.api.sendCleaningCommand(command);
    }

    // Override the status while a requested change is pending
    overrideStatus(command: RX92CleaningCommand): void {
        const commandToActivity: Record<RX92CleaningCommand, SimpleActivity> = {
            play:   SimpleActivity.Clean,
            pause:  SimpleActivity.Pause,
            home:   SimpleActivity.Return,
            stop:   SimpleActivity.Other
        };
        this.robot.status.simpleActivity = commandToActivity[command];
    }
}