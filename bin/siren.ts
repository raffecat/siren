#!/usr/bin/env ts-node
import { command } from '../src/siren';
command(Array.prototype.slice.call(process.argv,2));
