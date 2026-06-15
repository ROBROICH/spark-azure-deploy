import type {
  GetPendingPendingUpdatesGetResponse,
  UpdateResponseFull,
} from '@/api-clients/law-changes-module';

export type DetailedLawChangeApiResponse = UpdateResponseFull;

export type PendingLawChangeApiResponse =
  GetPendingPendingUpdatesGetResponse[number];

export type LawChangeRecord = {
  id: string;
  jurabk: string;
  paragraphNr: string;
  currentText: string;
  changeText: string;
  newText: string;
  transitionalNote: string;
  validFrom: string;
};

export type LawChangeNormRef = {
  jurabk: string;
  paragraphNr: string | null | undefined;
};

export type AggregatedLawChangeNormRef = LawChangeNormRef;
