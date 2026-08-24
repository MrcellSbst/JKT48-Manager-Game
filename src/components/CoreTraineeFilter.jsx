import React from 'react';
import { CORE_TRAINEE_FILTERS } from '../engine/memberFilter.js';

const LABELS = Object.freeze({ all: 'All members', core: 'Core', trainee: 'Trainee' });

/** Controlled Core/Trainee selector shared by roster-style member lists. */
export function CoreTraineeFilter({ value = 'all', onChange, label = 'Roster status', id = 'core-trainee-filter', translate = (value) => value }) {
  return (
    <label htmlFor={id}>
      <span>{translate(label)}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange?.(event.target.value, event)}
      >
        {CORE_TRAINEE_FILTERS.map((filter) => (
          <option key={filter} value={filter}>{translate(LABELS[filter])}</option>
        ))}
      </select>
    </label>
  );
}

export default CoreTraineeFilter;
