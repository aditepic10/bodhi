import type { BodhiEvent, EventType, Fact, StoredEvent } from "@bodhi/types";

import type { Logger } from "./logger";

export interface BusEventMap {
	"event:stored": StoredEvent;
	"fact:extracted": Fact;
	"shell.command.executed": BodhiEvent;
	"shell.command.started": BodhiEvent;
	"git.commit.created": BodhiEvent;
	"note.created": BodhiEvent;
	"fact.extracted": BodhiEvent;
	"conversation.message": BodhiEvent;
}

type EventKey = keyof BusEventMap;
type WildcardListener = (event: { type: string; payload: unknown }) => void | Promise<void>;
type Listener<T> = (event: T) => void | Promise<void>;
type RegisteredListener = (payload: unknown) => void | Promise<void>;

export interface EventBus {
	on<K extends EventKey>(type: K, handler: Listener<BusEventMap[K]>): () => void;
	on<K extends EventKey>(types: readonly K[], handler: Listener<BusEventMap[K]>): () => void;
	on(type: "*", handler: WildcardListener): () => void;
	emit<K extends EventKey>(type: K, payload: BusEventMap[K]): void;
	listenerCount(type: EventKey | "*"): number;
}

export function createEventBus(log: Logger): EventBus {
	const listeners = new Map<string, Set<RegisteredListener>>();

	const addListener = (type: string, handler: RegisteredListener): (() => void) => {
		const bucket = listeners.get(type) ?? new Set<RegisteredListener>();
		bucket.add(handler);
		listeners.set(type, bucket);

		if (bucket.size > 50) {
			log.warn("event bus listener threshold exceeded", { type, listeners: bucket.size });
		}

		return () => {
			const current = listeners.get(type);
			if (!current) {
				return;
			}

			current.delete(handler);
			if (current.size === 0) {
				listeners.delete(type);
			}
		};
	};

	const dispatch = (handler: RegisteredListener, payload: unknown, type: string) => {
		void Promise.resolve()
			.then(() => handler(payload))
			.catch((error: unknown) => {
				log.error("event bus handler failed", {
					type,
					error: error instanceof Error ? error.message : String(error),
				});
			});
	};

	const on: EventBus["on"] = ((
		typeOrTypes: EventKey | readonly EventKey[] | "*",
		handler: unknown,
	) => {
		const registered = handler as RegisteredListener;

		if (typeOrTypes === "*") {
			return addListener("*", registered);
		}

		if (Array.isArray(typeOrTypes)) {
			const unsubscribers = typeOrTypes.map((type) => addListener(type, registered));
			return () => {
				for (const unsubscribe of unsubscribers) {
					unsubscribe();
				}
			};
		}

		return addListener(typeOrTypes as EventKey, registered);
	}) as EventBus["on"];

	return {
		on,
		emit<K extends EventKey>(type: K, payload: BusEventMap[K]): void {
			const exact = listeners.get(type);
			if (exact) {
				for (const handler of exact) {
					dispatch(handler, payload, type);
				}
			}

			const wildcard = listeners.get("*");
			if (wildcard) {
				for (const handler of wildcard) {
					dispatch(handler, { type, payload }, "*");
				}
			}
		},
		listenerCount(type: EventKey | "*"): number {
			return listeners.get(type)?.size ?? 0;
		},
	};
}

export const captureEventTypes: readonly EventType[] = [
	"shell.command.executed",
	"shell.command.started",
	"git.commit.created",
	"note.created",
	"fact.extracted",
	"conversation.message",
];
