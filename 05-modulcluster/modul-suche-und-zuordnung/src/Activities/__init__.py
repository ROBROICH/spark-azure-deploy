"""
Temporal Activities for modul-suche-und-zuordnung.

This package contains all activity definitions for the module.
Activities are non-deterministic operations that are retried by Temporal:
- LLM calls
- Database operations
- File system access
- Network Requests (HTTP calls, API calls)

Each activity follows the pattern:
- @activity.defn decorated function with underscore prefix (_activity_name)
- Wrapper function without underscore (activity_name) that handles Temporal invocation
"""
