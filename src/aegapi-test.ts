// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { Logger } from 'homebridge';

import { AEGAPI } from './aegapi.js';
import { ApplianceId, Appliances } from './aegapi-types.js';
import { logError, plural } from './utils.js';
import { AEGAPIRX9 } from './aegapi-rx9.js';

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

// Tests of the Electrolux Group API
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
    }

    // Run all enabled tests
    async runAllTests(): Promise<void> {
        try {
            // Generic tests
            const appliances = await this.runSafeGenericTests();

            // AEG RX9.1 or RX9.2 robot vacuum cleaner tests
            const applianceIds = this.selectRX9(appliances);
            if (applianceIds.length === 0)
                this.log.warn('No AEG RX9.1 or RX9.2 robot vacuum cleaner found for API test');
            for (const applianceId of applianceIds) {
                await this.runSafeRX9Tests(applianceId);
                if (this.unsafe) await this.runUnsafeRX9Tests(applianceId);
            }

            // Log a summary of the results
            this.summariseResults();
        } catch (err) {
            logError(this.log, 'API test', err);
        }
    }

    // Run safe generic tests
    async runSafeGenericTests(): Promise<Appliances | undefined> {
        const test = this.makeTester(this.api);

        // Run the tests
        const appliances = await test('getAppliances');

        // Return results required for other tests
        return appliances;
    }

    // Run safe AEG RX9.1 or RX9.2 robot vacuum cleaner  tests
    async runSafeRX9Tests(applianceId: ApplianceId): Promise<void> {
        const test = this.makeTester(this.api);
        const rx9test = this.makeTester(this.api.rx9API(applianceId));

        // Run most of the tests
        await test('getApplianceInfo', applianceId);
        await rx9test('getApplianceInfo');
        await test('getApplianceState', applianceId);
        await rx9test('getApplianceState');
    }

    // Run unsafe AEG RX9.1 or RX9.2 robot vacuum cleaner tests
    async runUnsafeRX9Tests(applianceId: ApplianceId): Promise<void> {
        const test = this.makeTester(this.api);
        const rx9test = this.makeTester(this.api.rx9API(applianceId));

        // Run the tests
        await test('sendCommand', applianceId, { CleaningCommand: 'home' });
        await rx9test('sendCleaningCommand', 'home');
    }

    // Identify AEG RX9.1 or RX9.2 robot vacuum cleaners to run tests against
    selectRX9(appliances?: Appliances): ApplianceId[] {
        return (appliances ?? [])
            .filter(appliance => AEGAPIRX9.isRX9(appliance))
            .map(a => a.applianceId);
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