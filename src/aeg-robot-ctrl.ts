// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import { AEGRobot, SimpleActivity } from './aeg-robot.js';
import { Config } from './config-types.js';
import { MS, assertIsNotUndefined, logError } from './utils.js';
import { AEGAPIRX9 } from './aegapi-rx9.js';
import { RX9CleaningCommand, RX9RobotStatus } from './aegapi-rx9-types.js';
import { once } from 'node:events';

// Timeout waiting for changes, as a multiple of the status polling interval
const TIMEOUT_REQUEST_POLL_MULTIPLE = 1;
const TIMEOUT_APPLIED_POLL_MULTIPLE = 3;

// An abstract AEG RX 9 / Electrolux Pure i9 robot controller
abstract class AEGRobotCtrl<Type extends number | string> {

    // Plugin configuration
    readonly config: Config;

    // Logger
    readonly log: Logger;

    // Electrolux Group API for an AEG RX9.1 or RX9.2 robot vacuum cleaner
    readonly api: AEGAPIRX9;

    // The target value
    private target?: Type;

    // Abort waiting for a previous target to be applied
    private abortController?: AbortController;

    // Timeout in milliseconds for requesting and waiting for changes
    private readonly requestTimeout: number;
    private readonly appliedTimeout: number;

    // Optional mapping of enum target values to text
    readonly toText?: Record<Type, string>;

    // Create a new robot controller
    constructor(readonly robot: AEGRobot, readonly name: string) {
        this.config = robot.account.config;
        this.log = robot.log;
        this.api = robot.api;
        const pollInterval = this.config.pollIntervals.statusSeconds * MS;
        this.requestTimeout = pollInterval * TIMEOUT_REQUEST_POLL_MULTIPLE;
        this.appliedTimeout = pollInterval * TIMEOUT_APPLIED_POLL_MULTIPLE;
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
        if (target === this.target) {
            this.log.debug(`Ignoring duplicate request to ${description}`);
            return;
        }

        // No action required if already in the required state
        if (this.isTargetSet(target)) {
            this.log.debug(`Ignoring unnecessary request to ${description}`);
            return;
        }

        // Temporarily override the reported status
        this.target = target;
        this.robot.updateDerivedAndEmit();

        // Replace any previous unfinished request
        if (this.abortController) {
            this.abortController.abort();
            this.log.debug(`Changing pending request to ${description}`);
            return;
        }

        // Start a new request
        this.log.debug(`New request to ${description}`);
        try {
            do {
                // Create AbortController to abandon waiting for status update
                this.abortController = new AbortController();

                // Attempt to apply the requested change
                target = this.target;
                await this.trySet(target, this.abortController.signal);

            } while (target !== this.target);

        } catch (err) {
            // Failed to apply the update
            logError(this.log, `Setting ${this.name}`, err);
        } finally {
            // Clear the status override
            delete this.abortController;
            delete this.target;
            this.robot.updateDerivedAndEmit();
        }
    }

    // Attempt to apply a single change
    async trySet(target: Type, signal: AbortSignal): Promise<void> {
        const description = this.description(target);
        this.log.info(`Attempting to ${description}`);
        let result = 'Failed to';
        try {
            // Apply the change
            const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeout)]);
            await this.setTarget(target, requestSignal);

            // Wait for status update, change of target state, or timeout
            const appliedSignal = AbortSignal.any([signal, AbortSignal.timeout(this.appliedTimeout)]);
            do {
                await once(this.robot, 'appliance', { signal: appliedSignal });
            } while (!this.isTargetSet(target));
            result = 'Successfully';
        } catch (err) {
            if      (err instanceof DOMException && err.name === 'AbortError')   result = 'Aborted';
            else if (err instanceof DOMException && err.name === 'TimeoutError') result = 'Timed out';
            else throw err;
        } finally {
            // Log the result
            this.log.info(`${result} ${description}`);
        }
    }

    // Describe setting the target value
    description(target: Type): string {
        const value = this.toText ? this.toText[target] : `"${target}"`;
        return `set ${this.name} to ${value}`;
    }

    // Check whether the robot is already in the requested state
    abstract isTargetSet(target: Type): boolean | null;

    // Attempt to set the requested state
    abstract setTarget(target: Type, signal?: AbortSignal): Promise<void>;

    // Override the status while a requested change is pending
    abstract overrideStatus(target: Type): void;
}

// Robot controller for changing the activity
export class AEGRobotCtrlActivity extends AEGRobotCtrl<RX9CleaningCommand> {

    // Create a new robot controller for changing the name
    constructor(readonly robot: AEGRobot) {
        super(robot, 'activity');
    }

    // Check whether the robot is performing the required activity
    isTargetSet(command: RX9CleaningCommand): boolean | null {
        if (this.robot.status.activity === undefined) return null;
        const commandIndex =                           ['play', 'pause', 'home', 'stop'];
        const commandSet: Record<RX9RobotStatus, (boolean | null)[]> = {
            [RX9RobotStatus.Cleaning]:                  [true,   false,  false,  false],
            [RX9RobotStatus.PausedCleaning]:            [false,  true,   false,  false],
            [RX9RobotStatus.SpotCleaning]:              [true,   false,  false,  false],
            [RX9RobotStatus.PausedSpotCleaning]:        [false,  true,   false,  false],
            [RX9RobotStatus.Return]:                    [true,   false,  true,   false],
            [RX9RobotStatus.PausedReturn]:              [false,  true,   false,  false],
            [RX9RobotStatus.ReturnForPitstop]:          [true,   false,  true,   false],
            [RX9RobotStatus.PausedReturnForPitstop]:    [false,  true,   false,  false],
            [RX9RobotStatus.Charging]:                  [false,  true,   true,   true],
            [RX9RobotStatus.Sleeping]:                  [false,  true,   null,   true],
            [RX9RobotStatus.Error]:                     [false,  true,   null,   true],
            [RX9RobotStatus.Pitstop]:                   [true,   true,   true,   false],
            [RX9RobotStatus.ManualSteering]:            [false,  true,   false,  false],
            [RX9RobotStatus.FirmwareUpgrade]:           [false,  true,   false,  true]
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
    async setTarget(command: RX9CleaningCommand, signal?: AbortSignal): Promise<void> {
        await this.api.sendCleaningCommand(command, signal);
    }

    // Override the status while a requested change is pending
    overrideStatus(command: RX9CleaningCommand): void {
        const commandToActivity: Record<RX9CleaningCommand, SimpleActivity> = {
            play:   SimpleActivity.Clean,
            pause:  SimpleActivity.Pause,
            home:   SimpleActivity.Return,
            stop:   SimpleActivity.Other
        };
        this.robot.status.simpleActivity = commandToActivity[command];
    }
}