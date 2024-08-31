// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { API, DynamicPlatformPlugin, Logger, LogLevel, PlatformAccessory,
         PlatformConfig } from 'homebridge';

import NodePersist from 'node-persist';
import Path from 'path';
import { CheckerT, createCheckers, IErrorDetail } from 'ts-interface-checker';

import { DEFAULT_CONFIG, PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { AEGAccessory } from './accessory';
import { AEGRobotAccessory } from './accessory-robot';
import { checkDependencyVersions } from './check-versions';
import { AEGAccount } from './aeg-account';
import { AEGRobot } from './aeg-robot';
import { Config } from './config-types';
import { deepMerge, getValidationTree, logError, plural } from './utils';
import { PrefixLogger } from './logger';
import configTI from './ti/config-types-ti';

// Checkers for API responses
const checkers = createCheckers(configTI) as {
    Config: CheckerT<Config>;
};

// Accessory information
interface AccessoryLinkage {
    accessory:          PlatformAccessory;
    implementation?:    AEGAccessory;
}

// A Homebridge AEG RX 9 / Electrolux Pure i9 platform
export class AEGPlatform implements DynamicPlatformPlugin {
    readonly makeUUID;

    // Custom logger
    readonly log: PrefixLogger;

    // Plugin configuration with defaults applied
    config!: Config;

    // Mapping from UUID to accessories and their implementations
    readonly accessories = new Map<string, AccessoryLinkage>();

    // Create a new AEG RX 9 / Electrolux Pure i9 platform
    constructor(
        log: Logger,
        readonly platformConfig: PlatformConfig,
        readonly hb:             API
    ) {
        this.makeUUID = hb.hap.uuid.generate;

        // Use a custom logger to filter-out sensitive information
        this.log = new PrefixLogger(log);

        // Wait for Homebridge to restore cached accessories
        this.hb.on('didFinishLaunching', () => void this.finishedLaunching());
    }

    // Restore a cached accessory
    configureAccessory(accessory: PlatformAccessory): void {
        this.accessories.set(accessory.UUID, { accessory });
    }

    // Update list of robots after cache has been restored
    async finishedLaunching(): Promise<void> {
        try {
            // Check that the dependencies and configuration
            checkDependencyVersions(this);
            this.checkConfig();

            // Initialise the platform accessories
            await this.addConfiguredAccessories();
            this.removeUnconfiguredAccessories();
        } catch (err) {
            logError(this.log, 'Plugin initialisation', err);
            try {
                this.setAccessoryErrors(err);
            } catch (err) {
                logError(this.log, 'Plugin error handler', err);
            }
        }
    }

    // Check the user's configuration
    checkConfig(): void {
        // Apply default values
        const config = deepMerge(DEFAULT_CONFIG, this.platformConfig);

        // Ensure that all required fields are provided and are of suitable types
        const checker = checkers.Config;
        checker.setReportedPath('<PLATFORM_CONFIG>');
        const strictValidation = checker.strictValidate(config);
        if (!checker.test(config)) {
            this.log.error('Plugin unable to start due to configuration errors:');
            this.logCheckerValidation(LogLevel.ERROR, strictValidation);
            throw new Error('Invalid plugin configuration');
        }

        // Warn of extraneous fields in the configuration
        if (strictValidation) {
            this.log.warn('Unsupported fields in plugin configuration will be ignored:');
            this.logCheckerValidation(LogLevel.WARN, strictValidation);
        }

        // Use the validated configuration
        this.config = config;
        if (this.config.debug.includes('Log Debug as Info')) this.log.logDebugAsInfo();
    }

    // Log configuration checker validation errors
    logCheckerValidation(level: LogLevel, errors: IErrorDetail[] | null): void {
        const errorLines = errors ? getValidationTree(errors) : [];
        errorLines.forEach(line => { this.log.log(level, line); });
        this.log.info(`${this.hb.user.configPath()}:`);
        const configLines = JSON.stringify(this.platformConfig, null, 4).split('\n');
        configLines.forEach(line => { this.log.info(`    ${line}`); });
    }

    // Add any accessories that have been configured
    async addConfiguredAccessories(): Promise<void> {
        // Prepare persistent storage for this plugin
        const persistDir = Path.join(this.hb.user.storagePath(), PLUGIN_NAME, 'persist');
        await NodePersist.init({ dir: persistDir });

        // Add accessories for any robots associated with the AEG account
        const account = new AEGAccount(this.log, this.config);
        const robotPromises = await account.getRobots();
        this.log.info(`Found ${plural(robotPromises.length, 'robot vacuum')}`);
        await Promise.all(robotPromises.map(this.addRobotAccessory.bind(this)));
    }

    // Add an accessory for a robot
    async addRobotAccessory(robotPromise: Promise<AEGRobot>): Promise<void> {
        const robot = await robotPromise;
        const uuid = this.makeUUID(robot.applianceId);

        // Check if an accessory was restored from the cache
        const existingAccessory = this.accessories.get(uuid);
        if (existingAccessory) {
            // Attach functionality to the existing accessory
            const { accessory } = existingAccessory;
            this.log.info(`Restoring accessory "${accessory.displayName}" from cache for ${robot.toString()}`);
            const implementation = new AEGRobotAccessory(this, accessory, robot);
            existingAccessory.implementation = implementation;
        } else {
            // Create a new accessory for this robot
            this.log.info(`Creating new accessory "${robot.status.rawName}" for ${robot.toString()}`);
            const accessory = new this.hb.platformAccessory(robot.status.rawName, uuid);
            const implementation = new AEGRobotAccessory(this, accessory, robot);
            this.accessories.set(uuid, { accessory, implementation });
            this.hb.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    // Remove any accessories that are no longer required
    removeUnconfiguredAccessories(): void {
        // Identify accessories that do not have an implementation
        const isObsolete = (linkage: AccessoryLinkage) => !linkage.implementation;
        const rmAccessories = [...this.accessories.values()]
            .filter(isObsolete).map(linkage => linkage.accessory);
        if (!rmAccessories.length) return;

        // Remove the identified accessories
        this.log.warn(`Removing ${plural(rmAccessories.length, 'cached accessory')} that are no longer required`);
        this.hb.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, rmAccessories);
        rmAccessories.forEach(accessory => this.accessories.delete(accessory.UUID));
    }

    // Place all accessories in an error state if initialisation failed
    setAccessoryErrors(cause: unknown): void {
        const accessories = [...this.accessories.values()].map(linkage => linkage.accessory);
        if (!accessories.length) return;

        // Set the error state
        this.log.warn('Placing all accessories in error state');
        accessories.forEach(accessory => AEGAccessory.setError(this, accessory, cause));
    }
}