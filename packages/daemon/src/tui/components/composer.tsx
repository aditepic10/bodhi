import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import { useCallback, useEffect, useRef } from "react";
import type { TuiTheme } from "../theme";

// Key name is "return" not "enter" — defaultKeyAliases maps enter→return.
// Enter submits, Shift+Enter and Meta+Enter insert newlines.
const composerKeyBindings: KeyBinding[] = [
	{ name: "return", action: "submit" },
	{ name: "return", shift: true, action: "newline" },
	{ name: "return", meta: true, action: "newline" },
];

export interface ComposerRef {
	clear: () => void;
	getText: () => string;
}

export function Composer(props: {
	focused: boolean;
	onSubmit: (text: string) => void;
	streaming: boolean;
	theme: TuiTheme;
}) {
	const textareaRef = useRef<TextareaRenderable>(null);
	const onSubmitRef = useRef(props.onSubmit);
	onSubmitRef.current = props.onSubmit;

	const handleSubmit = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		const text = textarea.getTextRange(0, 999999).trim();
		if (!text) return;
		textarea.clear();
		onSubmitRef.current(text);
	}, []);

	// Wire onSubmit imperatively — React reconciler doesn't forward it for textarea.
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.onSubmit = handleSubmit;
		}
	}, [handleSubmit]);

	return (
		<box
			width="100%"
			flexShrink={0}
			borderStyle="rounded"
			borderColor={
				props.streaming
					? props.theme.statusStreaming
					: props.focused
						? props.theme.accent
						: props.theme.border
			}
			backgroundColor={props.theme.panel}
		>
			<textarea
				ref={textareaRef}
				focused={props.focused}
				width="100%"
				wrapMode="word"
				placeholder="Ask anything…"
				placeholderColor={props.theme.dim}
				textColor={props.theme.text}
				backgroundColor={props.theme.panel}
				focusedBackgroundColor={props.theme.panel}
				focusedTextColor={props.theme.text}
				keyBindings={composerKeyBindings}
			/>
		</box>
	);
}

/** Read text from a textarea ref without going through state. */
export function getComposerText(ref: React.RefObject<TextareaRenderable | null>): string {
	return ref.current?.getTextRange(0, 999999) ?? "";
}
