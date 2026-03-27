#!/usr/bin/env python3
"""Entrypoint script for LiteLLM with environment variable substitution"""

import os
import re
import sys


def process_config():
    """Replace ${VAR_NAME} placeholders with environment variables"""
    config_source = "/app/config.yaml"
    config_output = "/app/config_processed.yaml"

    try:
        with open(config_source, encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: Config file {config_source} not found", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading config file: {e}", file=sys.stderr)
        sys.exit(1)

    # Replace ${VAR_NAME} with environment variables
    def replace_var(match):
        var_name = match.group(1)
        value = os.environ.get(var_name)
        if value is None:
            print(f"Warning: Environment variable {var_name} not set", file=sys.stderr)
            return match.group(0)
        return value

    content = re.sub(r"\$\{([^}]+)\}", replace_var, content)

    # Write processed config to writable file
    try:
        with open(config_output, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"Error writing processed config: {e}", file=sys.stderr)
        sys.exit(1)

    return config_output


if __name__ == "__main__":
    processed_config = process_config()
    # Start LiteLLM with processed config
    os.execvp(
        "litellm",
        [
            "litellm",
            "--config",
            processed_config,
            "--port",
            "4000",
            "--host",
            "0.0.0.0",
        ],
    )
