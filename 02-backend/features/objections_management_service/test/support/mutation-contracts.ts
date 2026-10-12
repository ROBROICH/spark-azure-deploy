import {type Static, Type as T, type TSchema} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

const Uuid = T.String({
	pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const Timestamp = T.String({
	pattern:
		"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z$",
});
const NullableString = T.Union([T.String(), T.Null()]);
const NullableUuid = T.Union([Uuid, T.Null()]);
const NullableInteger = T.Union([T.Integer(), T.Null()]);
const NullableNumber = T.Union([T.Number(), T.Null()]);
const UpdateType = T.Union([
	T.Literal("automated"),
	T.Literal("manual"),
	T.Null(),
]);

export const ArgumentExtractionResponseSchema = T.Object(
	{
		results: T.Array(
			T.Object(
				{
					documentId: Uuid,
					beteiligungsEingangId: Uuid,
					arguments: T.Array(
						T.Object({ argumentId: Uuid }, { additionalProperties: false }),
					),
					skipped: T.Boolean(),
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);

export const CountResponseSchema = T.Object(
	{ updatedCount: T.Integer({ minimum: 0 }) },
	{ additionalProperties: false },
);

const CommonNode = {
	id: Uuid,
	projectId: Uuid,
	projectVersion: T.Integer({ minimum: 1 }),
	createdAt: Timestamp,
	updatedAt: Timestamp,
	isDeleted: T.Boolean(),
	isOutdated: T.Boolean(),
	frontendParentIds: T.Array(T.String()),
	updateType: UpdateType,
};

const BeteiligungsEingangNode = T.Object(
	{
		nodeType: T.Literal("beteiligungs_eingang"),
		beteiligungTyp: T.Union([
			T.Literal("stellungnahme"),
			T.Literal("naturschutz"),
			T.Literal("einwendung"),
			T.Null(),
		]),
		fileId: Uuid,
		filename: NullableString,
		markdownId: NullableUuid,
		extractionStatus: T.Union([
			T.Literal("success"),
			T.Literal("loading"),
			T.Literal("failed"),
			T.Literal("prompt_injection_error"),
		]),
		classificationStatus: T.Union([
			T.Literal("loading"),
			T.Literal("done"),
			T.Literal("failed"),
		]),
		...CommonNode,
	},
	{ additionalProperties: false },
);

const MarkdownNode = T.Object(
	{
		nodeType: T.Literal("beteiligungs_eingang_markdown"),
		beteiligungsEingangId: Uuid,
		text: T.String(),
		...CommonNode,
	},
	{ additionalProperties: false },
);

const ArgumentNode = T.Object(
	{
		nodeType: T.Literal("argument"),
		beteiligungsEingangId: Uuid,
		subTopicId: NullableUuid,
		topicId: NullableUuid,
		topicConfidence: NullableNumber,
		subTopicConfidence: NullableNumber,
		status: T.Union([
			T.Literal("open"),
			T.Literal("subtopic_reviewed"),
			T.Literal("done"),
		]),
		text: NullableString,
		startIdx: NullableInteger,
		endIdx: NullableInteger,
		erwiderung: NullableString,
		einordnung: NullableString,
		context: NullableString,
		contextStartIdx: NullableInteger,
		contextEndIdx: NullableInteger,
		argumentId: NullableString,
		inVae: T.Boolean(),
		isValidArgument: T.Boolean(),
		...CommonNode,
	},
	{ additionalProperties: false },
);

const Node = T.Union([BeteiligungsEingangNode, MarkdownNode, ArgumentNode]);

export const NodeMutationResponseSchema = T.Object(
	{
		inserted: T.Array(Node),
		updated: T.Array(Node),
		deleted: T.Array(
			T.Object(
				{ nodeType: T.String(), id: Uuid },
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);

export function parseMutationContract<Schema extends TSchema>(
	schema: Schema,
	value: HttpJson,
): Static<Schema> {
	return Value.Parse(schema, value);
}
