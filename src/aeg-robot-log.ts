// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger, LogLevel } from 'homebridge';

import { AEGRobot, CleanedAreaWithMap } from './aeg-robot';
import { Activity, Battery, Capability, Completion, Dustbin,
         FeedItem, Message, PowerMode } from './aegapi-types';
import { columns, formatList, formatMilliseconds, formatSeconds, MS, plural } from './utils';
import { AEGRobotMap } from './aeg-map';

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

// Description of cleaned area completion statuses
const completionNames: Record<Completion, string> = {
    abortedByUser:                          'Cleaning aborted by the user',
    cleaningFinishedSuccessful:             'Successfully cleaned',
    cleaningFinishedSuccessfulInCharger:    'Successfully cleaned and returned to charger',
    cleaningFinishedSuccessfulInStartPose:  'Successfully cleaned and returned to starting location',
    endedNotFindingCharger:                 'Failed to return home to charger',
    error:                                  'Error'
};

// Robot tick duration
const TICK_MS = 0.0001;

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
        this.logCleanedAreas();
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
            this.log.info(`Supported ${plural(capabilities.length, 'capability')}: ${formatList(capabilities)}`);
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
    async logMessages(): Promise<void> {
        this.robot.on('message', (message: Message) => {
            const age = `${formatMilliseconds(Date.now() - message.timestamp * MS)} ago`;
            const bits = [`type=${message.type}`];
            if (message.userErrorID)     bits.push(`user-error=${message.userErrorID}`);
            if (message.internalErrorID) bits.push(`internal-error=${message.internalErrorID}`);
            this.log.warn(`Message: ${message.text} (${age})`);
            this.log.debug(`Message: ${formatList(bits)}`);
        }).on('feed', (item: FeedItem) => {
            const age = `${formatMilliseconds(Date.now() - Date.parse(item.createdAtUTC))} ago`;
            switch (item.feedDataType) {
            case 'RVCLastWeekCleanedArea':
                this.log.info(`Weekly insight (${age}):`);
                this.log.info(`    Worked for ${formatMilliseconds(item.data.cleaningDurationTicks * TICK_MS)}`);
                this.log.info(`    ${item.data.cleanedAreaSquareMeter} m² cleaned`);
                this.log.info(`    Cleaned ${item.data.sessionCount} times`);
                this.log.info(`    Recharged ${item.data.pitstopCount} times while cleaning`);
                break;
            case 'OsirisBusierWeekJobDone': {
                const formatHours = (hours: number) => formatSeconds(hours * 60 * 60);
                this.log.info(`Worked more this week (${age}):`);
                this.log.info(`    Worked ${formatHours(item.data.current)} this week`);
                this.log.info(`    Worked ${formatHours(item.data.previous)} previous week`);
                this.log.info(`    ${Math.round(item.data.relativeDifference * 100)}% increase`);
                break;
            }
            case 'OsirisMonthlyJobDoneGlobalComparison': {
                this.log.info('Comparison with robot vacuums around the world:');
                const rows = columns([
                    [this.robot.status.name,       `${item.data.sessionCount} sessions`],
                    [item.data.minCountry.country, `${item.data.minCountry.sessionCount} sessions`],
                    [item.data.maxCountry.country, `${item.data.maxCountry.sessionCount} sessions`]
                ]);
                rows.forEach(row => this.log.info(`    ${row}`));
                break;
            }
            case 'RVCSurfaceFilterMaintenance':
            case 'RVCBrushRollMaintenance':
            case 'RVCSideBrushMaintenance':
                this.log.info(`${item.data.cardTitle} (${age})`);
                if (item.data.cardDescription.length) this.log.info(`    ${item.data.cardDescription}`);
                break;
            case 'InAppSurveyEnabled':
                this.log.info(`In-app survey active (${age})`);
                break;
            case 'ApplianceBirthday':
                this.log.info(`Happy birthday! (${age})`);
                this.log.info(`    Robot is ${plural(item.data.age, 'year')} old`);
                this.log.info(`    First activated ${item.data.birthDay}`);
                break;
            default:
                this.log.warn(`Unrecognised feed item type "${item['feedDataType']}" (${age})`);
                this.log.warn(JSON.stringify(item, null, 4));
            }
        });
    }

    // Log cleaned areas
    logCleanedAreas(): void {
        this.robot.on('cleanedArea', (cleanedArea: CleanedAreaWithMap) => {
            const { cleaningSession } = cleanedArea;
            const date = new Date(cleaningSession?.startTime ?? cleanedArea.timeStamp);
            this.log.info(`Cleaned area ${date.toLocaleDateString()}:`);
            this.log.info(`    Cleaned ${cleanedArea.cleanedArea} m²`);
            if (cleaningSession) {
                const formatTime = (time: string) => new Date(time).toLocaleTimeString();
                this.log.info(`    ${formatTime(cleaningSession.startTime)} - ${formatTime(cleaningSession.eventTime)}`);
                this.log.info(`    Cleaned for ${formatMilliseconds(cleaningSession.cleaningDuration * TICK_MS)}`);
                if (cleaningSession.pitstopCount) {
                    this.log.info(`    Recharged ${cleaningSession.pitstopCount} times while cleaning`);
                    this.log.info(`    Charged for ${formatMilliseconds(cleaningSession.pitstopDuration * TICK_MS)}`);
                }
                if (cleaningSession.completion) {
                    this.log.info(`    ${completionNames[cleaningSession.completion]}`);
                }
            }
            const {map, interactive, interactiveMap} = cleanedArea;
            if (map?.crumbs) {
                const mapText = new AEGRobotMap(map, interactive, interactiveMap).renderText();
                mapText.forEach(line => this.log.info(`    ${line}`));
            }
        });
    }
}
