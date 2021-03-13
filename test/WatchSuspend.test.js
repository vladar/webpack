"use strict";

const path = require("path");
const fs = require("fs");

const webpack = require("../");

const aggregateTimeout = 50;

describe("WatchSuspend", () => {
	if (process.env.NO_WATCH_TESTS) {
		it.skip("long running tests excluded", () => {});
		return;
	}

	jest.setTimeout(5000);

	describe("suspend and resume watcher", () => {
		const fixturePath = path.join(
			__dirname,
			"fixtures",
			"temp-watch-" + Date.now()
		);
		const filePath = path.join(fixturePath, "file.js");
		const outputPath = path.join(fixturePath, "bundle.js");
		let compiler = null;
		let watching = null;
		let onChange = null;
		let onInvalid = null;

		beforeAll(() => {
			try {
				fs.mkdirSync(fixturePath);
			} catch (e) {
				// skip
			}
			try {
				fs.writeFileSync(filePath, "'foo'", "utf-8");
			} catch (e) {
				// skip
			}
			compiler = webpack({
				mode: "development",
				entry: filePath,
				output: {
					path: fixturePath,
					filename: "bundle.js"
				}
			});
			watching = compiler.watch({ aggregateTimeout }, () => {});

			compiler.hooks.done.tap("WatchSuspendTest", () => {
				if (onChange) onChange();
			});
			compiler.hooks.invalid.tap("WatchSuspendTestInvalidation", () => {
				if (onInvalid) onInvalid();
			});
		});

		afterAll(() => {
			watching.close();
			compiler = null;
			try {
				fs.unlinkSync(filePath);
			} catch (e) {
				// skip
			}
			try {
				fs.rmdirSync(fixturePath);
			} catch (e) {
				// skip
			}
		});

		it("should compile successfully", done => {
			onChange = () => {
				expect(fs.readFileSync(outputPath, "utf-8")).toContain("'foo'");
				onChange = null;
				done();
			};
		});

		it("should suspend compilation", done => {
			onChange = jest.fn();
			watching.suspend();
			fs.writeFileSync(filePath, "'bar'", "utf-8");
			setTimeout(() => {
				expect(onChange.mock.calls.length).toBe(0);
				onChange = null;
				done();
			}, 1000);
		});

		it("should resume compilation", done => {
			onChange = () => {
				expect(fs.readFileSync(outputPath, "utf-8")).toContain("'bar'");
				onChange = null;
				done();
			};
			watching.resume();
		});

		it("should not drop changes during resumed compilation", done => {
			// aggregateTimeout must be long enough to make
			//  resumed compilation finish first
			watching.watchOptions.aggregateTimeout = 500;
			watching.suspend();

			onInvalid = () => {
				watching.resume();
				onInvalid = null;
			};

			fs.writeFileSync(filePath, "'baz'", "utf-8");

			setTimeout(() => {
				watching.watchOptions.aggregateTimeout = aggregateTimeout;
				expect(fs.readFileSync(outputPath, "utf-8")).toContain("'baz'");
				done();
			}, 1000);
		});
	});
});
