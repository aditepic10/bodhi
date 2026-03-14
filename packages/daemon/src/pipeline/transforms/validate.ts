import { type BodhiEvent, BodhiEventSchema, type Transform } from "@bodhi/types";

export function createValidateTransform(): Transform {
	return (event: BodhiEvent) => {
		const result = BodhiEventSchema.safeParse(event);
		if (!result.success) {
			return null;
		}

		return result.data;
	};
}
