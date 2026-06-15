import type { NodePayloadByType } from '@/db/nodes/types';
import type { BeteiligungTyp } from '@/api-clients/oms-module';
import { isEwmsUnassignedSubtopicSelection } from './ewmsSubtopicSelection';

export type ObjectionsFilter = BeteiligungTyp[] | undefined;
export type EwmsBeteiligungsEingang = NodePayloadByType<'beteiligungs_eingang'>;
export type EwmsArgumentNode = NodePayloadByType<'argument'>;
export type EwmsTopicNode = NodePayloadByType<'topic'>;
export type EwmsClassificationState = 'loading' | 'done' | 'failed';
export type EwmsArgumentStatus = EwmsArgumentNode['status'];
export const EWMS_OBJECTION_SORT_VALUES = [
  'nameAsc',
  'nameDesc',
  'createdAtDesc',
  'createdAtAsc',
] as const;
export const DEFAULT_EWMS_OBJECTION_SORT = 'nameAsc';
export type EwmsObjectionSort = (typeof EWMS_OBJECTION_SORT_VALUES)[number];
export type EwmsObjectionListItem = {
  entry: EwmsBeteiligungsEingang;
};

export const isEwmsVisibleTopic = (topic: EwmsTopicNode) =>
  topic.show_in_ewm !== false;

export const EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED =
  'subtopic_reviewed' satisfies EwmsArgumentStatus;

export const normalizeEwmsArgumentStatus = (
  status: string | null | undefined,
): EwmsArgumentStatus => {
  if (status === EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED) {
    return EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED;
  }

  if (
    status?.toLowerCase() === 'subtopicreviewed' ||
    status?.toLowerCase() === 'subtopic_reviewed'
  ) {
    return EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED;
  }

  if (status === 'done') {
    return 'done';
  }

  return 'open';
};

export const isEwmsArgumentApproved = (argument: EwmsArgumentNode) =>
  normalizeEwmsArgumentStatus(argument.status) === 'done';

export const isEwmsArgumentTopicReviewOpen = (argument: EwmsArgumentNode) =>
  normalizeEwmsArgumentStatus(argument.status) === 'open';

export const matchesBeteiligungsEingangFilter = (
  entry: EwmsBeteiligungsEingang,
  filter: ObjectionsFilter,
) => {
  if (!filter || filter.length === 0) {
    return true;
  }

  return entry.beteiligung_typ ? filter.includes(entry.beteiligung_typ) : false;
};

export const groupArgumentsByBeteiligungsEingangId = (
  argumentsList: EwmsArgumentNode[],
) => {
  const grouped = new Map<string, EwmsArgumentNode[]>();

  for (const argument of argumentsList) {
    const existing = grouped.get(argument.beteiligungs_eingang_id) ?? [];
    grouped.set(argument.beteiligungs_eingang_id, [...existing, argument]);
  }

  return grouped;
};

export const resolveEwmsClassificationState = (
  item: EwmsObjectionListItem | undefined,
): EwmsClassificationState => {
  const status = item?.entry.classification_status;

  if (status === 'done' || status === 'failed') {
    return status;
  }

  return 'loading';
};

export const findEwmsObjectionItemBySelection = (
  items: EwmsObjectionListItem[],
  selectedId: string | undefined,
) =>
  selectedId
    ? items.find(
        (item) =>
          item.entry.id === selectedId || item.entry.file_id === selectedId,
      )
    : undefined;

export const matchesEwmsObjectionItemFilter = (
  item: EwmsObjectionListItem,
  filter: ObjectionsFilter,
) => {
  if (!filter || filter.length === 0) {
    return true;
  }

  return matchesBeteiligungsEingangFilter(item.entry, filter);
};

export const getEwmsTopicIdForArgument = (argument: EwmsArgumentNode) =>
  argument.topic_id;

export const getEwmsSubtopicIdForArgument = (argument: EwmsArgumentNode) =>
  argument.sub_topic_id;

export const groupArgumentsByTopicId = (argumentsList: EwmsArgumentNode[]) => {
  const grouped = new Map<string, EwmsArgumentNode[]>();

  for (const argument of argumentsList) {
    const topicId = getEwmsTopicIdForArgument(argument);

    if (!topicId) {
      continue;
    }

    const existing = grouped.get(topicId) ?? [];
    grouped.set(topicId, [...existing, argument]);
  }

  return grouped;
};

export const getEwmsArgumentsForTopicSelection = (
  argumentsByTopicId: Map<string, EwmsArgumentNode[]>,
  selectedTopicId: string | undefined,
  selectedSubtopicId: string | undefined,
) => {
  if (!selectedTopicId) {
    return [];
  }

  const topicArguments = argumentsByTopicId.get(selectedTopicId) ?? [];

  if (!selectedSubtopicId) {
    return topicArguments;
  }

  if (isEwmsUnassignedSubtopicSelection(selectedSubtopicId)) {
    return topicArguments.filter((argument) => !argument.sub_topic_id);
  }

  return topicArguments.filter(
    (argument) => argument.sub_topic_id === selectedSubtopicId,
  );
};

export const resolveEwmsReferenceId = (argument: EwmsArgumentNode) =>
  argument.argument_id ?? argument.id;

const EWMS_ARGUMENT_COMPARE_OPTIONS = {
  numeric: true,
  sensitivity: 'base',
} satisfies Intl.CollatorOptions;

const compareEwmsArguments = (
  left: EwmsArgumentNode,
  right: EwmsArgumentNode,
) =>
  resolveEwmsReferenceId(left).localeCompare(
    resolveEwmsReferenceId(right),
    'de',
    EWMS_ARGUMENT_COMPARE_OPTIONS,
  ) || left.id.localeCompare(right.id, 'de', EWMS_ARGUMENT_COMPARE_OPTIONS);

export const sortEwmsArguments = (argumentsList: EwmsArgumentNode[]) =>
  [...argumentsList].sort(compareEwmsArguments);

export const getEwmsPathDisplayName = (value: string) => {
  const filename = value.trim();
  const pathParts = filename.split('/').filter(Boolean);

  return pathParts.at(-1) ?? filename;
};

export const getEwmsObjectionDisplayName = (item: EwmsObjectionListItem) => {
  if (item.entry.filename?.trim()) {
    return getEwmsPathDisplayName(item.entry.filename);
  }

  return item.entry.file_id;
};

const getEwmsObjectionFilename = (item: EwmsObjectionListItem) => {
  if (item.entry.filename?.trim()) {
    return getEwmsPathDisplayName(item.entry.filename);
  }

  return '';
};

export const matchesEwmsObjectionFilenameSearch = (
  item: EwmsObjectionListItem,
  search: string | undefined,
) => {
  const normalizedSearch = search?.trim().toLocaleLowerCase('de');

  if (!normalizedSearch) {
    return true;
  }

  return getEwmsObjectionFilename(item)
    .toLocaleLowerCase('de')
    .includes(normalizedSearch);
};

const compareEwmsObjectionDisplayNames = (
  left: EwmsObjectionListItem,
  right: EwmsObjectionListItem,
) =>
  getEwmsObjectionDisplayName(left).localeCompare(
    getEwmsObjectionDisplayName(right),
    'de',
    EWMS_ARGUMENT_COMPARE_OPTIONS,
  ) || left.entry.id.localeCompare(right.entry.id, 'de');

const getSortableCreatedAt = (item: EwmsObjectionListItem) => {
  const timestamp = Date.parse(item.entry.created_at);

  return Number.isNaN(timestamp) ? null : timestamp;
};

const compareEwmsObjectionCreatedAt = (
  left: EwmsObjectionListItem,
  right: EwmsObjectionListItem,
  direction: 'asc' | 'desc',
) => {
  const leftTimestamp = getSortableCreatedAt(left);
  const rightTimestamp = getSortableCreatedAt(right);

  if (leftTimestamp === null && rightTimestamp === null) {
    return compareEwmsObjectionDisplayNames(left, right);
  }

  if (leftTimestamp === null) {
    return 1;
  }

  if (rightTimestamp === null) {
    return -1;
  }

  const result = leftTimestamp - rightTimestamp;

  if (result === 0) {
    return compareEwmsObjectionDisplayNames(left, right);
  }

  return direction === 'asc' ? result : -result;
};

export const sortEwmsObjectionItems = (
  items: EwmsObjectionListItem[],
  sort: EwmsObjectionSort = DEFAULT_EWMS_OBJECTION_SORT,
) =>
  [...items].sort((left, right) => {
    if (sort === 'nameDesc') {
      return compareEwmsObjectionDisplayNames(right, left);
    }

    if (sort === 'createdAtDesc') {
      return compareEwmsObjectionCreatedAt(left, right, 'desc');
    }

    if (sort === 'createdAtAsc') {
      return compareEwmsObjectionCreatedAt(left, right, 'asc');
    }

    return compareEwmsObjectionDisplayNames(left, right);
  });
