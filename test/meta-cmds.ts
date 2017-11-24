'use strict';

import { expect } from 'chai';
import { metaCmds } from '../src/meta';
import { makeCommandSets } from '../src/cmd';

// ensure the meta-commands compile correctly.
const metaCmdSets = makeCommandSets(metaCmds);
expect(metaCmdSets).to.be.an('object');
