// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { Logger } from 'homebridge';

import { AEGAPI } from './aegapi';
import { AEGApplianceAPI } from './aegapi-appliance';
import { Appliance, Appliances, CleaningCommand, DomainAppliance, Domains,
         NewTask, PowerMode, SettableProperties } from './aegapi-types';
import { logError } from './utils';

// A test failure
interface Failure {
    logPrefix:  string;
    testName:   string;
    error:      unknown;
}

// A tester for a single API method
type Tester = <Args extends unknown[], Returns>
              (method: (...args: [...Args]) => Promise<Returns>, ...args: [...Args])
              => Promise<Returns | undefined>;

// Tests of the AEG RX 9 / Electrolux Pure i9 cloud API
export class AEGAPITest {

    // Number of tests run and errors generated
    tests = 0;
    failures: Failure[] = [];

    // Construct a new tester and start running the tests
    constructor(
        readonly log:    Logger,
        readonly api:    AEGAPI,
        readonly unsafe: boolean
    ) {
        this.runAllTests();
    }

    // Run all enabled tests
    async runAllTests(): Promise<void> {
        try {
            // Global tests
            const { appliances, domains } = await this.runSafeGlobalTests();

            // Appliance tests
            const { appliance, domainAppliance } = this.selectRobot(appliances, domains);
            if (appliance && domainAppliance) {
                await this.runSafeApplianceTests(appliance);
                if (this.unsafe) await this.runUnsafeApplianceTests(appliance, domainAppliance);
            } else {
                this.log.warn('No robot appliance found for API test');
            }

            // Log a summary of the results
            this.summariseResults();
        } catch (err) {
            logError(this.log, 'API test', err);
        }
    }

    // Run safe global tests
    async runSafeGlobalTests(): Promise<{ appliances?: Appliances; domains?: Domains }> {
        const test = this.makeTester(this.api);

        // Run the tests
        await test(this.api.getCountries);
        await test(this.api.getFAQ);
        await test(this.api.getLegalDocuments);
        await test(this.api.getHealthChecks);
        await test(this.api.getFeed);
        await test(this.api.getCurrentUser);
        const appliances = await test(this.api.getAppliances);
        const domains    = await test(this.api.getDomains);
        const applianceIds = (appliances || []).map(a => a.applianceId);
        await test(this.api.getWebShopURLs, applianceIds);

        // Return results required for other tests
        return { appliances, domains };
    }

    // Run safe appliance tests
    async runSafeApplianceTests(appliance: Appliance): Promise<void> {
        const applianceAPI = this.api.applianceAPI(appliance.applianceId);
        const test = this.makeTester(applianceAPI);

        // Run most of the tests
        await test(applianceAPI.getApplianceInfo);
        await test(applianceAPI.getApplianceTasks);
        const interactiveMaps = await test(applianceAPI.getApplianceInteractiveMaps);
        await test(applianceAPI.getApplianceLifetime);
        const cleanedAreas = await test(applianceAPI.getApplianceCleanedAreas);
        await test(applianceAPI.getApplianceHistory);
        // [404 Not Found] Failed to retrieve capabilities from delta (capability_0004)
        //await test(applianceAPI.getApplianceCapabilities);

        // Run the map retrieval tests
        if (cleanedAreas?.length) {
            const { sessionId } = cleanedAreas[0];
            await test(applianceAPI.getApplianceSessionMap, sessionId);
        } else {
            this.log.warn('No cleaned area session found for API test');
        }
        if (interactiveMaps?.length) {
            const { id, sequenceNumber } = interactiveMaps[0];
            await test(applianceAPI.getApplianceInteractiveMap, id, sequenceNumber);
        } else {
            this.log.warn('No interactive map found for API test');
        }
    }

    // Run safe appliance tests
    async runUnsafeApplianceTests(appliance: Appliance, domainAppliance: DomainAppliance): Promise<void> {
        const applianceAPI = this.api.applianceAPI(appliance.applianceId);
        const test = this.makeTester(applianceAPI);

        // Attempt to select parameters that won't actually change anything
        const property = <Key extends keyof SettableProperties>(key: Key): SettableProperties[Key] =>
            appliance.properties.reported[key] ?? appliance.properties.desired[key];
        const { applianceName } = appliance.applianceData;
        const powerMode = property('powerMode') ?? PowerMode.Power;
        const mute      = property('mute')      ?? false;
        const language  = property('language')  ?? 'eng';
        const cleaningCommand = CleaningCommand.Home;
        const timeZoneStandardName = domainAppliance.timeZoneStandardName ?? 'Europe/London';

        // Run most of the tests
        await test(applianceAPI.setPowerMode, powerMode);
        await test(applianceAPI.setApplianceName, applianceName, timeZoneStandardName);
        await test(applianceAPI.setMute, mute);
        await test(applianceAPI.setLanguage, language);
        await test(applianceAPI.cleaningCommand, cleaningCommand);

        // Run the task creation/modification/deletion tests
        const newTask: NewTask = {
            name:   'API Test',
            enabled:    false,
            start: {
                weekDays:   ['Monday'],
                time:       '12:00:00',
                properties: {
                    Zones:  [{
                        PowerMode:  PowerMode.Power
                    }]
                }
            }
        };
        const createdTask = await test(applianceAPI.createApplianceTask, newTask);
        if (createdTask) {
            await test(applianceAPI.replaceApplianceTask, createdTask);
            await test(applianceAPI.deleteApplianceTask, createdTask.id);
        }
    }

    // Select a single robot appliance to run tests against
    selectRobot(appliances?: Appliances, domains?: Domains): { appliance?: Appliance; domainAppliance?: DomainAppliance } {
        const appliance = appliances?.find(appliance => AEGApplianceAPI.isRobot(appliance));
        const domainAppliance = domains?.appliances.find(domain => domain.pncId === appliance?.applianceId);
        return { appliance, domainAppliance };
    }

    // Bind a tester to a specific API
    makeTester(api: object): Tester {
        return (...args) => this.test(api, ...args);
    }

    // Test a single API method
    async test<Args extends unknown[], Returns>
    (api: object, method: (...args: [...Args]) => Promise<Returns>, ...args: [...Args]): Promise<Returns | undefined> {
        // Log the test being performed
        const logPrefix = `API test #${++this.tests}`;
        const argsName = args.map(arg => JSON.stringify(arg));
        const testName = `${method.name}(${argsName.join(', ')})`;
        this.log.debug(`${logPrefix}: ${testName}`);

        // Run the test and record any error thrown
        try {
            return await method.apply(api, args);
        } catch (err) {
            this.failures.push({ logPrefix, testName, error: err });
            this.log.error(`[${logPrefix}] ${testName}`);
            logError(this.log, logPrefix, err);
            return undefined;
        }
    }

    // Log a summary of the results
    summariseResults(): void {
        if (this.failures.length) {
            this.log.error(`${this.failures.length} of ${this.tests} API tests failed`);
            this.failures.forEach(failure => {
                this.log.error(`${failure.logPrefix}: ${failure.testName}`);
                this.log.error(`    ${failure.error}`);
            });
        } else {
            this.log.info(`All ${this.tests} API tests passed`);
        }
    }
}