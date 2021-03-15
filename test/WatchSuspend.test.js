"use strict";

const path = require("path");
const fs = require("fs");

const webpack = require("../");

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
		const file2Path = path.join(fixturePath, "file2.js");
		const file3Path = path.join(fixturePath, "file3.js");
		const outputPath = path.join(fixturePath, "bundle.js");
		let compiler = null;
		let watching = null;
		let onChange = null;

		beforeAll(() => {
			try {
				fs.mkdirSync(fixturePath);
			} catch (e) {
				// skip
			}
			try {
				fs.writeFileSync(filePath, "'foo'", "utf-8");
				fs.writeFileSync(file2Path, "'file2'", "utf-8");
				fs.writeFileSync(file3Path, "'file3'", "utf-8");
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
			watching = compiler.watch({ aggregateTimeout: 50 }, () => {});
			compiler.hooks.done.tap("WatchSuspendTest", () => {
				if (onChange) onChange();
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

		it("should not drop changes when suspended", done => {
			const aggregateTimeout = 50;
			// Trigger initial compilation with file2.js (assuming correct)
			fs.writeFileSync(
				filePath,
				'require("./file2.js"); require("./file3.js")',
				"utf-8"
			);

			onChange = () => {
				// Initial compilation is done, start the test
				watching.suspend();

				// Trigger the first change (works as expected):
				fs.writeFileSync(file2Path, "'foo'", "utf-8");

				// Trigger the second change _after_ aggregation timeout of the first
				setTimeout(() => {
					fs.writeFileSync(file3Path, "'bar'", "utf-8");

					// Wait when the file3 edit is settled and re-compile
					setTimeout(() => {
						watching.resume();

						onChange = () => {
							onChange = null;
							expect(fs.readFileSync(outputPath, "utf-8")).toContain("'bar'");
							done();
						};
					}, 200);
				}, aggregateTimeout + 50);
			};
		});
	});
});
