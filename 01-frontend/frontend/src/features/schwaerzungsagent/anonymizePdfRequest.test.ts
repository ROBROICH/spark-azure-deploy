import { v1AgentOrchestrationAnonymizePdf as anonymizePdf } from '@/api-clients/backend';
import { describe, expect, it } from 'vitest';

const requestId = '00000000-0000-4000-8000-000000000000';

const captureRequests = () => {
  const requests: Request[] = [];

  const fetch: typeof globalThis.fetch = (input) => {
    if (!(input instanceof Request)) {
      throw new TypeError('expected the client to pass a Request');
    }

    requests.push(input.clone());

    return Promise.resolve(
      new Response(new Blob(['%PDF-1.4']), {
        headers: { 'Content-Type': 'application/pdf' },
        status: 200,
      }),
    );
  };

  return { fetch, requests };
};

describe('anonymisierung request contract', () => {
  it('uploads the PDF as multipart/form-data', async () => {
    const { fetch, requests } = captureRequests();
    const file = new File(['%PDF-1.4'], 'input.pdf', {
      type: 'application/pdf',
    });

    await anonymizePdf({
      baseUrl: 'http://localhost',
      body: { file, requestId },
      fetch,
      parseAs: 'blob',
      throwOnError: true,
    });

    expect(requests).toHaveLength(1);

    const [request] = requests;
    if (request === undefined) {
      throw new Error('expected one captured request');
    }

    expect(request.headers.get('content-type')).toMatch(
      /^multipart\/form-data; boundary=/,
    );

    // request.formData() cannot rebuild a jsdom File under undici, so assert
    // on the encoded body instead.
    const body = await request.text();
    expect(body).toContain('name="requestId"');
    expect(body).toContain(requestId);
    expect(body).toContain('name="file"');
    expect(body).toContain('Content-Type: application/pdf');
  });
});
