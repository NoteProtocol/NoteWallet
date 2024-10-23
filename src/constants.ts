export const NOTE_PROTOCOL_ENVELOPE_ID = "NOTE";

// 4d xx yy bytes
export const MAX_SCRIPT_ELEMENT_SIZE = 520;
// 4c zz bytes
export const MAX_STANDARD_STACK_ITEM_SIZE = 80;
export const MAX_DATA_SEGMENTS = 5;
// The maximum number of data segments is now within 100K
export const MAX_DATA_SEGMENTS_LIMIT = 190;

export const MAX_SCRIPT_FULL_SIZE = MAX_SCRIPT_ELEMENT_SIZE * MAX_DATA_SEGMENTS;
export const MAX_STACK_FULL_SIZE =
  MAX_STANDARD_STACK_ITEM_SIZE * MAX_DATA_SEGMENTS;

export const MAX_SEQUENCE = 0xffffffff;
export const MAX_LOCKTIME = 0xffffffff;
// Minimum number of satoshis required in a transaction output
export const MIN_SATOSHIS: number = 546;
