import { useState } from 'react';

type SetStateAction<T> = T | ((prevState: T) => T);

/**
 * Like useState, but syncs internal state when the controlled value (prop) changes.
 * Use when state should be reset to the defaultValue when it changes (f.e. controlled state pattern
 * @see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
 */
export const useControllableState = <T>(
  controlledValue: T,
): [T, (value: SetStateAction<T>) => void] => {
  const [internalState, setInternalState] = useState<T>(controlledValue);

  // Track previous controlled value to detect external changes

  const [prevControlledValue, setPrevControlledValue] =
    useState(controlledValue);

  // Sync internal state when controlled value changes (no useEffect needed)
  if (controlledValue !== prevControlledValue) {
    setInternalState(controlledValue);
    setPrevControlledValue(controlledValue);
  }

  return [internalState, setInternalState];
};
