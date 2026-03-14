import type { Fact, StoredEvent } from "./entities";
import type { BodhiEvent, EventType } from "./events";

export interface CaptureSource {
	name: string;
	eventTypes: readonly EventType[];
	start(): Promise<void>;
	stop(): Promise<void>;
}

export type Transform = (event: BodhiEvent) => BodhiEvent | null;

export interface ExtractedFact {
	key: string;
	value: string;
	confidence: number;
	source_event_id: string;
	supersedes_fact_id?: string;
}

export interface IntelProvider {
	name: string;
	extract(event: StoredEvent): Promise<ExtractedFact[]>;
}

export type FactExtractionCallback = (fact: Fact) => void | Promise<void>;
