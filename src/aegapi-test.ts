// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { Logger } from 'homebridge';

import { AEGAPI } from './aegapi.js';
import { AEGApplianceAPI } from './aegapi-appliance.js';
import { Appliance, Appliances, CleaningCommand, DomainAppliance, Domains,
         NewTask, PowerMode, SettableProperties, User } from './aegapi-types.js';
import { logError, plural } from './utils.js';

// A test failure
interface Failure {
    logPrefix:  string;
    testName:   string;
    error:      unknown;
}

// Testable methods on an API class
type TestableMethod = (...args: never[]) => unknown;
type TestableMethodNames<API> = keyof {
    [K in keyof API as API[K] extends TestableMethod ? K : never]: unknown
};

// A tester for an API class
type Tester<API> = <Method extends TestableMethodNames<API>>(
    method: Method,
    ...args: Parameters<Extract<API[Method], TestableMethod>>
) => Promise<ReturnType<Extract<API[Method], TestableMethod>> | undefined>;

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
        void this.runAllTests();
        this.runAllTests.bind(this);
    }

    // Run all enabled tests
    async runAllTests(): Promise<void> {
        try {
            // Global tests
            const { appliances, domains, user } = await this.runSafeGlobalTests();
            if (this.unsafe && user) {
                await this.runUnsafeGlobalTests(user);
            }

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
    async runSafeGlobalTests(): Promise<{ appliances?: Appliances; domains?: Domains; user?: User }> {
        const test = this.makeTester(this.api);

        // Run the tests
        await test('getCountries');
        // [403 Forbidden] '<...>' not a valid key=value pair (missing equal-sign) in Authorization header: 'Bearer <...>'.
        //await test('getFAQ');
        await test('getLegalDocuments');
        await test('getHealthChecks');
        await test('getFeed');
        await test('getIdentityProviders');
        const user       = await test('getCurrentUser');
        const appliances = await test('getAppliances');
        const domains    = await test('getDomains');
        const applianceIds = (appliances ?? []).map(a => a.applianceId);
        await test('getWebShopURLs', applianceIds);

        // Return results required for other tests
        return { appliances, domains, user };
    }

    // Run unsafe global tests
    async runUnsafeGlobalTests(user: User): Promise<void> {
        const test = this.makeTester(this.api);

        // Run the tests
        await test('setUserName', user.firstName, user.lastName);
        await test('setCountry', user.countryCode);
        if (user.measurementUnits !== null) {
            await test('setMeasurementUnits', user.measurementUnits);
        } else {
            this.log.warn('No measurement units found for API test');
        }
    }

    // Run safe appliance tests
    async runSafeApplianceTests(appliance: Appliance): Promise<void> {
        const applianceAPI = this.api.applianceAPI(appliance.applianceId);
        const test = this.makeTester(applianceAPI);

        // Run most of the tests
        await test('getApplianceInfo');
        await test('getApplianceTasks');
        const interactiveMaps = await test('getApplianceInteractiveMaps');
        await test('getApplianceLifetime');
        const cleanedAreas = await test('getApplianceCleanedAreas');
        await test('getApplianceHistory');
        // [404 Not Found] Failed to retrieve capabilities from delta (capability_0004)
        //await test('getApplianceCapabilities');

        // Run the map retrieval tests
        if (cleanedAreas?.[0] !== undefined) {
            const { sessionId } = cleanedAreas[0];
            await test('getApplianceSessionMap', sessionId);
        } else {
            this.log.warn('No cleaned area session found for API test');
        }
        if (interactiveMaps?.[0] !== undefined) {
            const { id, sequenceNumber } = interactiveMaps[0];
            await test('getApplianceInteractiveMap', id);
            await test('getApplianceInteractiveMapData', id, sequenceNumber);
        } else {
            this.log.warn('No interactive map found for API test');
        }
    }

    // Run unsafe appliance tests
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
        await test('setPowerMode', powerMode);
        await test('setApplianceName', applianceName, timeZoneStandardName);
        await test('setMute', mute);
        await test('setLanguage', language);
        await test('cleaningCommand', cleaningCommand);

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
        const createdTask = await test('createApplianceTask', newTask);
        if (createdTask) {
            await test('replaceApplianceTask', createdTask);
            await test('deleteApplianceTask', createdTask.id);
        }
    }

    // Select a single robot appliance to run tests against
    selectRobot(appliances?: Appliances, domains?: Domains): { appliance?: Appliance; domainAppliance?: DomainAppliance } {
        const appliance = appliances?.find(appliance => AEGApplianceAPI.isRobot(appliance));
        const domainAppliance = domains?.appliances.find(domain => domain.pncId === appliance?.applianceId);
        return { appliance, domainAppliance };
    }

    // Bind a tester to a specific API
    makeTester<API>(api: API): Tester<API> {
        return (...args) => this.test(api, ...args);
    }

    // Test a single API method
    async test<API, Method extends TestableMethodNames<API>>(
        api: API,
        method: Method,
        ...args: Parameters<Extract<API[Method], TestableMethod>>
    ): Promise<ReturnType<Extract<API[Method], TestableMethod>> | undefined> {
        // Log the test being performed
        const logPrefix = `API test #${++this.tests}`;
        const argsName = args.map(arg => JSON.stringify(arg));
        const testName = `${String(method)}(${argsName.join(', ')})`;
        this.log.debug(`${logPrefix}: ${testName}`);

        // Run the test and record any error thrown
        try {
            const fn = api[method] as Extract<API[Method], TestableMethod>;
            const result = await fn.apply(api, args);
            return result as ReturnType<Extract<API[Method], TestableMethod>>;
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
            this.log.error(`${this.failures.length} of ${plural(this.tests, 'API test')} failed`);
            this.failures.forEach(failure => {
                this.log.error(`${failure.logPrefix}: ${failure.testName}`);
                this.log.error(`    ${String(failure.error)}`);
            });
        } else {
            this.log.info(`All ${this.tests} API tests passed`);
        }
    }
}