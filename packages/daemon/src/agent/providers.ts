import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { BodhiConfig } from "@bodhi/types";
import type { LanguageModel } from "ai";

function getStubLanguageModel(): LanguageModel | null {
	const model = Reflect.get(globalThis, "__bodhiStubLanguageModel");
	return model ? (model as LanguageModel) : null;
}

export function hasConfiguredLanguageModel(config: BodhiConfig): boolean {
	if (getStubLanguageModel()) {
		return true;
	}

	if (config.intel.model.provider === "openai") {
		return Boolean(process.env.OPENAI_API_KEY);
	}

	return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function resolveLanguageModel(config: BodhiConfig): LanguageModel | null {
	const stubModel = getStubLanguageModel();
	if (stubModel) {
		return stubModel;
	}

	if (config.intel.model.provider === "openai") {
		if (!process.env.OPENAI_API_KEY) {
			return null;
		}

		return openai(config.intel.model.model);
	}

	if (!process.env.ANTHROPIC_API_KEY) {
		return null;
	}

	return anthropic(config.intel.model.model as Parameters<typeof anthropic>[0]);
}
