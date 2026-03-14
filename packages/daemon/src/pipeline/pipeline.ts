import type { BodhiEvent, PipelineConfig, Transform } from "@bodhi/types";

import { createEnrichTransform, type EnrichTransformOptions } from "./transforms/enrich";
import { createRedactTransform, type RedactTransformOptions } from "./transforms/redact";
import { createValidateTransform } from "./transforms/validate";

export interface PipelineOptions {
	config?: Partial<PipelineConfig>;
	enrich?: EnrichTransformOptions;
	redact?: RedactTransformOptions;
	transforms?: Transform[];
}

export class Pipeline {
	private readonly transforms: readonly Transform[];

	constructor(options: PipelineOptions = {}) {
		this.transforms = options.transforms ?? [
			createValidateTransform(),
			createRedactTransform(options.redact),
			createEnrichTransform(options.enrich),
		];
	}

	process(event: BodhiEvent): BodhiEvent | null {
		let current: BodhiEvent | null = event;

		for (const transform of this.transforms) {
			if (!current) {
				return null;
			}

			current = transform(current);
		}

		return current;
	}
}

export function createPipeline(options: PipelineOptions = {}): Pipeline {
	return new Pipeline(options);
}
