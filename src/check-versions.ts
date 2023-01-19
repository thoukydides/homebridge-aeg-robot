// Homebridge plugin for AEG RX 9 / Electrolux Pure i9 robot vacuum
// Copyright © 2022-2023 Alexander Thoukydides

import { PACKAGE, PLUGIN_NAME, PLUGIN_VERSION,
         REQUIRED_HOMEBRIDGE_API } from './settings';
import { AEGPlatform } from './platform';
import semver from 'semver';

// Log critical package and API versions
export function checkDependencyVersions(platform: AEGPlatform): void {
    const versions = [
        // Name             Current version             Required version
        [PLUGIN_NAME,       PLUGIN_VERSION                                          ],
        ['Node.js',         process.versions.node,      PACKAGE.engines.node        ],
        ['Homebridge',      platform.hb.serverVersion,  PACKAGE.engines.homebridge  ],
        ['Homebridge API',  platform.hb.version,        REQUIRED_HOMEBRIDGE_API     ]
    ];

    // Log/check each version against the requirements
    versions.forEach(([name, current, required]) => {
        const semverCurrent = semver.coerce(current);
        if (!required) {
            platform.log.info(`${name} version ${current}`);
        } else if (semverCurrent === null) {
            platform.log.warn(`${name} version ${current} cannot be coerced to semver (require ${required})`);
        } else if (semver.satisfies(semverCurrent, required)) {
            platform.log.info(`${name} version ${current} (satisfies ${required})`);
        } else {
            platform.log.error(`${name} version ${current} is incompatible (satisfies ${required})`);
        }
    });
}