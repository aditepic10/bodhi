import { describe, expect, test } from "bun:test";

import { createSseWriter } from "./sse";

describe("sse route utilities", () => {
	test("writer ignores duplicate close calls and enqueue after close", () => {
		const chunks: string[] = [];
		let closeCount = 0;
		const writer = createSseWriter<string>({
			close() {
				closeCount += 1;
			},
			enqueue(chunk) {
				chunks.push(chunk);
			},
		});

		writer.enqueue("first");
		writer.close();
		writer.close();
		writer.enqueue("second");

		expect(chunks).toEqual(["first"]);
		expect(closeCount).toBe(1);
		expect(writer.isClosed()).toBe(true);
	});

	test("writer marks itself closed when enqueue throws", () => {
		let enqueueCalls = 0;
		const writer = createSseWriter<string>({
			close() {},
			enqueue() {
				enqueueCalls += 1;
				throw new Error("stream closed");
			},
		});

		writer.enqueue("first");
		writer.enqueue("second");
		writer.close();

		expect(enqueueCalls).toBe(1);
		expect(writer.isClosed()).toBe(true);
	});
});
