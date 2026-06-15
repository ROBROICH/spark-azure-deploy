type ComparisonTableDocumentButtonProps = {
  documentName: string;
  onOpen: () => void;
};

export function ComparisonTableDocumentButton(
  props: ComparisonTableDocumentButtonProps,
) {
  const { documentName, onOpen } = props;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring inline-flex max-w-full min-w-0 cursor-pointer rounded text-left text-[13px] leading-[18px] font-medium tracking-[-0.01em] whitespace-normal text-brand-950 hover:underline"
    >
      <span className="min-w-0 [overflow-wrap:anywhere] break-words">
        {documentName}
      </span>
    </button>
  );
}
