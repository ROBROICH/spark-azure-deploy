#!/bin/sh
set -eu

until temporal operator cluster health 2>/dev/null | grep -Eq '(^|[[:space:]])SERVING([[:space:]]|$)'; do
    echo "Waiting for Temporal at $TEMPORAL_ADDRESS..."
    sleep "$POLL_INTERVAL_SECONDS"
done

until temporal operator namespace describe --namespace default >/dev/null 2>&1; do
    if output=$(temporal operator namespace create --namespace default --retention "$NAMESPACE_RETENTION" 2>&1); then
        echo "Created default namespace."
    else
        printf 'Waiting to reconcile default namespace: %s\n' "$output"
    fi
    sleep "$POLL_INTERVAL_SECONDS"
done
echo "Default namespace is reachable."

ensure_attribute() {
    name=$1
    expected=$2
    while :; do
        if attributes=$(temporal operator search-attribute list --namespace default 2>&1); then
            actual=$(printf '%s\n' "$attributes" | awk -v name="$name" '$1 == name { print $2 }')
            if [ "$actual" = "$expected" ]; then
                echo "Search attribute $name ($expected) is ready."
                return 0
            fi
            if [ -n "$actual" ]; then
                printf 'Search attribute %s has type %s, expected %s; refusing to change it.\n' "$name" "$actual" "$expected" >&2
                exit 1
            fi
            if output=$(temporal operator search-attribute create --namespace default --name "$name" --type "$expected" 2>&1); then
                echo "Created search attribute $name ($expected)."
            else
                printf 'Waiting to reconcile search attribute %s: %s\n' "$name" "$output"
            fi
        else
            printf 'Waiting for default namespace search attributes: %s\n' "$attributes"
        fi
        sleep "$POLL_INTERVAL_SECONDS"
    done
}

ensure_attribute ProjectId Keyword
ensure_attribute ProjectVersion Int
echo "Temporal default namespace and search attributes are ready."
