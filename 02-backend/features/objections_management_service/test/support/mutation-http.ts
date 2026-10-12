import type {HttpJson} from "@spark-workflow/http-host";



export interface MutationJsonResponse {
	status: number;
	body: HttpJson;
}

function mutationBaseUrl(): URL {
	const value = process.env.OBJECTIONS_MUTATION_BASE_URL;
	if (value === undefined) {
		throw new Error(
			"OBJECTIONS_MUTATION_BASE_URL must point to the supervised Objections service",
		);
	}
	return new URL(value.endsWith("/") ? value : value + "/");
}

export async function mutateJson(
	path: string,
	init: RequestInit,
): Promise<MutationJsonResponse> {
	const response = await fetch(
		new URL(path.replace(/^\//, ""), mutationBaseUrl()),
		init,
	);
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().startsWith("application/json")) {
		throw new Error(
			(init.method ?? "GET") +
				" " +
				path +
				" returned " +
				response.status +
				" with non-JSON content-type '" +
				contentType +
				"'",
		);
	}
	return { status: response.status, body: (await response.json()) as HttpJson };
}

export function mutationRequest(
	method: "GET" | "POST" | "PATCH",
	body?: HttpJson,
	headers: Record<string, string> = {},
): RequestInit {
	if (body === undefined) return { method, headers };
	return {
		method,
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	};
}
