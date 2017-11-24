'use strict';

let next_node_id = 1; // globally unique node id.

export type ValueNode = SymbolNode | NumberNode | TextNode | TupleNode | IndexNode | ListOfNode;
export type ValueMap = Map<string, ValueNode>;
export type ValueList = Array<ValueNode>;
export type CollectionMap = Map<string, IndexNode | ListOfNode>;

export class SymbolNode {
  type: 'Symbol' = 'Symbol';
  id: string;
  constructor(public name: string) {
    this.id = 'Text:'+(next_node_id++);
  }
}

export class NumberNode {
  type: 'Number' = 'Number';
  id: string;
  constructor(public value: number) {
    this.id = 'Number:'+(next_node_id++);
  }
}

export class TextNode {
  type: 'Text' = 'Text';
  id: string;
  constructor(public text: string) {
    this.id = 'Text:'+(next_node_id++);
  }
}

export class TupleNode {
  type: 'Tuple' = 'Tuple';
  id: string;
  fields: ValueMap = new Map();
  constructor(public tag: string = '') {
    this.id = ((tag+':')||'Tuple:')+(next_node_id++);
  }
  has(key: string) { return this.fields.has(key); }
  get(key: string) { return this.fields.get(key); } // can be undefined.
  set(key: string, val: ValueNode) { this.fields.set(key, val); }
  add(key: string, val: ValueNode) { return this.fields.has(key) ? false : (this.fields.set(key, val), true); }
}

export class IndexNode {
  type: 'Index' = 'Index';
  id: string;
  items: ValueMap = new Map();
  constructor(public name: string, public keyField: string, public valField: string, public duplicate: string) {
    this.id = 'Index:'+(next_node_id++);
  }
  has(key: string) { return this.items.has(key); }
  get(key: string) { return this.items.get(key); } // can be undefined.
  add(key: string, val: ValueNode) {
    console.log(`+ adding '${key}' to '${this.id}'`);
    return this.items.has(key) ? false : (this.items.set(key, val), true); }
}

export class ListOfNode {
  type: 'ListOf' = 'ListOf';
  id: string;
  constructor(public items: ValueList = []) {
    this.id = 'ListOf:'+(next_node_id++);
  }
  has(item: ValueNode) { return this.items.indexOf(item) !== -1; }
  get(pos: number) { return this.items[pos]; } // can be undefined.
  add(item: ValueNode) { this.items.push(item); }
}
