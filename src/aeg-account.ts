// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger, LogLevel } from 'homebridge';

import { AEGAPI } from './aegapi.js';
import { AEGApplianceAPI } from './aegapi-appliance.js';
import { AEGRobot } from './aeg-robot.js';
import { columns, formatList, MS, plural } from './utils.js';
import { Config } from './config-types.js';
import { HealthCheck } from './aegapi-types.js';
import { Heartbeat } from './heartbeat.js';

// An AEG user account manager
export class AEGAccount {

    // AEG API
    readonly api: AEGAPI;

    // AEG RX 9 / Electrolux Pure i9 robot managers
    readonly robots = new Map<string, AEGRobot>();

    // Periodic polling tasks
    private heartbeats: Heartbeat[] = [];

    // Promise that is resolved by successful initialisation
    private readonly readyPromise: Promise<void>;

    // Create a new AEG user account manager
    constructor(
        readonly log:    Logger,
        readonly config: Config
    ) {
        // Create a new API instance
        this.api = new AEGAPI(log, config);

        // Start asynchronous initialisation
        this.readyPromise = this.init();
    }

    // Return a list of robots in the account
    async getRobots(): Promise<Promise<AEGRobot>[]> {
        await this.readyPromise;
        return [...this.robots.values()].map(robot => robot.waitUntilReady());
    }

    // One-off asynchronous initialisation
    async init(): Promise<void> {
        // Read the user information to test the API
        const name = await this.getUserName();
        this.log.info(`Successfully authenticated as ${name}`);

        // Read the list of appliances, and initialise any robots
        const appliances = await this.api.getAppliances();
        const incompatible: string[] = [];
        appliances.forEach(appliance => {
            if (AEGApplianceAPI.isRobot(appliance)) {
                const robot = new AEGRobot(this.log, this, appliance);
                this.robots.set(appliance.applianceId, robot);
            } else {
                const data = appliance.applianceData;
                incompatible.push(`${data.applianceName} (${data.modelName})`);
            }
        });
        if (incompatible.length) {
            this.log.info(`Ignoring ${plural(incompatible.length, 'incompatible appliance')}: `
                          + formatList(incompatible));
        }

        // Update any robots with the domain details
        const domains = await this.api.getDomains();
        domains.appliances.forEach(appliance => {
            const robot = this.robots.get(appliance.pncId);
            robot?.updateFromDomains(appliance);
        });

        // Start polling for interesting changes
        const intervals = this.config.pollIntervals;
        const poll: [string, number, () => Promise<void>][] = [
            ['Appliances',      intervals.statusSeconds,        () => this.pollAppliances()],
            ['Server health',   intervals.serverHealthSeconds,  () => this.pollServerHealth()],
            ['Feed',            intervals.feedSeconds,          () => this.pollFeed()]
        ];
        this.heartbeats = poll.map(action =>
            new Heartbeat(this.log, action[0], action[1] * MS, action[2],
                          (err) => { this.heartbeat(err); }));
    }

    // Attempt to read the user's name
    async getUserName(): Promise<string> {
        const user = await this.api.getCurrentUser();
        const nameParts = [user.firstName, user.lastName];
        const validNameParts = nameParts.filter(name => name.length);
        return validNameParts.length ? validNameParts.join(' ') : 'anonymous';
    }

    // Handle a status update for a periodic action
    heartbeat(err?: unknown): void {
        if (!err && this.heartbeats.some(heartbeat => heartbeat.lastError)) {
            // This heartbeat indicates success, but there is still a failure
            return;
        }

        // Inform the robots
        this.robots.forEach(robot => { robot.updateServerHealth(err); });
    }

    // Periodically read values that might change
    async pollAppliances(): Promise<void> {
        const appliances = await this.api.getAppliances();
        appliances.forEach(appliance => {
            const robot = this.robots.get(appliance.applianceId);
            robot?.updateFromAppliances(appliance);
        });
    }

    // Check the server health
    async pollServerHealth(): Promise<void> {
        // Check the server health
        const isHealthy = (server: HealthCheck) => server.statusCode === 200 && server.message === 'I am alive!';
        const servers = await this.api.getHealthChecks();
        const failed = servers.filter(server => !isHealthy(server)).length;

        // Summary status
        if (!failed) this.log.debug('All AEG API servers appear healthy:');
        else this.log.error(`${failed} of ${plural(servers.length, 'AEG API server')} have problems:`);

        // Detailed status
        const rows: string[][] = servers.map(server => ([
            server.app,
            server.release,
            server.version ?? '',
            server.environment,
            `${server.statusCode}`,
            server.message
        ]));
        columns(rows).forEach((line, index) => {
            const level = isHealthy(servers[index]) ? LogLevel.DEBUG : LogLevel.ERROR;
            this.log.log(level, line);
        });

        // Throw an error if any servers have problems
        if (failed) throw new Error(`AEG API servers are reporting issues (${failed} of ${servers.length})`);
    }

    // Poll for new feed items
    async pollFeed(): Promise<void> {
        const feed = (await this.api.getFeed()).feedItemResponseDetailDTOs;
        this.robots.forEach((robot, applianceId) => {
            const items = feed.filter(item => item.data.pncId === applianceId);
            robot.updateFromFeed(items);
        });
    }
}