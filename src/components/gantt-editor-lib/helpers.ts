import type { GanttEditorSlotWithUiAttributes } from "./chart/types";

// Helper functions to safely parse values
export const tryParse = (value: string, defaultValue: {}) => {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
};

export const tryParseDate = (value: string | number | Date, defaultValue: any) => {
  if (!value) return defaultValue;
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? defaultValue : date;
  } catch {
    return defaultValue;
  }
};

export const isValue = (value: null | undefined) => {
  return value !== null && value !== undefined;
};

export const classFullname = (classChar: string | number) => {
  const classFullnames = {
    "F": "First Class",
    "C": "Business Class",
    "Y": "Economy Class",

    // FIRST_CLASS_CATEGORY	P, F, A
    // BUSINESS_CLASS_CATEGORY	J, C, D, I, Z
    // ECONOMY_CLASS_CATEGORY	W, S, Y, B, H, K, L, M, N, Q, T, V, X
    "P": "First Class",
    "A": "First Class",

    "J": "Business Class",
    "D": "Business Class",
    "I": "Business Class",
    "Z": "Business Class",

    "W": "Economy Class",
    "S": "Economy Class",
    "B": "Economy Class",
    "H": "Economy Class",
    "K": "Economy Class",
    "L": "Economy Class",
    "M": "Economy Class",
    "N": "Economy Class",
    "Q": "Economy Class",
    "T": "Economy Class",
    "V": "Economy Class",
    "X": "Economy Class",
  };
  if (classFullnames[classChar as keyof typeof classFullnames]) {
    return classFullnames[classChar as keyof typeof classFullnames];
  } else {
    // console.warn(`No full name found for class ${classChar}`);
    return null;
  }
}


export function textSize(inputText: string | any[]) {
  return { width: 7.2 * inputText.length, height: 100 };
}


export function jsObjectToHtmlTable(obj: { [s: string]: unknown; } | ArrayLike<unknown> | null | undefined) {

  // Handle non-object types
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj !== 'object') return String(obj);

  // Create table style
  const tableStyle = `
    border-collapse: collapse;
    font-family: system-ui, sans-serif;
    font-size: 12px;
    background: white;
  `;

  const cellStyle = `
    border: 1px solid #ddd;
    padding: 4px 4px;
    text-align: left;
  `;

  const headerStyle = `
    ${cellStyle}
    font-weight: bold;
    background: #f5f5f5;
  `;

  // Convert Date objects to readable strings
  function formatValue(value: unknown) {
    if (value instanceof Date) {
      return value.toLocaleString();
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  }

  // Create table rows from object
  const rows = Object.entries(obj).map(([key, value]) => `
    <tr>
      <th style="${headerStyle}">${key}</th>
      <td style="${cellStyle}">${formatValue(value)}</td>
    </tr>
  `).join('');

  // Return complete HTML table
  return `
    <table style="${tableStyle}">
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/** 
 * @param { "unallocated" | "not-opened" | "opened" | "conflict" | "inactive" } state
 */
export function mapSlotStateToColor(state: string) {

  const colors = {
    "unallocated": "#b1b1b1",
    "not-opened": "#738732",
    "opened": "#ffcd50",
    "conflict": "#c34673",
    "inactive": "#b1b1b1",
  };
  if (!colors[state as keyof typeof colors]) {
    console.warn(`No color found for state ${state}`);
    return undefined;
  }
  return colors[state as keyof typeof colors];
}

export function criteriaToString(criteria: { criteria: string, values: string[] }[]) {
  return criteria.map(c => `${c.criteria}: ${c.values.join(', ')}`).join(', ');
}

// export function allocationToStringShort(allocation: AllocationData) {
//   if (allocation.criterias.length === 0) {
//     return `${allocation.flight.carrierDesignator}${allocation.flight.number}`;
//   }
//   const criteriaString = allocation.criterias.map(c => c.values.join(',')).join(' | ');
//   return `${allocation.flight.carrierDesignator}${allocation.flight.number} | ${criteriaString}`;
// }

export function mapSlotToStateColor(slot: GanttEditorSlotWithUiAttributes) {
  if (slot.destinationId === "UNALLOCATED") {
    return mapSlotStateToColor("unallocated");
  }

  if (slot.isConflict) {
    return mapSlotStateToColor("conflict");
  }

  const currentTime = new Date().getTime();
  const openTime = new Date(slot.openTime).getTime();
  
  if (currentTime > openTime) {
    return mapSlotStateToColor("opened");
  }
  return mapSlotStateToColor("not-opened");
}