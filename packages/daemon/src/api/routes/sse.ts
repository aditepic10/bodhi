export interface SseController<T> {
	close(): void;
	enqueue(chunk: T): void;
}

export interface SseWriter<T> {
	close(): void;
	enqueue(chunk: T): void;
	isClosed(): boolean;
}

export function createSseWriter<T>(controller: SseController<T>): SseWriter<T> {
	let closed = false;

	return {
		close() {
			if (closed) {
				return;
			}

			closed = true;
			try {
				controller.close();
			} catch {
				// Ignore close races from aborted or timed-out streams.
			}
		},
		enqueue(chunk) {
			if (closed) {
				return;
			}

			try {
				controller.enqueue(chunk);
			} catch {
				closed = true;
			}
		},
		isClosed() {
			return closed;
		},
	};
}
