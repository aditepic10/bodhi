import type {
	BodhiConfig,
	Fact,
	FactExtractionCallback,
	IntelProvider,
	Store,
	StoredEvent,
} from "@bodhi/types";

import { hasConfiguredLanguageModel } from "../agent/providers";
import type { Logger } from "../logger";
import type { PipelineLike } from "../store/sqlite";
import { createFactExtractor, reconcileExtractedFacts } from "./extractors/facts";

const DEFAULT_QUEUE_MAX = 1000;
const DEFAULT_RESCAN_INTERVAL_MS = 5 * 60_000;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_OPEN_MS = 30_000;
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = 500;
const DAILY_LIMIT_WARNING_RATIO = 0.8;

export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface IntelHealthSnapshot {
	enabled: boolean;
	queueDepth: number;
	queueMax: number;
	circuitBreaker: CircuitBreakerState;
}

export interface IntelService {
	drain(): Promise<void>;
	enqueue(event: StoredEvent): void;
	getHealth(): IntelHealthSnapshot;
	onFactExtracted(callback: FactExtractionCallback): () => void;
	start(): Promise<void>;
}

interface IntelServiceOptions {
	config: BodhiConfig;
	extractor?: IntelProvider;
	hasLanguageModel?: () => boolean;
	log: Logger;
	pipeline: PipelineLike;
	rescanIntervalMs?: number;
	store: Store;
	time?: {
		monotonicNow?: () => number;
		now?: () => number;
	};
}

function getDayKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isRateLimitError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const statusCode =
		"statusCode" in error && typeof error.statusCode === "number"
			? error.statusCode
			: "status" in error && typeof error.status === "number"
				? error.status
				: undefined;

	if (statusCode === 429) {
		return true;
	}

	if ("message" in error && typeof error.message === "string") {
		return /\b429\b|rate limit/i.test(error.message);
	}

	return false;
}

export function createIntelService(options: IntelServiceOptions): IntelService {
	const extractor =
		options.extractor ??
		createFactExtractor({
			config: options.config,
			log: options.log,
			pipeline: options.pipeline,
		});
	const hasLanguageModel =
		options.hasLanguageModel ?? (() => hasConfiguredLanguageModel(options.config));
	const now = options.time?.now ?? Date.now;
	const monotonicNow = options.time?.monotonicNow ?? (() => performance.now());
	const queue: StoredEvent[] = [];
	const callbacks = new Set<FactExtractionCallback>();
	const queueMax = DEFAULT_QUEUE_MAX;
	const rescanIntervalMs = options.rescanIntervalMs ?? DEFAULT_RESCAN_INTERVAL_MS;

	let circuitBreaker: CircuitBreakerState = "closed";
	let currentDayKey = getDayKey(now());
	let dailyExtractions = 0;
	let disabledWarningLogged = false;
	let draining = false;
	let failures: number[] = [];
	let openUntil = 0;
	let processing = false;
	let started = false;
	let limitWarningLogged = false;
	let rescanTimer: ReturnType<typeof setInterval> | undefined;

	const health = (): IntelHealthSnapshot => ({
		enabled: hasLanguageModel(),
		circuitBreaker,
		queueDepth: queue.length,
		queueMax,
	});

	const resetDayIfNeeded = () => {
		const nextDayKey = getDayKey(now());
		if (nextDayKey === currentDayKey) {
			return;
		}

		currentDayKey = nextDayKey;
		dailyExtractions = 0;
		limitWarningLogged = false;
	};

	const canExtractToday = (): boolean => {
		resetDayIfNeeded();
		if (options.config.intel.max_daily_extractions <= 0) {
			return false;
		}

		const warningThreshold = Math.max(
			1,
			Math.floor(options.config.intel.max_daily_extractions * DAILY_LIMIT_WARNING_RATIO),
		);
		if (!limitWarningLogged && dailyExtractions >= warningThreshold) {
			options.log.warn("intel extraction budget nearing limit", {
				used: dailyExtractions,
				limit: options.config.intel.max_daily_extractions,
			});
			limitWarningLogged = true;
		}

		return dailyExtractions < options.config.intel.max_daily_extractions;
	};

	const recordFailure = () => {
		const current = monotonicNow();
		failures = failures.filter((value) => current - value <= CIRCUIT_BREAKER_WINDOW_MS);
		failures.push(current);
		if (failures.length < CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
			return;
		}

		circuitBreaker = "open";
		openUntil = current + CIRCUIT_BREAKER_OPEN_MS;
		options.log.warn("intel circuit breaker opened", {
			failures: failures.length,
			window_ms: CIRCUIT_BREAKER_WINDOW_MS,
		});
	};

	const beginCircuitProbeIfReady = (): boolean => {
		if (circuitBreaker !== "open") {
			return true;
		}

		if (monotonicNow() < openUntil) {
			return false;
		}

		circuitBreaker = "half-open";
		return true;
	};

	const closeCircuit = () => {
		circuitBreaker = "closed";
		failures = [];
		openUntil = 0;
	};

	const openCircuit = () => {
		circuitBreaker = "open";
		openUntil = monotonicNow() + CIRCUIT_BREAKER_OPEN_MS;
	};

	const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

	const extractWithRateLimitRetry = async (event: StoredEvent) => {
		for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
			try {
				return await extractor.extract(event);
			} catch (error) {
				if (!isRateLimitError(error) || attempt === RATE_LIMIT_RETRIES) {
					throw error;
				}

				await sleep(RATE_LIMIT_BACKOFF_MS * 2 ** attempt);
			}
		}

		return [];
	};

	const notifyCallbacks = async (fact: Fact) => {
		for (const callback of callbacks) {
			try {
				await callback(fact);
			} catch (error) {
				options.log.error("intel fact callback failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	};

	const processEvent = async (event: StoredEvent) => {
		if (!hasLanguageModel()) {
			if (!disabledWarningLogged) {
				options.log.warn("intel service disabled: no language model configured");
				disabledWarningLogged = true;
			}
			return;
		}

		disabledWarningLogged = false;
		if (!beginCircuitProbeIfReady()) {
			return;
		}

		if (!canExtractToday()) {
			options.log.warn("intel extraction budget exhausted", {
				limit: options.config.intel.max_daily_extractions,
			});
			return;
		}

		await options.store.markStarted(event.id);

		try {
			const extracted = await extractWithRateLimitRetry(event);
			dailyExtractions += 1;

			const inserted = await reconcileExtractedFacts({
				event,
				extracted,
				log: options.log,
				store: options.store,
			});

			await options.store.markProcessed(event.id);
			closeCircuit();

			for (const fact of inserted) {
				await notifyCallbacks(fact);
			}
		} catch (error) {
			if (isRateLimitError(error)) {
				options.log.warn("intel extraction hit provider rate limit", {
					error: error instanceof Error ? error.message : String(error),
					event_id: event.event_id,
				});
				return;
			}

			if (circuitBreaker === "half-open") {
				openCircuit();
			} else {
				recordFailure();
			}

			options.log.error("intel extraction failed", {
				error: error instanceof Error ? error.message : String(error),
				event_id: event.event_id,
			});
		}
	};

	const pump = () => {
		if (processing || queue.length === 0) {
			return;
		}

		const event = queue.shift();
		if (!event) {
			return;
		}

		processing = true;
		void processEvent(event).finally(() => {
			processing = false;
			if (queue.length > 0) {
				pump();
			}
		});
	};

	const enqueue = (event: StoredEvent) => {
		if (draining || !hasLanguageModel()) {
			return;
		}

		if (queue.length >= queueMax) {
			queue.shift();
			options.log.warn("intel queue full, dropping oldest event", {
				queue_max: queueMax,
			});
		}

		queue.push(event);
		pump();
	};

	const recoverUnprocessedEvents = async () => {
		if (!hasLanguageModel()) {
			return;
		}

		const events = await options.store.getUnprocessedEvents(queueMax);
		for (const event of events) {
			enqueue(event);
		}
	};

	return {
		async start() {
			if (started) {
				return;
			}

			started = true;
			await recoverUnprocessedEvents();
			rescanTimer = setInterval(() => {
				void recoverUnprocessedEvents();
			}, rescanIntervalMs);
		},
		enqueue,
		onFactExtracted(callback) {
			callbacks.add(callback);
			return () => {
				callbacks.delete(callback);
			};
		},
		getHealth() {
			return health();
		},
		async drain() {
			draining = true;
			queue.length = 0;
			if (rescanTimer) {
				clearInterval(rescanTimer);
				rescanTimer = undefined;
			}

			while (processing) {
				await sleep(10);
			}
		},
	};
}
