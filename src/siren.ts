#!/usr/bin/env node
'use strict';

import fs = require('fs');
import Parser from './parser';
import { makeCommandSets, CommandSetMap, CommandMap } from './cmd';
import { CollectionMap, IndexNode } from './ast';
import { metaCmds } from './meta';

function error(msg: string) {
  throw new Error(msg);
}

function read_text(filename: string) {
  return fs.readFileSync(filename, "utf8");
}

function compile(filename: string, cmdSets: CommandSetMap, argSet: CommandMap) {
  const text = read_text(filename);
  const ast = parse(text, cmdSets, argSet, filename);
  console.log(JSON.stringify(ast,null,2));
}

function main(files: Array<string>) {
  const metaCmdSets = makeCommandSets(metaCmds);
  const collections = new Map([
    ['cmd-sets', new IndexNode('cmd-sets', 'name', 'cmds', "duplicate command-set name '{name}'")],
    ['args-set', new IndexNode('args-set', 'name', '', "duplicate argument-pattern name '{name}'")],
  ]);
  const top = (new Parser(read_text('demo/ast.siren'), metaCmdSets, {}, 'ast.siren', collections)).parse();
  console.log(JSON.stringify(top,null,2));
  const cmdSets = top.get('cmd-sets') || error("erk");
  const argSet = top.get('args-set') || error("fie");
  if (files.length < 1) {
    console.log("usage: siren [in-file]");
    return;
  }
  for (let filename of files) {
    compile(filename, cmdSets, argSet);
  }
}

main(Array.prototype.slice.call(process.argv,2))
