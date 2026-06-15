import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DynamicAsset } from './DynamicAsset';

const stubReducedMotionPreference = (matches: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const createHeadResponse = (props: { contentType: string; status?: number }) =>
  new Response(null, {
    status: props.status ?? 200,
    headers: {
      'content-type': props.contentType,
    },
  });

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('DynamicAsset', () => {
  it('renders the PNG without probing when reduced motion is preferred', () => {
    const fetchMock = vi.fn<typeof fetch>();
    stubReducedMotionPreference(true);
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <DynamicAsset name="owl-404" className="test-media" />,
    );

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', '/owl-404.png');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('aria-hidden', 'true');
    expect(image).toHaveClass('test-media');
    expect(container.querySelector('video')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the MP4 after the HEAD probe confirms a video response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createHeadResponse({ contentType: 'video/mp4' }));
    stubReducedMotionPreference(false);
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<DynamicAsset name="owl-error" />);

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/owl-error.png',
    );

    await waitFor(() => {
      expect(container.querySelector('video')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/videos/owl-error.mp4',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(container.querySelector('source')).toHaveAttribute(
      'src',
      '/videos/owl-error.mp4',
    );
  });

  it('keeps the PNG when the MP4 probe returns a missing response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createHeadResponse({
        contentType: 'text/html',
        status: 404,
      }),
    );
    stubReducedMotionPreference(false);
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<DynamicAsset name="owl-404" />);

    await waitFor(() => {
      expect(window.localStorage.length).toBe(1);
    });

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/owl-404.png',
    );
    expect(container.querySelector('video')).toBeNull();
  });

  it('keeps the PNG when the MP4 probe rejects', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('not found'));
    stubReducedMotionPreference(false);
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<DynamicAsset name="owl-404" />);

    await waitFor(() => {
      expect(window.localStorage.length).toBe(1);
    });

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/owl-404.png',
    );
    expect(container.querySelector('video')).toBeNull();
  });

  it('keeps the PNG when a successful probe returns an HTML fallback', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createHeadResponse({ contentType: 'text/html' }));
    stubReducedMotionPreference(false);
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<DynamicAsset name="owl-error" />);

    await waitFor(() => {
      expect(window.localStorage.length).toBe(1);
    });

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/owl-error.png',
    );
    expect(container.querySelector('video')).toBeNull();
  });

  it('uses cached reachable results without probing again', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createHeadResponse({
        contentType: 'application/octet-stream',
      }),
    );
    stubReducedMotionPreference(false);
    vi.stubGlobal('fetch', fetchMock);

    const firstRender = render(<DynamicAsset name="owl-404" />);

    await waitFor(() => {
      expect(firstRender.container.querySelector('video')).toBeInTheDocument();
    });

    firstRender.unmount();
    fetchMock.mockClear();

    const secondRender = render(<DynamicAsset name="owl-404" />);

    expect(secondRender.container.querySelector('video')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses cached missing results without probing again', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createHeadResponse({
        contentType: 'text/html',
        status: 404,
      }),
    );
    stubReducedMotionPreference(false);
    vi.stubGlobal('fetch', fetchMock);

    const firstRender = render(<DynamicAsset name="owl-error" />);

    await waitFor(() => {
      expect(window.localStorage.length).toBe(1);
    });

    firstRender.unmount();
    fetchMock.mockClear();

    const secondRender = render(<DynamicAsset name="owl-error" />);

    expect(secondRender.container.querySelector('img')).toHaveAttribute(
      'src',
      '/owl-error.png',
    );
    expect(secondRender.container.querySelector('video')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the PNG when the video element errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createHeadResponse({ contentType: 'video/mp4' }));
    stubReducedMotionPreference(false);
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<DynamicAsset name="owl-404" />);

    await waitFor(() => {
      expect(container.querySelector('video')).toBeInTheDocument();
    });

    const video = container.querySelector('video');
    if (!video) {
      throw new Error('Expected the dynamic asset video to render.');
    }

    fireEvent.error(video);

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/owl-404.png',
    );
    expect(container.querySelector('video')).toBeNull();
  });
});
