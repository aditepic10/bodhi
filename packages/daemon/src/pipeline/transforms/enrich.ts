import type { BodhiEvent, Transform } from "@bodhi/types";

export interface EnrichTransformOptions {
	machineId?: string;
}

export function createEnrichTransform(options: EnrichTransformOptions = {}): Transform {
	const machineId = options.machineId ?? "local-machine";

	return (event: BodhiEvent) => {
		return {
			...event,
			machine_id: event.machine_id ?? machineId,
			session_id: event.session_id ?? event.event_id,
			schema_version: event.schema_version ?? 1,
			created_at:
				typeof event.created_at === "number" ? Math.floor(event.created_at) : event.created_at,
		};
	};
}
