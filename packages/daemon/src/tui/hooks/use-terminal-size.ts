import { useStdout } from "ink";
import { useEffect, useState } from "react";

export function useTerminalSize(): { columns: number; rows: number } {
	const { stdout } = useStdout();
	const [size, setSize] = useState({
		columns: stdout.columns ?? 80,
		rows: stdout.rows ?? 24,
	});

	useEffect(() => {
		const update = () => {
			setSize({
				columns: stdout.columns ?? 80,
				rows: stdout.rows ?? 24,
			});
		};
		stdout.on("resize", update);
		return () => {
			stdout.off("resize", update);
		};
	}, [stdout]);

	return size;
}
