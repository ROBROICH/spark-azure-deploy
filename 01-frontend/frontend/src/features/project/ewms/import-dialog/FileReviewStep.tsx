import { Button } from '@/features/ui/button/Button';
import { DialogBody, DialogFooter } from '@/features/ui/dialog/Dialog';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
} from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getEwmsPathDisplayName } from '../data/ewms.nodes';
import type {
  EwmsFailedFileReviewResult,
  EwmsFileReviewResult,
} from './ewmsFileReviewResult';
import type { FailureReason } from './ewmsFailureReason';
import { getFailureReason } from './ewmsFailureReason';
import { EwmsFailureReasonBadge } from './EwmsFailureReasonBadge';

type ReviewSuccessfulFile = {
  id: string;
  name: string;
  size?: string;
};

type ReviewFailedFile = {
  id: string;
  name: string;
  size?: string;
  failureReason: FailureReason;
};

type ReviewFiles = {
  successful: ReviewSuccessfulFile[];
  failed: ReviewFailedFile[];
};

const formatReviewFileSize = (size: number | string | undefined) => {
  if (typeof size === 'string') {
    return size;
  }

  if (typeof size !== 'number') {
    return undefined;
  }

  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
};

const getReviewFileSize = (
  file: Pick<EwmsFailedFileReviewResult, 'file_size' | 'fileSize' | 'size'>,
) => formatReviewFileSize(file.file_size ?? file.fileSize ?? file.size);

const getReviewFiles = (
  fileReview: EwmsFileReviewResult | null,
): ReviewFiles => {
  if (!fileReview) {
    return {
      failed: [],
      successful: [],
    };
  }

  const successfulFiles = fileReview.successful.map((file) => ({
    id: `${file.file_id}:success`,
    name: getEwmsPathDisplayName(file.filename),
    size: getReviewFileSize(file),
  }));
  const failedFiles = fileReview.failed.map((file) => ({
    id: `${file.file_id ?? file.filename}:error`,
    name: getEwmsPathDisplayName(file.filename),
    size: getReviewFileSize(file),
    failureReason: getFailureReason(file),
  }));

  return {
    failed: failedFiles,
    successful: successfulFiles,
  };
};

type ReviewSectionProps = {
  title: string;
  icon: ElementType;
  iconClassName: string;
  children: ReactNode;
};

const ReviewSection = (props: ReviewSectionProps) => {
  const { title, icon: Icon, iconClassName, children } = props;

  return (
    <details className="group" open>
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded py-1 text-[11px] leading-[14px] text-text-secondary [&::-webkit-details-marker]:hidden">
        <Icon className={iconClassName} aria-hidden />
        <span className="flex-1">{title}</span>
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
};

type FailedReviewListProps = {
  files: ReviewFailedFile[];
};

const FailedReviewList = (props: FailedReviewListProps) => {
  const { files } = props;
  const { t } = useTranslation('Ewms');

  if (files.length === 0) {
    return null;
  }

  return (
    <ReviewSection
      title={t('fileReviewPage.failedSection')}
      icon={AlertCircle}
      iconClassName="size-3.5 shrink-0 text-text-secondary"
    >
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li
            key={file.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 text-text-error"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="truncate text-[13px] leading-[18px]">
              {file.name}
            </span>
            {file.size ? (
              <span className="text-[11px] leading-[14px] whitespace-nowrap text-text-error">
                {file.size}
              </span>
            ) : null}
            <EwmsFailureReasonBadge
              tooltip={
                file.failureReason.tooltipKey
                  ? t(file.failureReason.tooltipKey)
                  : undefined
              }
            >
              {file.failureReason.labelKey
                ? t(file.failureReason.labelKey)
                : file.failureReason.fallback}
            </EwmsFailureReasonBadge>
          </li>
        ))}
      </ul>
    </ReviewSection>
  );
};

type SuccessfulReviewListProps = {
  files: ReviewSuccessfulFile[];
};

const SuccessfulReviewList = (props: SuccessfulReviewListProps) => {
  const { files } = props;
  const { t } = useTranslation('Ewms');

  if (files.length === 0) {
    return null;
  }

  return (
    <ReviewSection
      title={t('fileReviewPage.successfulSection')}
      icon={CheckCircle}
      iconClassName="size-3.5 shrink-0 text-text-secondary"
    >
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li
            key={file.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-text-success"
          >
            <CheckCircle className="size-4 shrink-0" aria-hidden />
            <span className="truncate text-[13px] leading-[18px]">
              {file.name}
            </span>
            {file.size ? (
              <span className="text-[11px] leading-[14px] whitespace-nowrap">
                {file.size}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </ReviewSection>
  );
};

type FileReviewStepProps = {
  fileReview: EwmsFileReviewResult | null;
  onClose: () => void;
};

export const FileReviewStep = (props: FileReviewStepProps) => {
  const { fileReview, onClose } = props;
  const { t } = useTranslation('Ewms');
  const reviewFiles = getReviewFiles(fileReview);
  const hasReviewFiles =
    reviewFiles.failed.length > 0 || reviewFiles.successful.length > 0;

  return (
    <>
      <DialogBody className="flex max-h-[520px] flex-col gap-5 overflow-y-auto px-5 py-5">
        {!hasReviewFiles ? (
          <div className="rounded-md border border-border-primary px-3 py-2 text-[13px] leading-[18px] text-text-secondary">
            {t('fileReviewPage.empty')}
          </div>
        ) : (
          <>
            <FailedReviewList files={reviewFiles.failed} />
            <SuccessfulReviewList files={reviewFiles.successful} />
          </>
        )}
      </DialogBody>

      <DialogFooter className="items-start sm:items-center">
        <div className="flex-1" />
        <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
          <Button variant="primary" size="sm" onClick={onClose}>
            {t('fileReviewPage.close')}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
};
