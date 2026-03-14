import type { BodhiEvent, EventType, Fact, StoredEvent } from "@bodhi/types";

import type { Logger } from "./logger";

export interface BusEventMap {
	"event:stored": StoredEvent;
	"fact:extracted": Fact;
	"shell.command.executed": BodhiEvent;
	"shell.command.started": BodhiEvent;
	"git.commit.created": BodhiEvent;
	"git.checkout": BodhiEvent;
	"git.merge": BodhiEvent;
	"git.rewrite": BodhiEvent;
	"ai.prompt": BodhiEvent;
	"ai.tool_call": BodhiEvent;
	"note.created": BodhiEvent;
}

type EventKey = keyof BusEventMap;
type WildcardListener = (event: { type: string; payload: unknown }) => void | Promise<void>;
type Listener<T> = (event: T) => void | Promise<void>;
type RegisteredExactListener = (payload: BusEventMap[EventKey]) => void | Promise<void>;

export interface EventBus {
	on<K extends EventKey>(type: K, handler: Listener<BusEventMap[K]>): () => void;
	on<K extends EventKey>(types: readonly K[], handler: Listener<BusEventMap[K]>): () => void;
	on(type: "*", handler: WildcardListener): () => void;
	emit<K extends EventKey>(type: K, payload: BusEventMap[K]): void;
	listenerCount(type: EventKey | "*"): number;
}

export function createEventBus(log: Logger): EventBus {
	const exactListeners = new Map<EventKey, Set<RegisteredExactListener>>();
	const wildcardListeners = new Set<WildcardListener>();

	const addExactListener = <K extends EventKey>(
		type: K,
		handler: Listener<BusEventMap[K]>,
	): (() => void) => {
		const bucket = exactListeners.get(type) ?? new Set<RegisteredExactListener>();
		const registered: RegisteredExactListener = (payload) => handler(payload as BusEventMap[K]);
		bucket.add(registered);
		exactListeners.set(type, bucket);

		if (bucket.size > 50) {
			log.warn("event bus listener threshold exceeded", { type, listeners: bucket.size });
		}

		return () => {
			const current = exactListeners.get(type);
			if (!current) {
				return;
			}

			current.delete(registered);
			if (current.size === 0) {
				exactListeners.delete(type);
			}
		};
	};

	const addWildcardListener = (handler: WildcardListener): (() => void) => {
		wildcardListeners.add(handler);
		if (wildcardListeners.size > 50) {
			log.warn("event bus listener threshold exceeded", {
				listeners: wildcardListeners.size,
				type: "*",
			});
		}

		return () => {
			wildcardListeners.delete(handler);
		};
	};

	const dispatch = (handler: () => void | Promise<void>, type: string) => {
		void Promise.resolve()
			.then(handler)
			.catch((error: unknown) => {
				log.error("event bus handler failed", {
					type,
					error: error instanceof Error ? error.message : String(error),
				});
			});
	};

	function on<K extends EventKey>(type: K, handler: Listener<BusEventMap[K]>): () => void;
	function on<K extends EventKey>(
		types: readonly K[],
		handler: Listener<BusEventMap[K]>,
	): () => void;
	function on(type: "*", handler: WildcardListener): () => void;
	function on(
		typeOrTypes: EventKey | readonly EventKey[] | "*",
		handler: WildcardListener | Listener<BusEventMap[EventKey]>,
	): () => void {
		if (typeOrTypes === "*") {
			return addWildcardListener(handler as WildcardListener);
		}

		if (Array.isArray(typeOrTypes)) {
			const typedHandler = handler as Listener<BusEventMap[EventKey]>;
			const unsubscribers = typeOrTypes.map((type) => addExactListener(type, typedHandler));
			return () => {
				for (const unsubscribe of unsubscribers) {
					unsubscribe();
				}
			};
		}

		if (typeof typeOrTypes === "string") {
			return addExactListener(typeOrTypes, handler as Listener<BusEventMap[EventKey]>);
		}

		return () => {};
	}

	return {
		on,
		emit<K extends EventKey>(type: K, payload: BusEventMap[K]): void {
			const exact = exactListeners.get(type);
			if (exact) {
				for (const handler of exact) {
					dispatch(() => handler(payload), type);
				}
			}

			for (const handler of wildcardListeners) {
				dispatch(() => handler({ type, payload }), "*");
			}
		},
		listenerCount(type: EventKey | "*"): number {
			if (type === "*") {
				return wildcardListeners.size;
			}

			return exactListeners.get(type)?.size ?? 0;
		},
	};
}

export const captureEventTypes: readonly EventType[] = [
	"shell.command.executed",
	"shell.command.started",
	"git.commit.created",
	"git.checkout",
	"git.merge",
	"git.rewrite",
	"ai.prompt",
	"ai.tool_call",
	"note.created",
];
