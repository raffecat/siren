'use strict';

let next_node_id = 1; // globally unique node id.

// export const readyQueue: Array<Task> = [];

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
  val() { return this; }
  equals(other: ValueNode) {
    return other.type === 'Symbol' && this.name === other.name;
  }
}

export class NumberNode {
  type: 'Number' = 'Number';
  id: string;
  constructor(public value: number) {
    this.id = 'Number:'+(next_node_id++);
  }
  val() { return this; }
  equals(other: ValueNode) {
    return other.type === 'Number' && this.value === other.value;
  }
}

export class TextNode {
  type: 'Text' = 'Text';
  id: string;
  constructor(public text: string) {
    this.id = 'Text:'+(next_node_id++);
  }
  val() { return this; }
  equals(other: ValueNode) {
    return other.type === 'Text' && this.text === other.text;
  }
}

export class TupleNode {
  type: 'Tuple' = 'Tuple';
  id: string;
  fields: ValueMap = new Map();
  constructor(public tag: string = '') {
    this.id = ((tag+':')||'Tuple:')+(next_node_id++);
  }
  val() { return this; }
  has(key: string) { return this.fields.has(key); }
  get(key: string) { return this.fields.get(key); } // can be undefined.
  set(key: string, val: ValueNode) { this.fields.set(key, val); }
  add(key: string, val: ValueNode) { return this.fields.has(key) ? false : (this.fields.set(key, val), true); }
  equals(other: ValueNode) {
    if (other.type === 'Tuple') {
      if (this.fields.size === other.fields.size) {
        for (const [name,value] of this.fields) {
          const comp = other.get(name);
          if (comp == null || !value.val().equals(comp.val())) {
            return false; // field is missing, or value is not equal.
          }
        }
        return true; // all fields are equal.
      }
    }
    return false; // wrong type or number of fields.
  }
}

export class IndexNode {
  type: 'Index' = 'Index';
  id: string;
  items: ValueMap = new Map();
  constructor(public name: string, public keyField: string, public valField: string, public duplicate: string) {
    this.id = 'Index:'+(next_node_id++);
  }
  val() { return this; }
  has(key: string) { return this.items.has(key); }
  get(key: string) { return this.items.get(key); } // can be undefined.
  add(key: string, val: ValueNode) {
    console.log(`+ adding '${key}' to '${this.id}'`);
    return this.items.has(key) ? false : (this.items.set(key, val), true);
  }
  val_map(): ValueMap {
    const result:ValueMap = new Map();
    for (const [name,ref] of this.items) {
      result.set(name, ref.val());
    }
    return result;
  }
  equals(other: ValueNode) {
    return false;
  }
}

export class ListOfNode {
  type: 'ListOf' = 'ListOf';
  id: string;
  constructor(public items: ValueList = []) {
    this.id = 'ListOf:'+(next_node_id++);
  }
  val() { return this; }
  get(pos: number) { return this.items[pos]; } // can be undefined.
  add(item: ValueNode) { this.items.push(item); }
  contains(item: ValueNode) {
    const other = item.val();
    for (const elem of this.items) {
      if (elem.val().equals(other)) {
        return true; // found match.
      }
    }
    return false;
  }
  val_list(): ValueList {
    return this.items.map(x => x.val());
  }
  equals(other: ValueNode) {
    return false;
  }
}

/*
export abstract class Task {
  // task waiting on one or more Ref instances to resolve.
  readonly name: string;
  wait: number = 0;
  closed: boolean = false;
  close() {
    if (this.closed) throw new Error("attempt to close a task more than once");
    this.closed = true;
    if (this.wait === 0) {
      // this task does not need to wait for any Refs.
      readyQueue.push(task);
    }
  }
  runTask(): void {}
}

export class RefNode {
  // reference that resolves to a ValueNode later.
  type: 'Ref' = 'Ref';
  private waiting: Task[]|null = null;
  constructor(
    private to: ValueNode|null = null
  ){}
  val(): ValueNode {
    const to = this.to;
    if (to === null) throw new Error("attempt to read an unresolved ref");
    return to;
  }
  wait(task: Task) {
    // the task cannot wait on a ref if it has already been closed.
    if (task.closed) throw new Error("closed task cannot wait on new refs: ${task.name}");
    if (this.to === null) {
      // task must wait until this ref is resolved.
      task.wait += 1;
      // this ref must also decrement the count when it becomes resolved.
      if (this.waiting === null) this.waiting = [ task ];
      else this.waiting.push(task);
    }
  }
  resolve(result: ValueNode) {
    // NB. result cannot be an unresolved ref!
    if (this.to !== null) throw new Error("attempt to resolve a ref more than once");
    this.to = result;
    for (const task of this.waiting) {
      // tasks must be closed before the refs they wait on become resolved.
      if (!task.closed) throw new Error(`ref was resolved before task was closed: ${task.name}`);
      task.wait -= 1;
      if (task.wait === 0) {
        // all Refs this task is waiting for are ready.
        readyQueue.push(task);
      }
    }
    this.waiting.length = 0; // clear.
  }
}
*/
