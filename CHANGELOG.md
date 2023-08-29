# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [v0.2.8] - 2023-08-29
### Changed
* Updated dependencies to latest versions.

## [v0.2.7] - 2023-07-19
### Fixed
* Accept optional URLs in authentication responses. ([#13])
### Changed
* Updated dependencies to latest versions.

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
* Updated dependencies to latest versions.

## [v0.2.4] - 2023-04-20
### Fixed
* Accept a reported cleaned area zone status of `terminated`.
### Added
* Added Node 20 to supported engines.
### Changed
* Updated dependencies to latest versions.

## [v0.2.3] - 2023-03-21
### Fixed
* Accept an optional `metadata` field returned by the API in appliance `properties`.
### Changed
* Updated dependencies to latest versions.

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

Copyright © 2022-2023 Alexander Thoukydides

[Unreleased]:       https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.8...HEAD
[v0.2.8]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.7...v0.2.8
[v0.2.7]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.6...v0.2.7
[v0.2.6]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.5...v0.2.6
[v0.2.5]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.4...v0.2.5
[v0.2.4]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.3...v0.2.4
[v0.2.3]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.2...v0.2.3
[v0.2.2]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.1...v0.2.2
[v0.2.1]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.2.0...v0.2.1
[v0.2.0]:           https://github.com/thoukydides/homebridge-aeg-robot/compare/v0.1.0...v0.2.0
[v0.1.0]:           https://github.com/thoukydides/homebridge-aeg-robot/releases/tag/v0.1.0
