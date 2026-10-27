// M45k: history rows use the compendium entry layout (padded title row, label/value facts).

import { test, assert } from './harness.mjs';
import { readFileSync } from 'node:fs';


import { entryFromSummary, normalize } from '../src/save/save.js';



