import type { ComponentPropsWithoutRef } from 'react';
import { forwardRef } from 'react';
import type {
  LocalPdfPreviewUrlString,
  SafeDownloadUrlString,
} from './downloadUrlSafety';

type SafePdfIframeSrc = LocalPdfPreviewUrlString | SafeDownloadUrlString;

type SafePdfIframeProps = Omit<
  ComponentPropsWithoutRef<'iframe'>,
  'referrerPolicy' | 'sandbox' | 'src'
> & {
  src: SafePdfIframeSrc;
  title: string;
};

export const SafePdfIframe = forwardRef<HTMLIFrameElement, SafePdfIframeProps>(
  function SafePdfIframe(props, ref) {
    const { src, title, ...iframeProps } = props;

    // The PDF source is cross-origin object storage in deployed environments.
    // iframe sandbox has no origin allowlist; trust is enforced by validating
    // the URL before rendering.
    return (
      <iframe
        {...iframeProps}
        ref={ref}
        src={src}
        title={title}
        referrerPolicy="no-referrer"
      />
    );
  },
);
