// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2024 Alexander Thoukydides

import { Logger } from 'homebridge';
import { createCheckers } from 'ts-interface-checker';

import { AEGAuthoriseUserAgent } from './aegapi-ua-auth.js';
import { AEGApplianceAPI } from './aegapi-appliance.js';
import { Appliances, Countries, Domains, FAQ, Feed, HealthChecks,
         IdentityProviders, LegalDocuments, MeasurementUnits, PatchUser,
         PostWebShop, PutChangePassword, User, WebShop } from './aegapi-types.js';
import { AEG_APP } from './settings.js';
import { Config } from './config-types.js';
import { AEGAPITest } from './aegapi-test.js';
import aegapiTI from './ti/aegapi-types-ti.js';

// Checkers for API responses
const checkers = createCheckers(aegapiTI);

// Access to the AEG RX 9 / Electrolux Pure i9 cloud API
export class AEGAPI {

    // Language settings for some API methods (set by getCurrentUser())
    language = {
        countryCode:  'GB',
        languageCode: 'en'
    };

    // User agent used for all requests
    readonly ua: AEGAuthoriseUserAgent;

    // Create a new API
    constructor(
        readonly log:    Logger,
        readonly config: Config
    ) {
        this.ua = new AEGAuthoriseUserAgent(log, config);

        // Run API tests if enabled
        if (config.debug.includes('Run API Tests')) {
            const unsafe = config.debug.includes('Run Unsafe API Tests');
            new AEGAPITest(log, this, unsafe);
        }
    }

    // Global API methods

    getCountries(): Promise<Countries> {
        return this.ua.getJSON(checkers.Countries, '/country/api/v1/countries');
    }

    getFAQ(app = AEG_APP): Promise<FAQ> {
        return this.ua.getJSON(checkers.FAQ, `/faq/api/v2/faqs/${app}/`, { query: this.language });
    }

    getLegalDocuments(): Promise<LegalDocuments> {
        const path = `/legaldocument/api/v1/legaldocuments/${this.language.countryCode}/${this.language.languageCode}/`;
        return this.ua.getJSON(checkers.LegalDocuments, path);
    }

    getHealthChecks(): Promise<HealthChecks> {
        return this.ua.getJSON(checkers.HealthChecks, '/health-check/api/v1/health-checks');
    }

    getFeed(): Promise<Feed> {
        return this.ua.getJSON(checkers.Feed, '/feed/api/v3.1/feeds', { query: this.language });
    }

    async getIdentityProviders(brand = 'AEG'): Promise<IdentityProviders> {
        const query = { brand, countryCode: this.language.countryCode };
        const provider = await this.ua.getJSON<IdentityProviders>(
            checkers.IdentityProviders, '/one-account-user/api/v1/identity-providers', { query });
        if (provider.length) this.ua.setURL(provider[0].httpRegionalBaseUrl);
        return provider;
    }

    async getCurrentUser(): Promise<User> {
        const user = await this.ua.getJSON<User>(checkers.User, '/one-account-user/api/v1/users/current');
        this.language = { countryCode: user.countryCode, languageCode: user.locale };
        return user;
    }

    setUserName(firstName: string, lastName = ''): Promise<User> {
        const patchBody: PatchUser = { firstName, lastName };
        return this.ua.patchJSON(checkers.User, '/one-account-user/api/v1/users/current', patchBody);
    }

    setCountry(countryCode: string): Promise<User> {
        const patchBody: PatchUser = { countryCode };
        return this.ua.patchJSON(checkers.User, '/one-account-user/api/v1/users/current', patchBody);
    }

    setMeasurementUnits(measurementUnits: MeasurementUnits): Promise<User> {
        const patchBody: PatchUser = { measurementUnits };
        return this.ua.patchJSON(checkers.User, '/one-account-user/api/v1/users/current', patchBody);
    }

    changePassword(password: string, newPassword: string): Promise<void> {
        const putBody: PutChangePassword = { password, newPassword };
        return this.ua.put('/one-account-user/api/v1/users/current/change-password', putBody);
    }

    getAppliances(): Promise<Appliances> {
        return this.ua.getJSON(checkers.Appliances, '/appliance/api/v2/appliances');
    }

    getDomains(): Promise<Domains> {
        return this.ua.getJSON(checkers.Domains, '/domain/api/v2/domains');
    }

    // API functions for specific appliance(s)

    getWebShopURLs(applianceIds: string[]): Promise<WebShop> {
        const path = `/webshop/api/v2.1/webshop-urls/${this.language.countryCode}`;
        const devices = applianceIds.map(applianceId => ({ applianceId }));
        const body: PostWebShop = { WebShopDeviceQueryDTOs: devices };
        return this.ua.postJSON(checkers.WebShop, path, body);
    }

    applianceAPI(applianceId: string) {
        return new AEGApplianceAPI(this.ua, applianceId);
    }
}