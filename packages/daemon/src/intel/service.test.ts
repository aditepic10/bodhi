import { afterEach, describe, expect, test } from "bun:test";
import { type BodhiConfig, BodhiConfigSchema } from "@bodhi/types";

import { createLogger } from "../logger";
import {
	createTestPipeline,
	createTestStore,
	makeEvent,
	resetLLMStubs,
	stubLLMResponse,
} from "../test-utils";
import { createFactExtractor } from "./extractors/facts";
import { createIntelService } from "./service";

function createIntelConfig(overrides: Partial<BodhiConfig> = {}): BodhiConfig {
	return BodhiConfigSchema.parse(overrides);
}

describe("intel service workflows", () => {
	afterEach(() => {
		resetLLMStubs();
	});

	test("extracted facts are reconciled, emitted, and mark the event processed", async () => {
		stubLLMResponse('[{"key":"preferred_editor","value":"vim","confidence":0.94}]');

		const config = createIntelConfig();
		const store = createTestStore(config);
		const pipeline = createTestPipeline();
		const extractor = createFactExtractor({
			config,
			log: createLogger("error"),
			pipeline,
		});
		const service = createIntelService({
			config,
			extractor,
			log: createLogger("error"),
			pipeline,
			store,
		});
		const event = await store.appendEvent(
			makeEvent({
				event_id: "evt-intel-1",
				metadata: {
					command: "git config --global core.editor vim",
					cwd: "/tmp",
					duration_ms: 17,
					exit_code: 0,
				},
			}),
			"shell",
		);
		const extractedFact = new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("timed out waiting for intel fact")), 1000);
			const unsubscribe = service.onFactExtracted((fact) => {
				clearTimeout(timer);
				unsubscribe();
				resolve(fact);
			});
		});

		await service.start();
		service.enqueue(event);

		const fact = await extractedFact;
		const [storedFact] = await store.getFacts({ key: "preferred_editor", status: "active" });
		const [storedEvent] = await store.getEvents({ limit: 1 });

		expect(fact).toMatchObject({
			created_by: "intel",
			key: "preferred_editor",
			value: "vim",
		});
		expect(storedFact?.value).toBe("vim");
		expect(storedEvent?.processed_at).toBeDefined();

		await service.drain();
		store.close();
	});

	test("new intel fact supersedes the old active fact for the same key", async () => {
		stubLLMResponse('[{"key":"preferred_editor","value":"helix","confidence":0.88}]');

		const config = createIntelConfig();
		const store = createTestStore(config);
		const pipeline = createTestPipeline();
		const oldFact = await store.insertFact({
			confidence: 0.7,
			created_by: "intel",
			extraction_meta: undefined,
			key: "preferred_editor",
			schema_version: 1,
			source_event_id: undefined,
			status: "active",
			supersedes_fact_id: undefined,
			valid_from: 1,
			valid_to: undefined,
			value: "vim",
		});
		const extractor = createFactExtractor({
			config,
			log: createLogger("error"),
			pipeline,
		});
		const service = createIntelService({
			config,
			extractor,
			log: createLogger("error"),
			pipeline,
			store,
		});
		const event = await store.appendEvent(
			makeEvent({
				event_id: "evt-intel-2",
				metadata: {
					command: "export EDITOR=hx",
					cwd: "/tmp",
					duration_ms: 5,
					exit_code: 0,
				},
			}),
			"shell",
		);
		const factPromise = new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("timed out waiting for superseding fact")),
				1000,
			);
			const unsubscribe = service.onFactExtracted((fact) => {
				clearTimeout(timer);
				unsubscribe();
				resolve(fact);
			});
		});

		await service.start();
		service.enqueue(event);

		const fact = await factPromise;
		const facts = await store.getFacts({
			key: "preferred_editor",
			limit: 10,
			status: "active",
		});
		const updatedOldFact = store.db
			.query<{ valid_to: number | null }, [string]>(`SELECT valid_to FROM facts WHERE id = ?`)
			.get(oldFact.id);

		expect(fact).toMatchObject({
			key: "preferred_editor",
			supersedes_fact_id: oldFact.id,
			value: "helix",
		});
		expect(facts[0]?.value).toBe("helix");
		expect(updatedOldFact?.valid_to).toBeDefined();

		await service.drain();
		store.close();
	});

	test("service disables gracefully without a configured language model", async () => {
		const config = createIntelConfig();
		const store = createTestStore(config);
		const pipeline = createTestPipeline();
		const service = createIntelService({
			config,
			hasLanguageModel: () => false,
			log: createLogger("error"),
			pipeline,
			store,
		});
		const event = await store.appendEvent(makeEvent({ event_id: "evt-intel-disabled" }), "shell");

		await service.start();
		service.enqueue(event);
		await Bun.sleep(25);

		const facts = await store.getFacts({ limit: 10, status: "active" });
		const [storedEvent] = await store.getEvents({ limit: 1 });

		expect(service.getHealth().enabled).toBe(false);
		expect(facts).toHaveLength(0);
		expect(storedEvent?.processed_at).toBeUndefined();

		await service.drain();
		store.close();
	});

	test("queue processing stays serial even when events are enqueued rapidly", async () => {
		const config = createIntelConfig();
		const store = createTestStore(config);
		const pipeline = createTestPipeline();
		const order: string[] = [];
		const service = createIntelService({
			config,
			extractor: {
				name: "serial-test",
				async extract(event) {
					order.push(`start:${event.event_id}`);
					await Bun.sleep(20);
					order.push(`finish:${event.event_id}`);
					return [];
				},
			},
			hasLanguageModel: () => true,
			log: createLogger("error"),
			pipeline,
			store,
		});

		await service.start();

		const first = await store.appendEvent(makeEvent({ event_id: "evt-serial-1" }), "shell");
		const second = await store.appendEvent(makeEvent({ event_id: "evt-serial-2" }), "shell");

		service.enqueue(first);
		service.enqueue(second);
		await Bun.sleep(75);

		expect(order).toEqual([
			"start:evt-serial-1",
			"finish:evt-serial-1",
			"start:evt-serial-2",
			"finish:evt-serial-2",
		]);

		await service.drain();
		store.close();
	});

	test("three extraction failures within the window open the circuit breaker", async () => {
		const config = createIntelConfig();
		const store = createTestStore(config);
		const pipeline = createTestPipeline();
		let monotonicClock = 0;
		const service = createIntelService({
			config,
			extractor: {
				name: "failing-test",
				async extract() {
					monotonicClock += 10;
					throw new Error("upstream unavailable");
				},
			},
			hasLanguageModel: () => true,
			log: createLogger("error"),
			pipeline,
			store,
			time: {
				monotonicNow: () => monotonicClock,
			},
		});

		await service.start();

		const first = await store.appendEvent(makeEvent({ event_id: "evt-breaker-1" }), "shell");
		const second = await store.appendEvent(makeEvent({ event_id: "evt-breaker-2" }), "shell");
		const third = await store.appendEvent(makeEvent({ event_id: "evt-breaker-3" }), "shell");

		service.enqueue(first);
		service.enqueue(second);
		service.enqueue(third);
		await Bun.sleep(75);

		expect(service.getHealth().circuitBreaker).toBe("open");

		await service.drain();
		store.close();
	});
});
