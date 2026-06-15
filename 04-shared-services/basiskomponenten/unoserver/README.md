# Dienst Dokumentenkonvertierung (Document Conversion Service)

A containerized LibreOffice-backed service for converting office documents, such as DOCX and PPTX files, to PDF through the Unoserver client protocol.

## Core Features

- **Office document conversion:** Converts common office formats to PDF through LibreOffice.
- **Client-based access:** Accepts conversion requests from compatible `unoserver.client.UnoClient` or `unoconvert` clients.
- **Font coverage:** Includes a broad font set so converted documents preserve layout as closely as possible.
- **Configurable timeout:** Enforces a per-conversion timeout through `CONVERSION_TIMEOUT`.

## Architecture

### Overview

The service is packaged as a single container image. The entrypoint validates the timeout setting and starts Unoserver bound to `0.0.0.0` on port `2003`. LibreOffice performs the document conversion work; Unoserver exposes the remote conversion protocol used by callers.

The service does not expose an HTTP API. Consumers should use the matching Unoserver Python client or command-line client and route requests to the running container.

### Components

- **Container image:** Alpine-based image with LibreOffice, Unoserver, and the required fonts.
- **Entrypoint:** Validates `CONVERSION_TIMEOUT` and starts the conversion server.
- **Client integration:** Consuming services configure the server host and port, then call `UnoClient.convert(...)`.

### Dependencies

| Module / Service | Purpose |
|------------------|---------|
| [Unoserver](https://github.com/unoconv/unoserver) | Provides the Python client and remote conversion server. |
| [LibreOffice](https://www.libreoffice.org/) | Performs the actual office document conversion. |

### Data Models

The service does not persist application data. It converts input files to output files or bytes for the calling client.

## Project Structure

```
├── Dockerfile       # Image with LibreOffice, fonts, and Unoserver
└── entrypoint.sh    # Timeout validation and server startup
```

## Getting Started

### Prerequisites

- Docker for building and running the container locally
- A compatible Unoserver client in the consuming service
- Input files available to the client, either as bytes or mounted paths

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CONVERSION_TIMEOUT` | Per-conversion timeout in seconds. The value must be an integer. | `120` | no |

### Running the Module / Service

#### In Development

1. Build the image:

   ```bash
   docker build -t document-conversion-service .
   ```

2. Run the container and publish the Unoserver port:

   ```bash
   docker run -p 2003:2003 -v ./data:/data document-conversion-service
   ```

3. Override the conversion timeout when needed:

   ```bash
   docker run -p 2003:2003 -e CONVERSION_TIMEOUT=300 -v ./data:/data document-conversion-service
   ```

#### In Production

1. Deploy the image in an environment where only trusted services can reach port `2003`.

2. Set `CONVERSION_TIMEOUT` to a value that matches the expected document sizes and worker timeout budget.

3. Configure consuming services with the service host, port, and protocol expected by their Unoserver client.

## Usage

### Python Client

Consuming services should add a compatible `unoserver` client dependency and configure the conversion target:

```bash
UNO_HOST=localhost
UNO_PORT=2003
UNO_PROTOCOL=http
```

Then use `UnoClient` to convert files:

```python
import os

from unoserver.client import UnoClient

client = UnoClient(
    server=os.environ["UNO_HOST"],
    port=os.environ.get("UNO_PORT", "2003"),
    host_location="remote",
    protocol=os.environ.get("UNO_PROTOCOL", "http"),
)

pdf_bytes = client.convert(
    indata=input_bytes,
    outpath=None,
    convert_to="pdf",
)
```

### Command-Line Client

For local checks, `unoconvert` can connect to the running container:

```bash
unoconvert --host-location remote --host localhost --port 2003 input.docx output.pdf
```

## Additional Notes

- If conversions fail unexpectedly, verify that the client package version is compatible with the server image version.
- If the container exits immediately, check whether `CONVERSION_TIMEOUT` is set to a non-integer value.
- If clients cannot connect, confirm that port `2003` is reachable from the consuming service.
