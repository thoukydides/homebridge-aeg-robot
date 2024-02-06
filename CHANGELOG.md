# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [v0.4.7] - 2024-02-06
### Changed
* Updated dependencies to latest versions.
### Fixed
* Handle gzip'd API responses.

## [v0.4.6] - 2024-01-27
### Changed
* Updated dependencies to latest versions.
### Fixed
* Cope with maps that do not include any "crumbs".

## [v0.4.5] - 2024-01-13
### Changed
* Updated dependencies to latest versions.

## [v0.4.4] - 2023-12-31
### Changed
* Made the `Configured Name` characteristics writable to allow the service to be renamed via HomeKit. Also added the accessory name as a prefix on the service names.
### Fixed
* Made `ZoneStatus` optional in cleaned area session maps returned by the API.

## [v0.4.3] - 2023-12-25
### Fixed
* Accept an optional `IsValidUUID` field returned by the API in a cleaned area session map match.

## [v0.4.2] - 2023-12-25
### Fixed
* Accept an appliance birthday notification in the feed.
### Changed
* Updated dependencies to latest versions.

## [v0.4.1] - 2023-12-13
### Changed
* Updated dependencies to latest versions.

## [v0.4.0] - 2023-11-21
### Added
* The map for the most recent cleaning session is written to the log.
### Changed
* Updated dependencies to latest versions.

## [v0.3.1] - 2023-11-16
### Fixed
* Accept an in-app survey trigger in the feed.
### Changed
* Updated dependencies.

## [v0.3.0] - 2023-11-10
### Fixed
* Accept address in user information.
### Changed
* Dropped Node 14 compatibility.
* Updated dependencies.

## [v0.2.9] - 2023-10-23
### Fixed
* Accept user ID and name in domain user information.

## [v0.2.7] - 2023-07-19
### Fixed
* Accept optional URLs in authentication responses. ([#13])

## [v0.2.6] - 2023-07-19
### Fixed
* Accept phone numbers in user information. ([#13])
* Accept product area (`WELLBEING`) in appliance information. ([#13])

## [v0.2.5] - 2023-05-05
### Fixed
* Accept a reported cleaned area zone status of `aborted`.
* Accept weight and volume measurement units.
### Changed
* Dropped Node 14 compatibility.

## [v0.2.4] - 2023-04-20
### Fixed
* Accept a reported cleaned area zone status of `terminated`.
### Added
* Added Node 20 to supported engines.

## [v0.2.3] - 2023-03-21
### Fixed
* Accept an optional `metadata` field returned by the API in appliance `properties`.

## [v0.2.2] - 2023-02-17
### Added
* Added decode of cleaned area reports with error status.
* Added decode of feed message for weekly working time increase.
### Changed
* Updated dependencies to latest versions.

## [v0.2.1] - 2023-02-07
### Added
* Added decode of feed message providing global cleaning sessions comparison.

## [v0.2.0] - 2023-01-29
### Added
* Log feed items, cleaned areas, appliance messages, and appliance capabilities reported by the AEG API.

## [v0.1.0] - 2023-01-19
* Initial version.

---

Copyright © 2022-2024 Alexander Thoukydides

[Unreleased]:       https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.4.7...HEAD
[v0.4.7]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.4.6...v0.4.7
[v0.4.6]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.4.5...v0.4.6
[v0.4.5]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.4.4...v0.4.5
[v0.4.4]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.4.3...v0.4.4
[v0.4.3]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.4.2...v0.4.3
[v0.4.2]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.4.1...v0.4.2
[v0.4.1]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.4.0...v0.4.1
[v0.4.0]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.3.1...v0.4.0
[v0.3.1]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.3.0...v0.3.1
[v0.3.0]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.9...v0.3.0
[v0.2.9]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.7...v0.2.9
[v0.2.7]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.6...v0.2.7
[v0.2.6]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.5...v0.2.6
[v0.2.5]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.4...v0.2.5
[v0.2.4]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.3...v0.2.4
[v0.2.3]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.2...v0.2.3
[v0.2.2]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.1...v0.2.2
[v0.2.1]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.0...v0.2.1
[v0.2.0]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.1.0...v0.2.0
[v0.1.0]:           https://github.com/thoukydides/homebridge-aeg-robot/releases/tag/v0.1.0
