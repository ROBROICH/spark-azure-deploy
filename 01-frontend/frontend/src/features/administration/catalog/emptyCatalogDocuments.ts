import type {
  BeschlussDocument,
  DokumenteDocument,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';

export const EMPTY_GESETZESGRUNDLAGE: GesetzesgrundlageDocument = {
  topics: [],
  stateNormGroups: {},
  topicStateGroups: {},
};

export const EMPTY_DOKUMENTE: DokumenteDocument = {
  categories: [],
};

/**
 * Builds the minimum gültiger Beschluss tree required by the catalog write
 * contract: one visible root node so create is not rejected as empty.
 *
 * @returns A Beschluss document with a single root node.
 */
export const createInitialBeschlussDocument = (): BeschlussDocument => ({
  nodes: [
    {
      id: crypto.randomUUID(),
      parent_vae_node_id: null,
      title: 'Beschluss',
      text: '',
      topic: null,
      order: 0,
      is_hidden: false,
      can_add_child: true,
    },
  ],
});
